const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const highScoreElement = document.getElementById('high-score');
const overlay = document.getElementById('game-overlay');
const gameWrapper = document.querySelector('.game-wrapper');
const startBtn = document.getElementById('start-btn');
const gameMessage = document.getElementById('game-message');

// Speed Control UI
const speedControlPanel = document.getElementById('speed-control');
const speedValElement = document.getElementById('speed-val');
const speedDownBtn = document.getElementById('speed-down');
const speedUpBtn = document.getElementById('speed-up');

// Game State
let score = 0;
let highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
let level = 1;
let manualSpeedLevel = 1; // 1 to 5 (for levels 1-3)
let gameSpeed = 180;
let gameLoopTimeout;
let isGameRunning = false;
let changingDirection = false;

// Snake state
const GRID_SIZE = 20;
const TILE_COUNT = canvas.width / GRID_SIZE;
let snake = [];
let dx = 1;
let dy = 0;
let food = { x: 15, y: 15 };

// Particles
let particles = [];

// Audio Context
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Sound Synthesis Functions
function playOscillator(type, freq, duration, volume = 0.1) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playHiss() {
    if (!audioCtx || Math.random() > 0.05) return;
    const bufferSize = audioCtx.sampleRate * 0.2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1000;
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime);
    noise.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    noise.start();
}

function playEatSound() {
    playOscillator('sine', 600, 0.1, 0.1);
    setTimeout(() => playOscillator('sine', 800, 0.1, 0.1), 50);
}

function playGameOverSound() {
    playOscillator('sawtooth', 150, 0.5, 0.2);
    setTimeout(() => playOscillator('sawtooth', 100, 0.5, 0.2), 200);
}

function createParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
        particles.push({
            x: x * GRID_SIZE + GRID_SIZE / 2,
            y: y * GRID_SIZE + GRID_SIZE / 2,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.0,
            color: color
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
        ctx.globalAlpha = 1.0;
    });
}

function triggerShake() {
    gameWrapper.classList.add('shake');
    setTimeout(() => gameWrapper.classList.remove('shake'), 500);
}

function updateGameSpeed() {
    if (level <= 3) {
        gameSpeed = 180 - (manualSpeedLevel * 25);
        speedControlPanel.classList.remove('hidden');
        speedValElement.innerText = manualSpeedLevel;
    } else if (level <= 6) {
        gameSpeed = 90; // Medium
        speedControlPanel.classList.add('hidden');
    } else {
        gameSpeed = 60; // High
        speedControlPanel.classList.add('hidden');
    }
}

function updateScore() {
    scoreElement.innerText = score;
    levelElement.innerText = level;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snakeHighScore', highScore.toString());
    }
    highScoreElement.innerText = highScore;
}

function checkLevelUp() {
    let newLevel = Math.floor(score / 50) + 1;
    if (newLevel > 10) newLevel = 10;

    if (newLevel > level) {
        level = newLevel;
        playOscillator('square', 400, 0.2, 0.1);
        updateGameSpeed();
        updateScore();
    }
}

function resetGame() {
    score = 0;
    level = 1;
    manualSpeedLevel = 1;
    snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ];
    dx = 1;
    dy = 0;
    particles = [];
    updateGameSpeed();
    updateScore();
    placeFood();
}

function startGame() {
    initAudio();
    resetGame();
    isGameRunning = true;
    overlay.classList.add('hidden');
    gameLoop();
}

function gameLoop() {
    if (!isGameRunning) return;
    gameLoopTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
            update();
            draw();
            gameLoop();
        });
    }, gameSpeed);
}

function update() {
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };

    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
        playGameOverSound();
        triggerShake();
        gameOver("WALL COLLISION");
        return;
    }

    for (let i = 0; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            playGameOverSound();
            triggerShake();
            gameOver("SELF COLLISION");
            return;
        }
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        playEatSound();
        createParticles(food.x, food.y, '#00d4ff');
        checkLevelUp();
        updateScore();
        placeFood();
    } else {
        snake.pop();
        playHiss();
    }

    updateParticles();
    changingDirection = false;
}

