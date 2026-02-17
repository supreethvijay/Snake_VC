const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const highScoreElement = document.getElementById('high-score');
const overlay = document.getElementById('game-overlay');
const gameContainer = document.querySelector('.game-container');

// ... (existing code)

let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
let level = 1;

// ... (existing code)

function updateScore() {
    scoreElement.innerText = score;
    levelElement.innerText = level;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snakeHighScore', highScore);
        // Special effect for new high score? (Maybe flash the text)
    }
    highScoreElement.innerText = highScore;
}

// ... (rest of the file)

const GRID_SIZE = 20;
const TILE_COUNT = canvas.width / GRID_SIZE;


let gameSpeed = 150;
let gameLoopTimeout;
let isGameRunning = false;
let changingDirection = false;

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
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.5; // 0.5 seconds
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    // Filter to make it sound more like a hiss (Highpass)
    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1000;
    bandpass.Q.value = 0.5;

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

    noise.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    noise.start();
}

function playEatSound() {
    // High pitched "bloop"
    playOscillator('sine', 600, 0.1, 0.1);
    setTimeout(() => playOscillator('sine', 800, 0.1, 0.1), 50);
}

function playGameOverSound() {
    // Low descending tone
    playOscillator('sawtooth', 150, 0.5, 0.2);
    setTimeout(() => playOscillator('sawtooth', 100, 0.5, 0.2), 200);
}

// Particles
let particles = [];

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
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
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
    gameContainer.classList.add('shake');
    setTimeout(() => {
        gameContainer.classList.remove('shake');
    }, 500);
}

// Snake state
let snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
];
let dx = 1;
let dy = 0;

// Food state
let food = { x: 15, y: 15 };

function startGame() {
    initAudio();
    resetGame();
    isGameRunning = true;
    overlay.classList.add('hidden');
    gameLoop();
}

function resetGame() {
    score = 0;
    level = 1;
    gameSpeed = 150;
    snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ];
    dx = 1;
    dy = 0;
    updateScore();
    placeFood();
    particles = [];
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
        gameOver();
        return;
    }

    for (let i = 0; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            playGameOverSound();
            triggerShake();
            gameOver();
            return;
        }
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score += 10;
        playEatSound();
        createParticles(food.x, food.y, '#f00'); // Red particles for food
        updateScore();
        checkLevelUp();
        placeFood();
    } else {
        snake.pop();
        // Randomly play hiss sound when moving
        if (Math.random() < 0.1) {
            playHiss();
        }
    }

    updateParticles();
    changingDirection = false;
}

// Snake Head Image
const headImage = new Image();
headImage.src = 'snake-head.png';

function draw() {
    // Clear with semi-transparent black for trail effect? No, clean clear for now.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Grid (Subtle)
    ctx.strokeStyle = '#111';
    for (let i = 0; i < TILE_COUNT; i++) {
        ctx.beginPath();
        ctx.moveTo(i * GRID_SIZE, 0);
        ctx.lineTo(i * GRID_SIZE, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * GRID_SIZE);
        ctx.lineTo(canvas.width, i * GRID_SIZE);
        ctx.stroke();
    }

    // Draw Food (Glowing)
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#f00";
    ctx.fillStyle = '#f00';
    ctx.fillRect(food.x * GRID_SIZE, food.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2);
    ctx.shadowBlur = 0;

    // Draw Snake
    snake.forEach((segment, index) => {
        if (index === 0) {
            // Draw Head Image with Rotation
            ctx.save();
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#0f0";

            // Translate to center of the tile
            const cx = segment.x * GRID_SIZE + GRID_SIZE / 2;
            const cy = segment.y * GRID_SIZE + GRID_SIZE / 2;

            ctx.translate(cx, cy);

            // Calculate rotation
            // Default image is facing RIGHT
            let angle = 0;
            if (dx === 1) angle = 0;
            if (dx === -1) angle = Math.PI;
            if (dy === 1) angle = Math.PI / 2;
            if (dy === -1) angle = -Math.PI / 2;

            ctx.rotate(angle);

            // Draw image centered
            ctx.drawImage(headImage, -GRID_SIZE / 2, -GRID_SIZE / 2, GRID_SIZE, GRID_SIZE);

            ctx.restore();
            ctx.shadowBlur = 0;
        } else {
            // Draw Body (Glowing neon green)
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#0f0";
            ctx.fillStyle = '#0f0';
            ctx.fillRect(segment.x * GRID_SIZE, segment.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2);
            ctx.shadowBlur = 0;
        }
    });

    drawParticles();
}

function placeFood() {
    food = {
        x: Math.floor(Math.random() * TILE_COUNT),
        y: Math.floor(Math.random() * TILE_COUNT)
    };
    snake.forEach(segment => {
        if (segment.x === food.x && segment.y === food.y) {
            placeFood();
        }
    });
}

function updateScore() {
    scoreElement.innerText = score;
    levelElement.innerText = level;
}

function checkLevelUp() {
    let newLevel = 1;
    if (score >= 200) newLevel = 5;
    else if (score >= 150) newLevel = 4;
    else if (score >= 100) newLevel = 3;
    else if (score >= 50) newLevel = 2;

    if (newLevel > level) {
        level = newLevel;
        if (level === 2) gameSpeed = 120;
        if (level === 3) gameSpeed = 100;
        if (level === 4) gameSpeed = 80;
        if (level === 5) gameSpeed = 60;
        // Level up sound/effect?
        playOscillator('square', 400, 0.2, 0.1);
    }
}

function gameOver() {
    isGameRunning = false;
    clearTimeout(gameLoopTimeout);
    overlay.classList.remove('hidden');
}

document.addEventListener('keydown', (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) > -1) {
        e.preventDefault();
    }

    if (e.code === 'Space') {
        if (!isGameRunning) startGame();
        return;
    }

    if (changingDirection) return;

    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;

    if (e.key === 'ArrowUp' && !goingDown) {
        dx = 0; dy = -1;
        changingDirection = true;
    }
    if (e.key === 'ArrowDown' && !goingUp) {
        dx = 0; dy = 1;
        changingDirection = true;
    }
    if (e.key === 'ArrowLeft' && !goingRight) {
        dx = -1; dy = 0;
        changingDirection = true;
    }
    if (e.key === 'ArrowRight' && !goingLeft) {
        dx = 1; dy = 0;
        changingDirection = true;
    }
});

// Click to start (for audio policy)
document.addEventListener('click', () => {
    if (!isGameRunning) startGame();
});

// Initialize initial state so it's not blank
resetGame();
draw();
