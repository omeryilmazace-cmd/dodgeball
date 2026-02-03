const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const fetchBtn = document.getElementById('fetchBtn');
const urlInput = document.getElementById('urlInput');
const resetBtn = document.getElementById('resetBtn');
const inputText = document.getElementById('inputText');
const loadingOverlay = document.getElementById('loadingOverlay');
const speedRange = document.getElementById('speedRange');
const statText = document.getElementById('statText');
const playbackControls = document.querySelector('.playback-controls');

let gameState = {
    players: [],
    activePlayers: new Set(),
    currentPlayerIdx: -1,
    receivedFromDir: '',
    throws: 0,
    history: [],
    isPlaying: false,
    speed: 50,
    scale: 1,
    offset: { x: 0, y: 0 },
    lastFrameTime: 0
};

const dirNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dirToIdx = { 'N': 0, 'NE': 1, 'E': 2, 'SE': 3, 'S': 4, 'SW': 5, 'W': 6, 'NW': 7 };

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    draw();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

fetchBtn.onclick = async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    loadingOverlay.classList.remove('hidden');
    try {
        const response = await fetch(url);
        const text = await response.text();
        inputText.value = text;
        startBtn.click();
    } catch (err) {
        alert("Fetch failed. Please check the URL or see console for CORS issues.");
        console.error(err);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
};

startBtn.onclick = () => {
    const data = inputText.value.trim().split(/\s+/);
    if (data.length < 2) return;

    let ptr = 0;
    let T = parseInt(data[ptr++]);
    let N = parseInt(data[ptr++]);

    if (T > 1000) { N = T; ptr = 1; }

    gameState.players = [];
    gameState.activePlayers = new Set();

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < N; i++) {
        const x = parseInt(data[ptr++]);
        const y = parseInt(data[ptr++]);
        if (isNaN(x) || isNaN(y)) break;
        gameState.players.push({ x, y, id: i + 1, active: true });
        gameState.activePlayers.add(i);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }

    gameState.receivedFromDir = data[ptr++];
    gameState.currentPlayerIdx = parseInt(data[ptr++]) - 1;
    gameState.throws = 0;
    gameState.history = [];
    gameState.isPlaying = true;

    const padding = 50;
    const worldW = (maxX - minX) || 1000;
    const worldH = (maxY - minY) || 1000;
    gameState.scale = Math.min((canvas.width - padding * 2) / worldW, (canvas.height - padding * 2) / worldH);
    if (isNaN(gameState.scale) || !isFinite(gameState.scale)) gameState.scale = 0.0001;

    gameState.offset = {
        x: (canvas.width / 2) - ((minX + maxX) / 2) * gameState.scale,
        y: (canvas.height / 2) - ((minY + maxY) / 2) * gameState.scale
    };

    playbackControls.style.display = 'flex';
    requestAnimationFrame(gameLoop);
};

