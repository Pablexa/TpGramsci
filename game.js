const app = document.getElementById('app');
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode') || 'player'; 

const socket = window.io ? io() : null;

let currentRoom = null;
let currentQuestionData = null;
let currentRevealData = null;
let timerLeft = 0;
let localPlayer = null; 
let betAmount = 0;

if (!socket) {
    app.innerHTML = '<h1 style="color:white;text-align:center;margin-top:50px;">Error: Servidor no conectado.</h1>';
} else {
    socket.on('roomUpdate', (room) => {
        currentRoom = room;
        if (localPlayer) {
            localPlayer = room.players[localPlayer.id] || localPlayer;
        }
        render();
    });

    socket.on('questionData', (data) => {
        currentQuestionData = data;
        currentRevealData = null; // reset
        render();
    });

    socket.on('revealData', (data) => {
        currentRevealData = data;
        render();
    });

    socket.on('timerUpdate', (sec) => {
        timerLeft = sec;
        const ht = document.getElementById('host-timer-num');
        if (ht) ht.innerText = sec;
        const mt = document.getElementById('mob-timer-num');
        if (mt) mt.innerText = sec;
    });

    socket.on('roomClosed', () => {
        alert("La sala ha sido cerrada.");
        window.location.href = '/';
    });

    if (mode === 'host') {
        socket.emit('createRoom', {}, (res) => {
            render();
        });
    } else {
        render();
    }
}

// ------ RENDER DISPATCH ------
function render() {
    if (mode === 'host') renderHost();
    else renderPlayer();
}

// ------ HOST VIEWS ------
function renderHost() {
    if (!currentRoom) {
        app.innerHTML = `<div class="host-container"><h2 class="text-center" style="color:white;margin:auto;">Creando Sala...</h2></div>`;
        return;
    }
    switch(currentRoom.state) {
        case 'LOBBY': return hostLobby();
        case 'BETTING': return hostBetting();
        case 'QUESTION': return hostQuestion();
        case 'REVEAL': return hostReveal();
        case 'LEADERBOARD': return hostLeaderboard();
        case 'PHASE2_TRANSITION': return hostPhase2();
        case 'END': return hostEnd();
        default: return hostLobby();
    }
}

function hostLobby() {
    const playerCount = Object.keys(currentRoom.players).length;
    let groupsHTML = currentRoom.groups.map(g => {
        const players = Object.values(currentRoom.players).filter(p => Number(p.groupId) === g.id);
        const pList = players.map(p => `<div>${p.avatar} ${p.name}</div>`).join('');
        return `<div class="group-card">
                  <div class="group-title">${g.name} (${players.length}/6)</div>
                  <div class="player-list">${pList}</div>
                </div>`;
    }).join('');

    app.innerHTML = `
      <div class="host-container slide-up">
        <div class="top-bar">
            <h2>Guerra de Posiciones</h2>
            <div class="badge speaker-badge" style="margin:0; font-size:1.5rem;">Jugadores: ${playerCount}</div>
        </div>
        <div class="room-pin-text">PIN DE LA SALA</div>
        <div class="room-code-huge">${currentRoom.id}</div>
        
        <div class="lobby-groups">
            ${groupsHTML}
        </div>
        
        <div class="host-controls">
            <button class="btn-primary btn-large" onclick="startGame()" ${playerCount === 0 ? 'disabled' : ''}>
                INICIAR CLASE MAGISTRAL
            </button>
        </div>
      </div>
    `;
}

function hostBetting() {
    if (!currentQuestionData) return;
    app.innerHTML = `
      <div class="host-container slide-up" style="justify-content:center; align-items:center;">
        <div class="category-badge">Fase ${currentQuestionData.phase}</div>
        <h1 class="question-title">${currentQuestionData.category}</h1>
        <p style="color:var(--text-muted); font-size:1.5rem; margin-top:2rem;">Los jugadores están apostando su capital ideológico...</p>
        <div class="host-timer" id="host-timer-num">${timerLeft}</div>
      </div>
    `;
}

