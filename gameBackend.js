import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';

// Load questions from public/questions.json at runtime
// Given we run from webapp folder
const questionsPath = path.resolve('public/questions.json');
let questionsDB = [];
try {
  questionsDB = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
} catch (e) {
  console.error("No se pudo cargar questions.json", e);
}

const rooms = new Map();

const generateCode = () => {
    let code = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for ( let i = 0; i < 5; i++ ) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};

export function setupGameBackend(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // HOST ACTIONS
    socket.on('createRoom', (data, callback) => {
        const roomId = generateCode();
        const room = {
            id: roomId,
            hostId: socket.id,
            state: 'LOBBY',
            players: {},
            groups: [
                {id: 1, name: "Bloque Histórico"},
                {id: 2, name: "Sociedad Civil"},
                {id: 3, name: "Sociedad Política"},
                {id: 4, name: "Intelectuales Orgánicos"},
                {id: 5, name: "Hegemonía"},
                {id: 6, name: "Subalternos"}
            ],
            questions: questionsDB,
            currentQuestion: 0,
            timerInterval: null,
            timerLeft: 0,
            finalists: [],
            isFinalPhase: false,
            tiedPlayers: [], // For rock paper scissors
            tieBreakerChoices: {} 
        };
        rooms.set(roomId, room);
        socket.join(roomId);
        callback({ success: true, roomId });
        broadcastRoomUpdate(roomId);
    });

    socket.on('startGame', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.hostId === socket.id) {
            goToNextQuestion(room);
        }
    });

    socket.on('nextPhase', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.hostId === socket.id) {
            handleNextPhase(room, io);
        }
    });

    // PLAYER ACTIONS
    socket.on('joinRoom', (data, callback) => {
        const { roomId, name, avatar, groupId } = data;
        const room = rooms.get(roomId.toUpperCase());
        
        if (!room) {
            return callback({ success: false, message: 'La sala no existe.' });
        }
        if (room.state !== 'LOBBY') {
            return callback({ success: false, message: 'La partida ya comenzó.' });
        }

        // Check group limits (max 6)
        const playersInGroup = Object.values(room.players).filter(p => p.groupId === groupId).length;
        if (playersInGroup >= 6) {
           return callback({ success: false, message: 'El grupo está lleno (Máximo 6).' });
        }

        const newPlayer = {
            id: socket.id,
            name: name.substring(0, 15),
            avatar: avatar,
            groupId: groupId,
            credits: 100,
            currentBet: 0,
            currentAnswer: null,
            timeTaken: 0,
            streak: 0,
            isEliminated: false,
            lastCreditChange: 0
        };

        room.players[socket.id] = newPlayer;
        socket.join(roomId.toUpperCase());
        callback({ success: true, player: newPlayer });
        broadcastRoomUpdate(roomId.toUpperCase());
    });

    socket.on('placeBet', (data, callback) => {
        const { roomId, bet } = data;
        const room = rooms.get(roomId);
        if (!room || room.state !== 'BETTING') return;
        
        const player = room.players[socket.id];
        if (player && !player.isEliminated && bet <= player.credits && bet >= 0) {
            player.currentBet = bet;
            player.currentAnswer = null; // reset answer
            callback({ success: true });
            
            // Inform host that someone bet
            io.to(room.hostId).emit('playerAction', { event: 'betPlaced', id: socket.id });
        }
    });

    socket.on('submitAnswer', (data, callback) => {
        const { roomId, answerIndex, timeRemaining } = data;
        const room = rooms.get(roomId);
        if (!room || room.state !== 'QUESTION') return;

        const player = room.players[socket.id];
        if (player && !player.isEliminated && player.currentAnswer === null) {
            player.currentAnswer = answerIndex;
            player.timeTaken = 25 - timeRemaining; // assuming 25 is max
            callback({ success: true });
            io.to(room.hostId).emit('playerAction', { event: 'answered', id: socket.id });
        }
    });

    // Rock paper scissors logic
    socket.on('submitTieBreaker', (data) => {
        const { roomId, choice } = data; // rock, paper, scissors
        const room = rooms.get(roomId);
        if (room && room.state === 'TIE_BREAKER') {
            room.tieBreakerChoices[socket.id] = choice;
            io.to(room.hostId).emit('playerAction', { event: 'rpsChosen', id: socket.id });
            
            // Check if everyone has chosen
            if (Object.keys(room.tieBreakerChoices).length === room.tiedPlayers.length) {
                 resolveTieBreaker(room, io);
            }
        }
    });


    socket.on('disconnect', () => {
        // We will just let them stay in memory for now, or mark offline
        // In a school setting, disconnecting and reconnecting might be complex without session tokens
        // For simplicity, we just keep their score if they disconnect, they won't be able to answer
        rooms.forEach((room, roomId) => {
            if (room.players[socket.id]) {
                // If in lobby, remove them
                if (room.state === 'LOBBY') {
                    delete room.players[socket.id];
                    broadcastRoomUpdate(roomId);
                } else {
                    // Mark disconnected but keep state
                    room.players[socket.id].disconnected = true;
                }
            }
            if (room.hostId === socket.id) {
                // Host left, room closed
                io.to(roomId).emit('roomClosed');
                rooms.delete(roomId);
            }
        });
    });

    // --- Helper Functions in Scope ---
    function broadcastRoomUpdate(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;
        
        // Strip sensitive info (e.g. correct answers) before broadcasting to everyone
        const safeRoom = {
            ...room,
            questions: null,
            timerInterval: null // do not send interval object
        };
        io.to(roomId).emit('roomUpdate', safeRoom);
    }

    function startTimer(room, seconds, callback) {
        clearInterval(room.timerInterval);
        room.timerLeft = seconds;
        io.to(room.id).emit('timerUpdate', room.timerLeft);

        room.timerInterval = setInterval(() => {
            room.timerLeft -= 1;
            io.to(room.id).emit('timerUpdate', room.timerLeft);
            if (room.timerLeft <= 0) {
                clearInterval(room.timerInterval);
                callback();
            }
        }, 1000);
    }

    function goToNextQuestion(room) {
        if (room.currentQuestion >= room.questions.length) {
            // End of game
            room.state = 'END';
            broadcastRoomUpdate(room.id);
            return;
        }

        const q = room.questions[room.currentQuestion];
        room.state = 'BETTING';
        
        // Reset bets
        Object.values(room.players).forEach(p => { p.currentBet = 0; p.currentAnswer = null; });

        broadcastRoomUpdate(room.id);
        io.to(room.id).emit('questionData', { 
            text: q.texto, category: q.categoria, phase: q.fase 
        });

        startTimer(room, 10, () => {
            // Transition to QUESTION
            room.state = 'QUESTION';
            broadcastRoomUpdate(room.id);
            io.to(room.id).emit('questionData', {
                text: q.texto, category: q.categoria, phase: q.fase, options: q.opciones
            });

            startTimer(room, 25, () => {
                // Time up, go to Reveal
                resolveQuestion(room);
            });
        });
    }

    function resolveQuestion(room) {
        room.state = 'REVEAL';
        const q = room.questions[room.currentQuestion];
        
        Object.values(room.players).forEach(p => {
            if (p.isEliminated) return;
            
            p.lastCreditChange = 0;
            if (p.currentAnswer === q.correcta) {
                 p.credits += p.currentBet;
                 p.lastCreditChange = p.currentBet;
                 p.streak += 1;
            } else {
                 p.credits -= p.currentBet;
                 p.lastCreditChange = -p.currentBet;
                 p.streak = 0;
                 if (p.credits <= 0) {
                     p.credits = 0;
                     p.isEliminated = true;
                 }
            }
        });

        broadcastRoomUpdate(room.id);
        io.to(room.id).emit('revealData', {
            correctIndex: q.correcta,
            explicacion: q.explicacion
        });
    }

    function handleNextPhase(room, io) {
        if (room.state === 'REVEAL') {
            room.state = 'LEADERBOARD';
            broadcastRoomUpdate(room.id);
        } else if (room.state === 'LEADERBOARD') {
            room.currentQuestion += 1;

            // Check if we switch to Fase 2 or End Game
            if (room.currentQuestion < room.questions.length) {
                const nextQ = room.questions[room.currentQuestion];
                if (nextQ.fase === 2 && !room.isFinalPhase) {
                    initiatePhase2(room);
                } else {
                    goToNextQuestion(room);
                }
            } else {
                 checkForEndGameOrTie(room);
            }
        }
    }

    function initiatePhase2(room) {
        room.isFinalPhase = true;
        
        // Find best of each group
        const finalists = [];
        room.groups.forEach(g => {
             const groupPlayers = Object.values(room.players).filter(p => p.groupId === g.id && !p.isEliminated);
             if (groupPlayers.length > 0) {
                 const maxCredits = Math.max(...groupPlayers.map(p => p.credits));
                 const tops = groupPlayers.filter(p => p.credits === maxCredits);
                 finalists.push(...tops);
             }
        });

        room.finalists = finalists.map(f => f.id);
        
        // Eliminate everyone else so they only spectate
        Object.values(room.players).forEach(p => {
             if (!room.finalists.includes(p.id)) {
                 p.isEliminated = true;
             }
        });

        room.state = 'PHASE2_TRANSITION';
        broadcastRoomUpdate(room.id);

        setTimeout(() => {
             goToNextQuestion(room);
        }, 8000);
    }

    function checkForEndGameOrTie(room) {
         // Gather remaining alive finalists
         const alive = Object.values(room.players).filter(p => p.isEliminated === false && room.finalists.includes(p.id));
         
         if (alive.length === 0) {
             room.state = 'END';
             broadcastRoomUpdate(room.id);
             return;
         }

         const maxCredits = Math.max(...alive.map(p => p.credits));
         const winners = alive.filter(p => p.credits === maxCredits);

         if (winners.length > 1) {
             // TIE BREAKER needed
             room.tiedPlayers = winners.map(w => w.id);
             room.tieBreakerChoices = {};
             room.state = 'TIE_BREAKER';
             broadcastRoomUpdate(room.id);
             io.to(room.id).emit('startTieBreaker');
         } else {
             room.state = 'END';
             broadcastRoomUpdate(room.id);
         }
    }

    function resolveTieBreaker(room, io) {
        const p1Id = room.tiedPlayers[0];
        const p2Id = room.tiedPlayers[1]; // simplified to 2 players normally
        
        const c1 = room.tieBreakerChoices[p1Id];
        const c2 = room.tieBreakerChoices[p2Id];

        // R = rock, P = paper, S = scissors
        let winnerId = null;
        if (c1 === c2) {
            // Draw, repeat
            room.tieBreakerChoices = {};
            io.to(room.id).emit('tieBreakerDraw');
            return;
        }

        if (
            (c1 === 'R' && c2 === 'S') ||
            (c1 === 'P' && c2 === 'R') ||
            (c1 === 'S' && c2 === 'P')
        ) {
            winnerId = p1Id;
        } else {
            winnerId = p2Id;
        }

        // Eliminate loser just so there's one supreme winner
        const loserId = winnerId === p1Id ? p2Id : p1Id;
        if (room.players[loserId]) {
            room.players[loserId].isEliminated = true;
        }

        room.state = 'END';
        broadcastRoomUpdate(room.id);
    }

  });
}