function performSimulationStep() {
    const currIdx = gameState.currentPlayerIdx;
    const curr = gameState.players[currIdx];
    if (!curr) return false;

    curr.active = false;
    gameState.activePlayers.delete(currIdx);

    const startIdx = (dirToIdx[gameState.receivedFromDir] + 1) % 8;
    let foundTarget = -1;
    let foundMinDist = Infinity;

    for (let r = 0; r < 8; r++) {
        const sDir = dirNames[(startIdx + r) % 8];
        for (let i = 0; i < gameState.players.length; i++) {
            const p = gameState.players[i];
            if (!p.active) continue;

            const dx = p.x - curr.x;
            const dy = p.y - curr.y;
            let match = false;
            let dist = 0;

            if (sDir === 'N' && dx === 0 && dy > 0) { match = true; dist = dy; }
            else if (sDir === 'S' && dx === 0 && dy < 0) { match = true; dist = -dy; }
            else if (sDir === 'E' && dy === 0 && dx > 0) { match = true; dist = dx; }
            else if (sDir === 'W' && dy === 0 && dx < 0) { match = true; dist = -dx; }
            else if (sDir === 'NE' && dx > 0 && dy === dx) { match = true; dist = dx; }
            else if (sDir === 'SW' && dx < 0 && dy === dx) { match = true; dist = -dx; }
            else if (sDir === 'NW' && dx < 0 && dy === -dx) { match = true; dist = -dx; }
            else if (sDir === 'SE' && dx > 0 && dy === -dx) { match = true; dist = dx; }

            if (match && dist < foundMinDist) { foundMinDist = dist; foundTarget = i; }
        }
        if (foundTarget !== -1) break;
    }

    if (foundTarget !== -1) {
        gameState.throws++;
        gameState.history.push({ from: currIdx, to: foundTarget });
        const target = gameState.players[foundTarget];
        const rDx = curr.x - target.x, rDy = curr.y - target.y;
        if (rDx === 0 && rDy > 0) gameState.receivedFromDir = 'N';
        else if (rDx === 0 && rDy < 0) gameState.receivedFromDir = 'S';
        else if (rDx > 0 && rDy === 0) gameState.receivedFromDir = 'E';
        else if (rDx < 0 && rDy === 0) gameState.receivedFromDir = 'W';
        else if (rDx > 0 && rDy > 0) gameState.receivedFromDir = 'NE';
        else if (rDx < 0 && rDy < 0) gameState.receivedFromDir = 'SW';
        else if (rDx > 0 && rDy < 0) gameState.receivedFromDir = 'SE';
        else if (rDx < 0 && rDy > 0) gameState.receivedFromDir = 'NW';
        gameState.currentPlayerIdx = foundTarget;
        return true;
    }
    return false;
}

function gameLoop(timestamp) {
    if (!gameState.isPlaying) return;

    const speedVal = parseInt(speedRange.value);
    let stepsPerFrame = 1;
    let delay = 0;

    if (speedVal > 90) {
        stepsPerFrame = (speedVal - 90) * 5; // Up to 50 steps per frame
    } else {
        delay = 1000 - (speedVal * 11);
    }

    if (timestamp - gameState.lastFrameTime >= delay) {
        for (let i = 0; i < stepsPerFrame; i++) {
            if (!performSimulationStep()) {
                gameState.isPlaying = false;
                statText.innerText = `GAME OVER! Final Throws: ${gameState.throws} | Last Player: ${gameState.players[gameState.currentPlayerIdx].id}`;
                break;
            }
        }
        gameState.lastFrameTime = timestamp;
        if (gameState.isPlaying) {
            statText.innerText = `Throws: ${gameState.throws} | Current: Player ${gameState.players[gameState.currentPlayerIdx].id}`;
        }
        draw();
    }

    if (gameState.isPlaying) requestAnimationFrame(gameLoop);
}

function toScreen(x, y) {
    return {
        x: gameState.offset.x + x * gameState.scale,
        y: canvas.height - (gameState.offset.y + y * gameState.scale)
    };
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    const historyToDraw = gameState.history.slice(-15);
    historyToDraw.forEach((h, idx) => {
        const p1 = toScreen(gameState.players[h.from].x, gameState.players[h.from].y);
        const p2 = toScreen(gameState.players[h.to].x, gameState.players[h.to].y);
        ctx.strokeStyle = `rgba(99, 102, 241, ${(idx + 1) / historyToDraw.length})`;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    });

    gameState.players.forEach((p, idx) => {
        const s = toScreen(p.x, p.y);
        if (s.x < -10 || s.x > canvas.width + 10 || s.y < -10 || s.y > canvas.height + 10) return;
        ctx.beginPath();
        ctx.arc(s.x, s.y, idx === gameState.currentPlayerIdx ? 6 : (p.active ? 3 : 1), 0, Math.PI * 2);
        ctx.fillStyle = idx === gameState.currentPlayerIdx ? '#f43f5e' : (p.active ? '#6366f1' : '#1e293b');
        ctx.fill();
    });
}

resetBtn.onclick = () => { gameState.isPlaying = false; location.reload(); };