function hostQuestion() {
    if (!currentQuestionData || !currentQuestionData.options) return;
    app.innerHTML = `
      <div class="host-container">
        <h1 class="question-title">${currentQuestionData.text}</h1>
        <div class="host-timer" id="host-timer-num">${timerLeft}</div>
        <div class="answer-grid">
            <div class="answer-box color-0">▲ ${currentQuestionData.options[0]}</div>
            <div class="answer-box color-1">◆ ${currentQuestionData.options[1]}</div>
            <div class="answer-box color-2">● ${currentQuestionData.options[2]}</div>
            <div class="answer-box color-3">■ ${currentQuestionData.options[3]}</div>
        </div>
      </div>
    `;
}

function hostReveal() {
    if (!currentQuestionData || !currentRevealData) return;
    app.innerHTML = `
      <div class="host-container slide-up">
        <h1 class="question-title">${currentQuestionData.text}</h1>
        <div style="text-align:center; margin-bottom: 2rem;">
            <div class="badge speaker-badge">Opción Correcta</div>
        </div>
        <div class="answer-grid">
            ${currentQuestionData.options.map((opt, i) => `
                <div class="answer-box color-${i} ${i !== currentRevealData.correctIndex ? 'dimmed' : ''}">
                    ${['▲','◆','●','■'][i]} ${opt}
                </div>
            `).join('')}
        </div>
        <div class="box-glass p-3" style="max-width:1000px; margin: 0 auto; text-align:center;">
            <h3>Explicación Teórica</h3>
            <p>${currentRevealData.explicacion}</p>
        </div>
        <div class="host-controls">
            <button class="btn-primary" onclick="nextPhase()">Siguiente ›</button>
        </div>
      </div>
    `;
}

function hostLeaderboard() {
    let topPlayers = Object.values(currentRoom.players).sort((a,b) => b.credits - a.credits).slice(0,10);
    
    app.innerHTML = `
      <div class="host-container slide-up">
        <h2 class="section-title text-center">Hegemonía Actual</h2>
        <div class="box-glass" style="max-width:800px; margin:0 auto; width:100%; padding:2rem;">
            ${topPlayers.map((p, i) => `
                <div class="rank-item ${p.isEliminated ? 'eliminated' : ''}">
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <span style="font-size:1.5rem; font-weight:bold; color:var(--primary)">#${i+1}</span>
                        <span style="font-size:1.5rem;">${p.avatar} ${p.name} 
                            ${p.isEliminated ? '<small><i>(Crisis Absoluta)</i></small>' : ''}
                        </span>
                    </div>
                    <div style="font-size:1.5rem; font-weight:bold;">${p.credits} cr. ${p.streak > 1 ? ` <span style="color:#d89e00">🔥x${p.streak}</span>` : ''}</div>
                </div>
            `).join('')}
        </div>
        <div class="host-controls">
            <button class="btn-primary" onclick="nextPhase()">Siguiente ›</button>
        </div>
      </div>
    `;
}

function hostPhase2() {
    app.innerHTML = `
      <div class="host-container slide-up" style="justify-content:center; align-items:center;">
        <h1 class="room-code-huge" style="font-size:4rem; color:#d89e00;">CRISIS Y RESOLUCIÓN FINAL</h1>
        <p style="font-size:2rem; margin-top:2rem;color:white;text-align:center;">Sólo han sobrevivido los máximos exponentes de cada bloque.</p>
        <p style="font-size:1.5rem; color:var(--text-muted); margin-top:1rem;">Prepárense para la última fase...</p>
      </div>
    `;
}