const headImage = new Image();
headImage.src = 'snake-head.png';

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#111';
    for (let i = 0; i < TILE_COUNT; i++) {
        ctx.beginPath();
        ctx.moveTo(i * GRID_SIZE, 0); ctx.lineTo(i * GRID_SIZE, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * GRID_SIZE); ctx.lineTo(canvas.width, i * GRID_SIZE);
        ctx.stroke();
    }

    ctx.shadowBlur = 20; ctx.shadowColor = "#00d4ff";
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.roundRect(food.x * GRID_SIZE + 2, food.y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    snake.forEach((segment, index) => {
        if (index === 0) {
            ctx.save();
            ctx.shadowBlur = 15; ctx.shadowColor = "#00ff88";
            const cx = segment.x * GRID_SIZE + GRID_SIZE / 2;
            const cy = segment.y * GRID_SIZE + GRID_SIZE / 2;
            ctx.translate(cx, cy);
            let angle = 0;
            if (dx === 1) angle = 0; else if (dx === -1) angle = Math.PI;
            else if (dy === 1) angle = Math.PI / 2; else if (dy === -1) angle = -Math.PI / 2;
            ctx.rotate(angle);
            ctx.drawImage(headImage, -GRID_SIZE / 2, -GRID_SIZE / 2, GRID_SIZE, GRID_SIZE);
            ctx.restore();
        } else {
            const alpha = 1 - (index / snake.length) * 0.6;
            ctx.shadowBlur = 10; ctx.shadowColor = `rgba(0, 255, 136, ${alpha})`;
            ctx.fillStyle = `rgba(0, 255, 136, ${alpha})`;
            ctx.beginPath();
            ctx.roundRect(segment.x * GRID_SIZE + 1, segment.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2, 4);
            ctx.fill();
        }
    });
    ctx.shadowBlur = 0;
    drawParticles();
}

function placeFood() {
    food = { x: Math.floor(Math.random() * TILE_COUNT), y: Math.floor(Math.random() * TILE_COUNT) };
    if (snake.some(s => s.x === food.x && s.y === food.y)) placeFood();
}

function gameOver(reason) {
    isGameRunning = false;
    clearTimeout(gameLoopTimeout);
    gameMessage.innerText = reason || "GAME OVER";
    startBtn.innerText = "TRY AGAIN";
    overlay.classList.remove('hidden');
}

// Controls
document.addEventListener('keydown', (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' && !isGameRunning) { startGame(); return; }
    if (changingDirection || !isGameRunning) return;

    if (e.key === 'ArrowUp' && dy !== 1) { dx = 0; dy = -1; changingDirection = true; }
    else if (e.key === 'ArrowDown' && dy !== -1) { dx = 0; dy = 1; changingDirection = true; }
    else if (e.key === 'ArrowLeft' && dx !== 1) { dx = -1; dy = 0; changingDirection = true; }
    else if (e.key === 'ArrowRight' && dx !== -1) { dx = 1; dy = 0; changingDirection = true; }
});

speedUpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (manualSpeedLevel < 5) {
        manualSpeedLevel++;
        updateGameSpeed();
    }
});

speedDownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (manualSpeedLevel > 1) {
        manualSpeedLevel--;
        updateGameSpeed();
    }
});

startBtn.addEventListener('click', (e) => { e.stopPropagation(); startGame(); });

// Swipe Controls
let touchStartX = 0, touchStartY = 0;
document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: false });
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchend', (e) => {
    if (!isGameRunning) { startGame(); return; }
    if (changingDirection) return;
    const dxTouch = e.changedTouches[0].clientX - touchStartX;
    const dyTouch = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dxTouch) > Math.abs(dyTouch)) {
        if (dxTouch > 0 && dx !== -1) { dx = 1; dy = 0; }
        else if (dxTouch < 0 && dx !== 1) { dx = -1; dy = 0; }
    } else {
        if (dyTouch > 0 && dy !== -1) { dx = 0; dy = 1; }
        else if (dyTouch < 0 && dy !== 1) { dx = 0; dy = -1; }
    }
    changingDirection = true;
});

// Load high score on boot
highScoreElement.innerText = highScore;
resetGame();
draw();
