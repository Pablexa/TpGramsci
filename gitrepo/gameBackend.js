import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';

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
            tiedPlayers: [],
            tieBreakerChoices: {},
            currentQuestionData: null  // store for rejoin
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

    socket.on('joinRoom', (data, callback) => {
        const { roomId, name, avatar, groupId, sessionId } = data;
        const room = rooms.get(roomId.toUpperCase());
        
        if (!room) return callback({ success: false, message: 'La sala no existe.' });
        if (room.state !== 'LOBBY') return callback({ success: false, message: 'La partida ya comenzó.' });

        const sid = sessionId || socket.id;

        const newPlayer = {
            id: socket.id,
            sessionId: sid,
            name: name.substring(0, 15),
            avatar: avatar,
            groupId: groupId,
            score: 0,
            currentAnswer: null,
            timeTaken: 0,
            streak: 0,
            isEliminated: false,
            lastScoreChange: 0,
            abilities: {
                protector: true,
                fiftyfifty: true,
                double: true
            },
            roundAbilities: {} 
        };

        room.players[sid] = newPlayer;
        socket.join(roomId.toUpperCase());
        callback({ success: true, player: newPlayer });
        broadcastRoomUpdate(roomId.toUpperCase());
    });

    socket.on('rejoinRoom', (data, callback) => {
        const { roomId, sessionId } = data;
        if (!roomId || !sessionId) return callback({success: false});
        const room = rooms.get(roomId.toUpperCase());
        if(room && room.players[sessionId]) {
            // Update socket id for this player
            room.players[sessionId].id = socket.id; 
            socket.join(roomId.toUpperCase());
            
            // Send current state back to reconnecting player
            const response = { 
                success: true, 
                player: room.players[sessionId], 
                roomState: room.state 
            };
            callback(response);
            
            // Re-send current question data if mid-game
            if (room.currentQuestionData) {
                socket.emit('questionData', room.currentQuestionData);
            }
            // Re-send room update so player syncs
            broadcastRoomUpdate(roomId.toUpperCase());
        } else {
            callback({ success: false });
        }
    });

    socket.on('submitAnswer', (data, callback) => {
        const { roomId, sessionId, answerIndex, timeRemaining } = data;
        const room = rooms.get(roomId);
        if (!room || room.state !== 'QUESTION') return callback({ success: false });

        const player = room.players[sessionId];
        if (player && !player.isEliminated && player.currentAnswer === null) {
            player.currentAnswer = answerIndex;
            const qTime = room.questions[room.currentQuestion]?.timeLimit || 15;
            player.timeTaken = qTime - timeRemaining; 
            callback({ success: true });
            io.to(room.hostId).emit('playerAction', { event: 'answered', id: player.id });
        } else {
            callback({ success: false });
        }
    });

    socket.on('activateAbility', (data, callback) => {
        const { roomId, sessionId, abilityName } = data;
        const room = rooms.get(roomId);
        if(!room || room.state !== 'QUESTION') return callback({ success: false });

        const p = room.players[sessionId];
        if (p && p.abilities[abilityName] && p.currentAnswer === null) {
            p.abilities[abilityName] = false; 
            p.roundAbilities[abilityName] = true; 
            
            if (abilityName === 'fiftyfifty') {
                const q = room.questions[room.currentQuestion];
                let wrongs = [0,1,2,3].filter(i => i !== q.correcta);
                wrongs.sort(() => Math.random() - 0.5);
                callback({ success: true, disable: [wrongs[0], wrongs[1]] });
            } else {
                callback({ success: true });
            }
        } else {
            callback({ success: false });
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            if (room.hostId === socket.id) {
                clearInterval(room.timerInterval);
                io.to(roomId).emit('roomClosed');
                rooms.delete(roomId);
            }
            // Don't remove players on disconnect — they may rejoin
        });
    });

    function broadcastRoomUpdate(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;
        const safeRoom = {
            ...room,
            questions: null,
            timerInterval: null,
            currentQuestionData: null  // don't leak to broadcast
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
            room.state = 'END';
            broadcastRoomUpdate(room.id);
            return;
        }

        const q = room.questions[room.currentQuestion];
        room.state = 'PREPARE_QUESTION';
        
        Object.values(room.players).forEach(p => { 
            p.currentAnswer = null; 
            p.roundAbilities = {};
        });

        // Store question data for rejoins (no options yet)
        room.currentQuestionData = { 
            text: q.texto, category: q.categoria, phase: q.fase 
        };

        broadcastRoomUpdate(room.id);
        io.to(room.id).emit('questionData', room.currentQuestionData);

        startTimer(room, 5, () => {
            room.state = 'QUESTION';
            
            // Now include options
            room.currentQuestionData = {
                text: q.texto, category: q.categoria, phase: q.fase, options: q.opciones
            };
            
            broadcastRoomUpdate(room.id);
            io.to(room.id).emit('questionData', room.currentQuestionData);

            startTimer(room, q.timeLimit || 15, () => {
                resolveQuestion(room);
            });
        });
    }

    function resolveQuestion(room) {
        room.state = 'REVEAL';
        clearInterval(room.timerInterval);  // ensure timer is stopped
        const q = room.questions[room.currentQuestion];
        
        Object.values(room.players).forEach(p => {
            if (p.isEliminated) return;
            
            p.lastScoreChange = 0;
            const double = p.roundAbilities.double ? 2 : 1;

            if (p.currentAnswer === q.correcta) {
                // Correct answer
                let pointsBase = 100 - (Math.floor(p.timeTaken) * 3);
                let safePoints = Math.max(25, pointsBase);
                let gain = (safePoints * double) + (p.streak * 10);
                
                p.score += gain;
                p.lastScoreChange = gain;
                p.streak += 1;
            } else {
                // Wrong answer or AFK
                let penalty = (-50) * double;
                
                // Softer penalty if AFK (didn't answer at all)
                if (p.currentAnswer === null) {
                    penalty = -25;
                    p.streak = 0;
                }
                // Protector de racha: blocks penalty AND preserves streak
                else if (p.roundAbilities.protector) {
                    penalty = 0;
                    // streak is preserved — that's the whole point
                }
                else {
                    p.streak = 0;
                }

                p.score += penalty;
                p.lastScoreChange = penalty;
                if (p.score < 0) p.score = 0;
            }
            p.roundAbilities = {};
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
            if (room.currentQuestion < room.questions.length) {
                const nextQ = room.questions[room.currentQuestion];
                if (nextQ.fase === 2 && !room.isFinalPhase) {
                    initiatePhase2(room);
                } else {
                    goToNextQuestion(room);
                }
            } else {
                // All questions done
                room.state = 'END';
                broadcastRoomUpdate(room.id);
            }
        }
    }

    function initiatePhase2(room) {
        room.isFinalPhase = true;
        const finalists = [];
        room.groups.forEach(g => {
             const groupPlayers = Object.values(room.players).filter(p => Number(p.groupId) === g.id && !p.isEliminated);
             if (groupPlayers.length > 0) {
                 const maxScore = Math.max(...groupPlayers.map(p => p.score));
                 const tops = groupPlayers.filter(p => p.score === maxScore);
                 finalists.push(...tops);
             }
        });

        room.finalists = finalists.map(f => f.sessionId);
        
        // If somehow no finalists (e.g., all at 0), keep everyone alive
        if (room.finalists.length === 0) {
            room.finalists = Object.keys(room.players);
        } else {
            Object.values(room.players).forEach(p => {
                 if (!room.finalists.includes(p.sessionId)) {
                     p.isEliminated = true;
                 }
            });
        }

        room.state = 'PHASE2_TRANSITION';
        broadcastRoomUpdate(room.id);

        setTimeout(() => {
             goToNextQuestion(room);
        }, 8000);
    }

  });
}