function hostEnd() {
    let alive = Object.values(currentRoom.players).filter(p => !p.isEliminated);
    let top = alive.sort((a,b) => b.credits - a.credits)[0];

    app.innerHTML = `
      <div class="host-container slide-up" style="justify-content:center; align-items:center;">
        <h2 class="section-title">La Disputa por la Hegemonía ha finalizado</h2>
        ${top ? `
            <div class="box-glass text-center" style="padding: 4rem; margin-top:2rem; border-color:var(--primary);">
                <div style="font-size:5rem;">🏆</div>
                <h1 style="font-size:3rem; margin: 1rem 0;">${top.avatar} ${top.name}</h1>
                <p style="font-size:1.5rem; color:var(--text-muted);">Consenso logrado con ${top.credits} créditos</p>
            </div>
        ` : `
            <div class="box-glass text-center" style="padding: 4rem; margin-top:2rem;">
                <h1 style="font-size:2rem;">Nadie logró sobrevivir a la Crisis.</h1>
            </div>
        `}
      </div>
    `;
}

// ------ HOST CONTROLLERS ------
window.startGame = () => { socket.emit('startGame', currentRoom.id); }
window.nextPhase = () => { socket.emit('nextPhase', currentRoom.id); }


// ------ MOBILE VIEWS ------
function renderPlayer() {
    if (!localPlayer) return mobJoin();
    
    if (localPlayer.isEliminated) {
        app.innerHTML = `<div class="mobile-container"><div class="result-screen lose"><h1>💀 Crisis Absoluta</h1><p>Has sido eliminado del proyecto hegemónico por falta de créditos.</p></div></div>`;
        return;
    }

    if (!currentRoom) return mobJoin();

    switch(currentRoom.state) {
        case 'LOBBY': return mobLobby();
        case 'BETTING': return mobBetting();
        case 'QUESTION': return mobQuestion();
        case 'REVEAL': return mobReveal();
        case 'LEADERBOARD': return mobWait("Observa la pantalla principal...");
        case 'PHASE2_TRANSITION': return mobWait("¡Comienza la Final!");
        case 'END': return mobEnd();
        default: return mobJoin();
    }
}

function mobJoin() {
    app.innerHTML = `
      <div class="mobile-container slide-up">
        <div class="mobile-form box-glass p-3">
            <h2 class="text-center" style="color:var(--primary)">Unirse al Juego</h2>
            <input type="text" id="j-code" class="mobile-input" placeholder="PIN de la Sala" style="text-transform:uppercase; text-align:center; font-weight:bold; letter-spacing:3px;" maxlength="5">
            <input type="text" id="j-name" class="mobile-input" placeholder="Tu Nombre">
            <select id="j-avatar" class="mobile-select">
                <option value="🦊">🦊 Zorro (Astucia)</option>
                <option value="🦁">🦁 León (Fuerza)</option>
                <option value="🦉">🦉 Búho (Intelecto)</option>
                <option value="🔨">🔨 Martillo (Trabajo)</option>
                <option value="📚">📚 Libro (Cultura)</option>
            </select>
            <select id="j-group" class="mobile-select">
                <option value="1">Bloque Histórico</option>
                <option value="2">Sociedad Civil</option>
                <option value="3">Sociedad Política</option>
                <option value="4">Intelectuales Orgánicos</option>
                <option value="5">Hegemonía</option>
                <option value="6">Subalternos</option>
            </select>
            <button class="btn-primary" onclick="joinRoom()" style="margin-top:1rem;">Entrar</button>
        </div>
      </div>
    `;
}

function mobWait(msg) {
    app.innerHTML = `
        <div class="mobile-container slide-up">
            <div class="status-wait">
                <div style="font-size:3rem; margin-bottom:1rem;">⏳</div>
                <div>${msg}</div>
            </div>
        </div>
    `;
}

function mobLobby() { mobWait("¡Estás dentro!<p>Aguardando confirmación del Host...</p>"); }

