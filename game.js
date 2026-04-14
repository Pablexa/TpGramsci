const app = document.getElementById('app');
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode') || 'player'; 

const socket = window.io ? io() : null;

let currentRoom = null;
let currentQuestionData = null;
let currentRevealData = null;
let timerLeft = 0;
let localPlayer = null; 

let storedSession = null;
try { storedSession = JSON.parse(sessionStorage.getItem('gramsci_session')); } catch(e){}

if (!socket) {
    app.innerHTML = '<h1 style="color:white;text-align:center;margin-top:50px;">Error: Servidor no conectado.</h1>';
} else {
    if (storedSession && mode === 'player') {
        socket.emit('rejoinRoom', storedSession, (res) => {
            if (res.success) {
                localPlayer = res.player;
            } else {
                sessionStorage.removeItem('gramsci_session');
            }
        });
    }

    socket.on('roomUpdate', (room) => {
        currentRoom = room;
        if (localPlayer) {
            localPlayer = room.players[localPlayer.sessionId] || localPlayer;
            if (room.state === 'PREPARE_QUESTION') {
                localPlayer.fiftyFiftyMask = null; // Clear old masks
            }
        }
        render();
    });

    socket.on('questionData', (data) => {
        currentQuestionData = data;
        currentRevealData = null;
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
        sessionStorage.removeItem('gramsci_session');
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

function render() {
    if (mode === 'host') renderHost();
    else renderPlayer();
}

function renderHost() {
    if (!currentRoom) {
        app.innerHTML = `<div class="host-container"><h2 class="text-center" style="color:white;margin:auto;">Creando Sala...</h2></div>`;
        return;
    }
    switch(currentRoom.state) {
        case 'LOBBY': return hostLobby();
        case 'PREPARE_QUESTION': return hostPrepare();
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
                INICIAR JUEGO
            </button>
        </div>
      </div>
    `;
}

function hostPrepare() {
    if (!currentQuestionData) return;
    app.innerHTML = `
      <div class="host-container slide-up" style="justify-content:center; align-items:center;">
        <div class="category-badge">${currentQuestionData.category}</div>
        <h1 class="question-title" style="margin-top:2rem;">${currentQuestionData.text}</h1>
        <p style="color:var(--text-muted); font-size:2rem; margin-top:2rem;">Prepárense para responder...</p>
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
    let playersList = Object.values(currentRoom.players);
    let topPlayers = [...playersList].sort((a,b) => b.score - a.score).slice(0,10);
    
    let groupTops = currentRoom.groups.map(g => {
        let pInGroup = playersList.filter(p => !p.isEliminated && Number(p.groupId) === g.id);
        if (pInGroup.length === 0) return null;
        return pInGroup.sort((a,b) => b.score - a.score)[0];
    }).filter(p => p !== null);

    const groupColors = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#8338ec', '#ff006e'];
    
    app.innerHTML = `
      <div class="host-container slide-up" style="overflow-y:auto; padding: 2rem 0;">
        <h2 class="section-title text-center" style="margin-bottom:1rem; font-size:2rem;">Líderes de Bloque</h2>
        <div style="display:flex; justify-content:center; gap:1rem; flex-wrap:wrap; margin-bottom: 2rem; max-width: 1200px; margin-left:auto; margin-right:auto;">
            ${groupTops.map((p) => `
                <div class="box-glass text-center" style="padding:1rem; border-bottom: 4px solid ${groupColors[(Number(p.groupId)-1)%6]}; min-width: 160px;">
                    <div style="font-size:2.5rem;">${p.avatar}</div>
                    <div style="font-weight:bold; margin:0.5rem 0; font-size: 1.2rem;">${p.name}</div>
                    <div style="color:var(--text-muted); font-size: 1.1rem;">${p.score} Pts</div>
                </div>
            `).join('')}
        </div>

        <h2 class="section-title text-center" style="margin-bottom:1rem; font-size:2rem;">Ranking Global</h2>
        <div class="box-glass" style="max-width:800px; margin:0 auto; width:100%; padding:2rem;">
            ${topPlayers.map((p, i) => `
                <div class="rank-item ${p.isEliminated ? 'eliminated' : ''}" style="border-left: 6px solid ${groupColors[(Number(p.groupId)-1)%6]}; padding-left: 1rem;">
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <span style="font-size:1.5rem; font-weight:bold; color:var(--primary)">#${i+1}</span>
                        <span style="font-size:1.5rem;">${p.avatar} ${p.name} 
                            ${p.isEliminated ? '<small><i>(Crisis)</i></small>' : ''}
                        </span>
                    </div>
                    <div style="font-size:1.5rem; font-weight:bold;">${p.score} Pts ${p.streak >= 2 ? ` <span style="color:#d89e00">🔥x${p.streak}</span>` : ''}</div>
                </div>
            `).join('')}
        </div>
        <div class="host-controls" style="margin-top:2rem;">
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
    let top = alive.sort((a,b) => b.score - a.score)[0];

    app.innerHTML = `
      <div class="host-container slide-up" style="justify-content:center; align-items:center;">
        <h2 class="section-title">La Disputa por la Hegemonía ha finalizado</h2>
        ${top ? `
            <div class="box-glass text-center" style="padding: 4rem; margin-top:2rem; border-color:var(--primary);">
                <div style="font-size:5rem;">🏆</div>
                <h1 style="font-size:3rem; margin: 1rem 0;">${top.avatar} ${top.name}</h1>
                <p style="font-size:1.5rem; color:var(--text-muted);">Consenso absoluto con ${top.score} Puntos</p>
            </div>
        ` : `
            <div class="box-glass text-center" style="padding: 4rem; margin-top:2rem;">
                <h1 style="font-size:2rem;">Nadie logró evitar la Crisis.</h1>
            </div>
        `}
      </div>
    `;
}

window.startGame = () => { socket.emit('startGame', currentRoom.id); }
window.nextPhase = () => { socket.emit('nextPhase', currentRoom.id); }


function renderPlayer() {
    if (!localPlayer) return mobJoin();
    
    if (localPlayer.isEliminated) {
        app.innerHTML = `<div class="mobile-container"><div class="result-screen lose"><h1>💀 Crisis Absoluta</h1><p>Has sido eliminado de la carrera hegemónica final.</p></div></div>`;
        return;
    }

    if (!currentRoom) return mobWait("Sincronizando pantalla...");

    switch(currentRoom.state) {
        case 'LOBBY': return mobLobby();
        case 'PREPARE_QUESTION': return mobWait("¡Prepárate! Mira la pantalla del frente...");
        case 'QUESTION': return mobQuestion();
        case 'REVEAL': return mobReveal();
        case 'LEADERBOARD': return mobWait("Observa los resultados en la pizarra...");
        case 'PHASE2_TRANSITION': return mobWait("¡Los campeones avanzan a la Final!");
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
                <option value="🦊">🦊 Zorro</option>
                <option value="🦁">🦁 León</option>
                <option value="🦉">🦉 Búho</option>
                <option value="🔨">🔨 Martillo</option>
                <option value="📚">📚 Libro</option>
                <option value="✊">✊ Lucha</option>
                <option value="🕊️">🕊️ Paz</option>
                <option value="🎭">🎭 Máscara</option>
                <option value="🧠">🧠 Intelecto</option>
                <option value="⚡">⚡ Rayo</option>
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
            <div style="margin-top:1.5rem; text-align:center; color:var(--primary); font-weight:bold;">
                 Tu Puntaje: ${localPlayer ? localPlayer.score : 0} Pts
                 ${localPlayer && localPlayer.streak >= 2 ? `<br><span style="color:#d89e00">🔥 Racha x${localPlayer.streak}</span>` : ''}
            </div>
        </div>
    `;
}

function mobLobby() { mobWait("¡Estás dentro!<p>Aguardando confirmación del Host...</p>"); }

function mobQuestion() {
    if (localPlayer.currentAnswer !== null) return mobWait("¡Respuesta registrada!<br>Aguardando...");

    // Abilities check
    const p = localPlayer;
    let btnProt = \`<button class="ability-btn \${!p.abilities.protector && !p.roundAbilities.protector ? 'consumed' : ''} \${p.roundAbilities.protector ? 'active-power' : ''}" onclick="useAbility('protector')" \${!p.abilities.protector ? 'disabled' : ''}>🛡️ Racha</button>\`;
    let btnFift = \`<button class="ability-btn \${!p.abilities.fiftyfifty && !p.roundAbilities.fiftyfifty ? 'consumed' : ''} \${p.roundAbilities.fiftyfifty ? 'active-power' : ''}" onclick="useAbility('fiftyfifty')" \${!p.abilities.fiftyfifty ? 'disabled' : ''}>⚖️ 50/50</button>\`;
    let btnDobl = \`<button class="ability-btn \${!p.abilities.double && !p.roundAbilities.double ? 'consumed' : ''} \${p.roundAbilities.double ? 'active-power' : ''}" onclick="useAbility('double')" \${!p.abilities.double ? 'disabled' : ''}>⚔️ x2</button>\`;

    let m = localPlayer.fiftyFiftyMask || [];

    app.innerHTML = `
      <div class="mobile-container">
        
        <div style="display:flex; justify-content:space-between; gap:0.5rem; margin-bottom:1rem;">
            \${btnProt}
            \${btnFift}
            \${btnDobl}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
           <span style="color:var(--primary); font-weight:bold;">\${localPlayer.score} Pts</span>
           <div style="font-weight:bold; font-size:1.5rem;" id="mob-timer-num">\${timerLeft}</div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; height:65vh;">
            <button class="mobile-answer-btn color-0 \${m.includes(0) ? 'erased' : ''}" onclick="submitAnswer(0)"></button>
            <button class="mobile-answer-btn color-1 \${m.includes(1) ? 'erased' : ''}" onclick="submitAnswer(1)"></button>
            <button class="mobile-answer-btn color-2 \${m.includes(2) ? 'erased' : ''}" onclick="submitAnswer(2)"></button>
            <button class="mobile-answer-btn color-3 \${m.includes(3) ? 'erased' : ''}" onclick="submitAnswer(3)"></button>
        </div>
      </div>
    `;
}

function mobReveal() {
    if (!currentRevealData) return;
    const correct = currentRevealData.correctIndex === localPlayer.currentAnswer;
    const isGain = localPlayer.lastScoreChange >= 0;

    app.innerHTML = `
        <div class="mobile-container slide-up">
            <div class="result-screen \${correct ? 'win' : 'lose'}">
                <h1 style="font-size:3rem; margin-bottom:1rem;">\${correct ? '¡Exacto!' : '¡Error!'}</h1>
                <p style="font-size:1.5rem;">Total: \${localPlayer.score} Puntos</p>
                <div style="margin-top:2rem; font-size:1.2rem; background: rgba(0,0,0,0.3); padding:1rem; border-radius:10px;">
                    \${isGain ? '+' : ''}\${localPlayer.lastScoreChange} Puntos Obtenidos
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
                <p>Observa la pantalla principal para ver al intelectual supremo de la Guerra de Posiciones.</p>
            </div>
        </div>
    `;
}


window.joinRoom = () => {
    const code = document.getElementById('j-code').value.toUpperCase();
    const name = document.getElementById('j-name').value;
    const avatar = document.getElementById('j-avatar').value;
    const group = document.getElementById('j-group').value;

    if (!code || !name) return alert("Completa los campos.");
    
    const sessionId = Math.random().toString(36).substr(2, 9);

    socket.emit('joinRoom', { roomId: code, name, avatar, groupId: group, sessionId }, (res) => {
        if (res.success) {
            localPlayer = res.player;
            sessionStorage.setItem('gramsci_session', JSON.stringify({roomId: code, sessionId: sessionId}));
            render();
        } else {
            alert(res.message);
        }
    });
}

window.useAbility = (ab) => {
    if (!currentRoom || localPlayer.currentAnswer !== null) return;
    if (!localPlayer.abilities[ab]) return;

    socket.emit('activateAbility', { roomId: currentRoom.id, sessionId: localPlayer.sessionId, abilityName: ab }, (res) => {
         if (res.success) {
             localPlayer.abilities[ab] = false;
             localPlayer.roundAbilities[ab] = true;
             if (res.disable) {
                 localPlayer.fiftyFiftyMask = res.disable;
             }
             render();
         }
    });
}

window.submitAnswer = (idx) => {
    if (!currentRoom) return;
    socket.emit('submitAnswer', { roomId: currentRoom.id, sessionId: localPlayer.sessionId, answerIndex: idx, timeRemaining: timerLeft }, (res) => {
         if (res.success) {
             localPlayer.currentAnswer = idx; 
             render();
         }
    });
}
