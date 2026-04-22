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
                render();
            } else {
                sessionStorage.removeItem('gramsci_session');
                render();
            }
        });
    }

    socket.on('roomUpdate', (room) => {
        currentRoom = room;
        if (localPlayer && room.players) {
            const updated = room.players[localPlayer.sessionId];
            if (updated) {
                // Preserve local-only fields
                const savedMask = localPlayer.fiftyFiftyMask;
                localPlayer = updated;
                if (room.state !== 'PREPARE_QUESTION') {
                    localPlayer.fiftyFiftyMask = savedMask;
                } else {
                    localPlayer.fiftyFiftyMask = null;
                }
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
            if (res.success) {
                // Room created, wait for roomUpdate
            }
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
    const qNum = (currentRoom ? currentRoom.currentQuestion + 1 : '?');
    app.innerHTML = `
      <div class="host-container slide-up" style="justify-content:center; align-items:center;">
        <div class="category-badge">Pregunta ${qNum} — ${currentQuestionData.category}</div>
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
    
    // Count how many got it right vs wrong
    const players = currentRoom ? Object.values(currentRoom.players).filter(p => !p.isEliminated) : [];
    const correctCount = players.filter(p => p.currentAnswer === currentRevealData.correctIndex).length;
    const totalAnswered = players.filter(p => p.currentAnswer !== null).length;
    
    app.innerHTML = `
      <div class="host-container slide-up">
        <h1 class="question-title">${currentQuestionData.text}</h1>
        <div style="text-align:center; margin-bottom: 1rem;">
            <div class="badge speaker-badge">✅ ${correctCount}/${totalAnswered} acertaron</div>
        </div>
        <div class="answer-grid">
            ${currentQuestionData.options.map((opt, i) => `
                <div class="answer-box color-${i} ${i !== currentRevealData.correctIndex ? 'dimmed' : ''}">
                    ${['▲','◆','●','■'][i]} ${opt}
                </div>
            `).join('')}
        </div>
        <div class="box-glass p-3 explain-box" style="max-width:1000px; margin: 0 auto; text-align:center; cursor:pointer;" onclick="expandExplanation()">
            <h3>Explicación Teórica <span style="font-size:0.8rem; color:var(--text-muted);">(click para expandir)</span></h3>
            <p>${currentRevealData.explicacion}</p>
        </div>
        <div id="explain-overlay" class="explain-overlay hidden" onclick="closeExplanation(event)">
            <div class="explain-modal" onclick="event.stopPropagation()">
                <button class="explain-close" onclick="closeExplanation(event)">✕</button>
                <h2 style="color:var(--primary); margin-bottom:1.5rem;">Explicación Teórica</h2>
                <p style="font-size:1.4rem; line-height:1.8;">${currentRevealData.explicacion}</p>
            </div>
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
                            ${p.isEliminated ? '<small><i>(Eliminado)</i></small>' : ''}
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
    let allPlayers = Object.values(currentRoom.players);
    // If there was a final phase, show finalists ranking; otherwise show everyone
    let candidates = allPlayers.filter(p => !p.isEliminated);
    if (candidates.length === 0) candidates = allPlayers; // fallback
    let top = candidates.sort((a,b) => b.score - a.score)[0];

    // Top 3 podium
    let podium = [...candidates].sort((a,b) => b.score - a.score).slice(0, 3);

    app.innerHTML = `
      <div class="host-container slide-up" style="justify-content:center; align-items:center;">
        <h2 class="section-title">La Disputa por la Hegemonía ha finalizado</h2>
        ${top ? `
            <div class="box-glass text-center" style="padding: 3rem; margin-top:2rem; border-color:var(--primary);">
                <div style="font-size:5rem;">🏆</div>
                <h1 style="font-size:3rem; margin: 1rem 0;">${top.avatar} ${top.name}</h1>
                <p style="font-size:1.5rem; color:var(--text-muted);">Consenso absoluto con ${top.score} Puntos</p>
            </div>
            ${podium.length > 1 ? `
            <div style="display:flex; gap:1rem; margin-top:2rem; justify-content:center; flex-wrap:wrap;">
                ${podium.map((p, i) => `
                    <div class="box-glass text-center" style="padding:1.5rem; min-width:150px;">
                        <div style="font-size:2rem;">${['🥇','🥈','🥉'][i]}</div>
                        <div style="font-weight:bold; margin:0.5rem 0;">${p.avatar} ${p.name}</div>
                        <div style="color:var(--text-muted);">${p.score} Pts</div>
                    </div>
                `).join('')}
            </div>
            ` : ''}
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

window.expandExplanation = () => {
    const overlay = document.getElementById('explain-overlay');
    if (overlay) overlay.classList.remove('hidden');
}
window.closeExplanation = (e) => {
    e.stopPropagation();
    const overlay = document.getElementById('explain-overlay');
    if (overlay) overlay.classList.add('hidden');
}


function renderPlayer() {
    if (!localPlayer) return mobJoin();
    
    if (localPlayer.isEliminated && currentRoom && currentRoom.state !== 'END') {
        app.innerHTML = `<div class="mobile-container"><div class="result-screen lose"><h1>💀 Crisis Absoluta</h1><p>Has sido eliminado de la carrera hegemónica final.</p><p style="margin-top:1rem; color:var(--text-muted);">Observa la pantalla principal.</p></div></div>`;
        return;
    }

    if (!currentRoom) return mobWait("Sincronizando pantalla...");

    switch(currentRoom.state) {
        case 'LOBBY': return mobLobby();
        case 'PREPARE_QUESTION': return mobWait("¡Prepárate! Mira la pantalla del frente...");
        case 'QUESTION': return mobQuestion();
        case 'REVEAL': return mobReveal();
        case 'LEADERBOARD': return mobLeaderboard();
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
            <input type="text" id="j-name" class="mobile-input" placeholder="Tu Nombre" maxlength="15">
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
    if (!localPlayer) return;
    if (localPlayer.currentAnswer !== null) return mobWait("¡Respuesta registrada!<br>Aguardando...");

    // Abilities check
    const p = localPlayer;
    const abProt = p.abilities && p.abilities.protector;
    const abFift = p.abilities && p.abilities.fiftyfifty;
    const abDobl = p.abilities && p.abilities.double;
    const raProt = p.roundAbilities && p.roundAbilities.protector;
    const raFift = p.roundAbilities && p.roundAbilities.fiftyfifty;
    const raDobl = p.roundAbilities && p.roundAbilities.double;

    let btnProt = `<button class="ability-btn ${!abProt && !raProt ? 'consumed' : ''} ${raProt ? 'active-power' : ''}" onclick="useAbility('protector')" ${!abProt ? 'disabled' : ''}>🛡️ Racha</button>`;
    let btnFift = `<button class="ability-btn ${!abFift && !raFift ? 'consumed' : ''} ${raFift ? 'active-power' : ''}" onclick="useAbility('fiftyfifty')" ${!abFift ? 'disabled' : ''}>⚖️ 50/50</button>`;
    let btnDobl = `<button class="ability-btn ${!abDobl && !raDobl ? 'consumed' : ''} ${raDobl ? 'active-power' : ''}" onclick="useAbility('double')" ${!abDobl ? 'disabled' : ''}>⚔️ x2</button>`;

    let m = localPlayer.fiftyFiftyMask || [];

    app.innerHTML = `
      <div class="mobile-container">
        
        <div style="display:flex; justify-content:space-between; gap:0.5rem; margin-bottom:1rem;">
            ${btnProt}
            ${btnFift}
            ${btnDobl}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
           <span style="color:var(--primary); font-weight:bold;">${localPlayer.score} Pts</span>
           <div style="font-weight:bold; font-size:1.5rem;" id="mob-timer-num">${timerLeft}</div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; height:65vh;">
            <button class="mobile-answer-btn color-0 ${m.includes(0) ? 'erased' : ''}" onclick="submitAnswer(0)" ${m.includes(0) ? 'disabled' : ''}></button>
            <button class="mobile-answer-btn color-1 ${m.includes(1) ? 'erased' : ''}" onclick="submitAnswer(1)" ${m.includes(1) ? 'disabled' : ''}></button>
            <button class="mobile-answer-btn color-2 ${m.includes(2) ? 'erased' : ''}" onclick="submitAnswer(2)" ${m.includes(2) ? 'disabled' : ''}></button>
            <button class="mobile-answer-btn color-3 ${m.includes(3) ? 'erased' : ''}" onclick="submitAnswer(3)" ${m.includes(3) ? 'disabled' : ''}></button>
        </div>
      </div>
    `;
}

function mobReveal() {
    if (!currentRevealData || !localPlayer) return;
    const correct = currentRevealData.correctIndex === localPlayer.currentAnswer;
    const isGain = localPlayer.lastScoreChange >= 0;

    app.innerHTML = `
        <div class="mobile-container slide-up">
            <div class="result-screen ${correct ? 'win' : 'lose'}">
                <h1 style="font-size:3rem; margin-bottom:1rem;">${correct ? '¡Exacto!' : '¡Error!'}</h1>
                <p style="font-size:1.5rem;">Total: ${localPlayer.score} Puntos</p>
                <div style="margin-top:2rem; font-size:1.2rem; background: rgba(0,0,0,0.3); padding:1rem; border-radius:10px;">
                    ${isGain ? '+' : ''}${localPlayer.lastScoreChange} Puntos
                </div>
                ${localPlayer.streak >= 2 ? `<div style="margin-top:1rem; color:#d89e00; font-size:1.3rem;">🔥 Racha x${localPlayer.streak}</div>` : ''}
            </div>
        </div>
    `;
}

function mobLeaderboard() {
    if (!currentRoom || !localPlayer) return mobWait("Cargando ranking...");
    
    // Find player's rank
    const allPlayers = Object.values(currentRoom.players);
    const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex(p => p.sessionId === localPlayer.sessionId) + 1;
    
    app.innerHTML = `
        <div class="mobile-container slide-up">
            <div class="status-wait">
                <div style="font-size:3rem; margin-bottom:1rem;">📊</div>
                <div>Tu Posición: <span style="color:var(--primary); font-size:2rem;">#${myRank}</span></div>
                <div style="margin-top:1rem; font-size:2rem; color:var(--primary); font-weight:bold;">${localPlayer.score} Pts</div>
                ${localPlayer.streak >= 2 ? `<div style="margin-top:0.5rem; color:#d89e00;">🔥 Racha x${localPlayer.streak}</div>` : ''}
                <p>Mira la pantalla del frente para ver el ranking completo.</p>
            </div>
        </div>
    `;
}

function mobEnd() {
    sessionStorage.removeItem('gramsci_session');
    app.innerHTML = `
        <div class="mobile-container slide-up">
            <div class="status-wait">
                <div style="font-size:4rem; margin-bottom:1rem;">🏁</div>
                <div>Fin del Proyecto Hegemónico</div>
                <p style="margin-top:1rem; font-size:1.3rem;">Tu puntaje final: <strong style="color:var(--primary);">${localPlayer ? localPlayer.score : 0} Pts</strong></p>
                <p>Observa la pantalla principal para ver al intelectual supremo de la Guerra de Posiciones.</p>
            </div>
        </div>
    `;
}


window.joinRoom = () => {
    const code = document.getElementById('j-code').value.toUpperCase().trim();
    const name = document.getElementById('j-name').value.trim();
    const avatar = document.getElementById('j-avatar').value;
    const group = document.getElementById('j-group').value;

    if (!code || !name) return alert("Completa todos los campos.");
    if (code.length < 5) return alert("El PIN debe tener 5 letras.");
    
    const sessionId = Math.random().toString(36).substr(2, 9);

    socket.emit('joinRoom', { roomId: code, name, avatar, groupId: group, sessionId }, (res) => {
        if (res.success) {
            localPlayer = res.player;
            sessionStorage.setItem('gramsci_session', JSON.stringify({roomId: code, sessionId: sessionId}));
            render();
        } else {
            alert(res.message || "Error al unirse.");
        }
    });
}

window.useAbility = (ab) => {
    if (!currentRoom || !localPlayer) return;
    if (localPlayer.currentAnswer !== null) return;
    if (!localPlayer.abilities || !localPlayer.abilities[ab]) return;

    socket.emit('activateAbility', { roomId: currentRoom.id, sessionId: localPlayer.sessionId, abilityName: ab }, (res) => {
         if (res && res.success) {
             localPlayer.abilities[ab] = false;
             if (!localPlayer.roundAbilities) localPlayer.roundAbilities = {};
             localPlayer.roundAbilities[ab] = true;
             if (res.disable) {
                 localPlayer.fiftyFiftyMask = res.disable;
             }
             render();
         }
    });
}

window.submitAnswer = (idx) => {
    if (!currentRoom || !localPlayer) return;
    if (localPlayer.currentAnswer !== null) return; // prevent double-tap
    
    // Check if this option was erased by 50/50
    const mask = localPlayer.fiftyFiftyMask || [];
    if (mask.includes(idx)) return;
    
    socket.emit('submitAnswer', { roomId: currentRoom.id, sessionId: localPlayer.sessionId, answerIndex: idx, timeRemaining: timerLeft }, (res) => {
         if (res && res.success) {
             localPlayer.currentAnswer = idx; 
             render();
         }
    });
}