function mobBetting() {
    if (localPlayer.currentBet > 0) return mobWait("Apuesta registrada.");

    app.innerHTML = `
      <div class="mobile-container slide-up">
        <h3 class="text-center">Preparación Teórica</h3>
        <p class="text-center" style="color:var(--text-muted)">Tienes ${localPlayer.credits} créditos.</p>
        
        <div class="box-glass p-3" style="text-align:center;">
            <div>Créditos a Apostar</div>
            <div class="bet-display" id="bet-value">${Math.max(1, Math.floor(localPlayer.credits * 0.5))}</div>
            <input type="range" class="credit-slider" id="bet-slider" min="1" max="${localPlayer.credits}" value="${Math.max(1, Math.floor(localPlayer.credits * 0.5))}" oninput="document.getElementById('bet-value').innerText = this.value; betAmount = parseInt(this.value);">
            <button class="btn-primary mobile-answer-btn color-bet" onclick="submitBet()" style="height:auto; padding:1.5rem; margin-top:1rem;">APOSTAR E IDEOLOGIZAR</button>
        </div>
        <div style="text-align:center; font-weight:bold; margin-top:1rem;" id="mob-timer-num">${timerLeft}</div>
      </div>
    `;
    betAmount = parseInt(document.getElementById('bet-slider').value);
}

function mobQuestion() {
    if (localPlayer.currentAnswer !== null) return mobWait("Respuesta enviada.");

    app.innerHTML = `
      <div class="mobile-container">
        <div style="text-align:center; font-weight:bold; margin-bottom:1rem; font-size:1.5rem;" id="mob-timer-num">${timerLeft}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; height:80vh;">
            <button class="mobile-answer-btn color-0" style="height:100%" onclick="submitAnswer(0)"></button>
            <button class="mobile-answer-btn color-1" style="height:100%" onclick="submitAnswer(1)"></button>
            <button class="mobile-answer-btn color-2" style="height:100%" onclick="submitAnswer(2)"></button>
            <button class="mobile-answer-btn color-3" style="height:100%" onclick="submitAnswer(3)"></button>
        </div>
      </div>
    `;
}

function mobReveal() {
    if (!currentRevealData) return;
    const correct = currentRevealData.correctIndex === localPlayer.currentAnswer;
    app.innerHTML = `
        <div class="mobile-container slide-up">
            <div class="result-screen ${correct ? 'win' : 'lose'}">
                <h1 style="font-size:3rem; margin-bottom:1rem;">${correct ? '¡Correcto!' : 'Incorrecto'}</h1>
                <p style="font-size:1.5rem;">${localPlayer.credits} Créditos Restantes</p>
                <div style="margin-top:2rem; font-size:1.2rem;">
                    ${correct ? `Ganaste el consenso: +${localPlayer.lastCreditChange}` : `Perdiste legitimidad: ${localPlayer.lastCreditChange}`}
                </div>
            </div>
        </div>
    `;
}

function mobEnd() {
    app.innerHTML = `
        <div class="mobile-container slide-up">
            <div class="status-wait">
                <div style="font-size:4rem; margin-bottom:1rem;">🏁</div>
                <div>Fin del Proyecto Hegemónico</div>
                <p>Observa la pantalla principal para ver al ganador de la Guerra de Posiciones.</p>
            </div>
        </div>
    `;
}


// ------ MOBILE CONTROLLERS ------
window.joinRoom = () => {
    const code = document.getElementById('j-code').value.toUpperCase();
    const name = document.getElementById('j-name').value;
    const avatar = document.getElementById('j-avatar').value;
    const group = document.getElementById('j-group').value;

    if (!code || !name) return alert("Completa los campos.");
    socket.emit('joinRoom', { roomId: code, name, avatar, groupId: group }, (res) => {
        if (res.success) {
            localPlayer = res.player;
            render();
        } else {
            alert(res.message);
        }
    });
}

window.submitBet = () => {
    if (!currentRoom || betAmount <= 0 || betAmount > localPlayer.credits) return;
    socket.emit('placeBet', { roomId: currentRoom.id, bet: betAmount }, (res) => {
         if (res.success) localPlayer.currentBet = betAmount; render();
    });
}

window.submitAnswer = (idx) => {
    if (!currentRoom) return;
    socket.emit('submitAnswer', { roomId: currentRoom.id, answerIndex: idx, timeRemaining: timerLeft }, (res) => {
         if (res.success) localPlayer.currentAnswer = idx; render();
    });
}
