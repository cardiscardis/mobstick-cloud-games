// ========== SPACE DRIFT — GAME ENGINE (Multiplayer) ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ----- Sizing -----
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ----- Socket.IO -----
const socket = io();
let gameMode = 'single'; // 'single' or 'multi'
let gameStarted = false;

// Player colors
const P_COLORS = {
    1: { main: '#00f0ff', glow: '#0891b2', boost: '#8b5cf6', boostGlow: '#a855f7', trail: '#00f0ff', bullet: '#00f0ff' },
    2: { main: '#f472b6', glow: '#db2777', boost: '#c084fc', boostGlow: '#a855f7', trail: '#f472b6', bullet: '#f472b6' }
};

// ----- Mode Selection -----
document.getElementById('btn-single').addEventListener('click', () => startGame('single'));
document.getElementById('btn-multi').addEventListener('click', () => startGame('multi'));

function startGame(mode) {
    gameMode = mode;
    document.getElementById('mode-select').classList.add('hidden');
    document.getElementById('overlay').classList.remove('hidden');

    if (mode === 'multi') {
        document.getElementById('mode-label').textContent = 'MULTIPLAYER — 2 CONTROLLERS';
        document.getElementById('players-status').classList.remove('hidden');
        document.getElementById('connection-status').classList.add('hidden');
    } else {
        document.getElementById('mode-label').textContent = 'SINGLE PLAYER';
    }

    socket.emit('join-as-game', { mode });
}

socket.on('room-created', (data) => {
    document.getElementById('room-code').textContent = data.roomId;
    const url = `${location.protocol}//${location.hostname}:${location.port}/`;
    document.getElementById('controller-url').textContent = url;
});

socket.on('controller-connected', (data) => {
    const pNum = data.playerNumber;

    if (gameMode === 'multi') {
        // Update player slot
        const dot = document.querySelector(`#p${pNum}-slot .player-dot`);
        const status = document.getElementById(`p${pNum}-status`);
        if (dot) dot.classList.add('connected');
        if (status) status.textContent = 'Connected!';

        // Start game when both players connected
        if (data.totalControllers >= 2) {
            setTimeout(() => {
                document.getElementById('overlay').classList.add('hidden');
                initPlayers();
                if (!gameStarted) {
                    gameStarted = true;
                    startGameLoop();
                }
            }, 800);
        }
    } else {
        // Single player — same as before
        document.getElementById('ctrl-dot').classList.add('connected');
        document.getElementById('ctrl-label').textContent = 'Controller Connected';
        document.getElementById('overlay').classList.add('hidden');
        const statusDot = document.querySelector('#connection-status .status-dot');
        if (statusDot) statusDot.classList.remove('waiting');
        document.getElementById('status-text').textContent = 'Controller connected!';

        initPlayers();
        if (!gameStarted) {
            gameStarted = true;
            startGameLoop();
        }
    }
});

socket.on('controller-disconnected', (data) => {
    if (gameMode === 'multi') {
        const pNum = data.playerNumber;
        if (pNum) {
            const dot = document.querySelector(`#p${pNum}-slot .player-dot`);
            if (dot) dot.classList.remove('connected');
        }
    } else {
        document.getElementById('ctrl-dot').classList.remove('connected');
        document.getElementById('ctrl-label').textContent = 'Controller Lost';
    }
});

// Remote input — per player
const remoteInputs = { 1: { angle: 0, magnitude: 0 }, 2: { angle: 0, magnitude: 0 } };

socket.on('joystick-input', (data) => {
    const pid = data.playerId || 1;
    remoteInputs[pid] = { angle: data.angle, magnitude: data.magnitude };
});

socket.on('button-action', (data) => {
    const pid = data.playerId || 1;
    if (data.action === 'fire') {
        shootFor(pid);
    } else if (data.action === 'boost') {
        activateBoostFor(pid);
    }
});

// ----- Game State -----
let players = [];
let asteroids = [];
let particles = [];
let stars = [];
let allGameOver = false;

// Init stars
for (let i = 0; i < 200; i++) {
    stars.push({
        x: Math.random() * 3000 - 500,
        y: Math.random() * 3000 - 500,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.6 + 0.2
    });
}

function createPlayer(id, x, y) {
    const colors = P_COLORS[id];
    return {
        id,
        x, y,
        vx: 0, vy: 0,
        angle: -Math.PI / 2,
        radius: 18,
        score: 0,
        lives: 3,
        dead: false,
        gameOver: false,
        respawnTimer: 0,
        boostActive: false,
        boostTimer: 0,
        bullets: [],
        colors
    };
}

function initPlayers() {
    players = [];
    if (gameMode === 'single') {
        players.push(createPlayer(1, canvas.width / 2, canvas.height / 2));
        // Show single player HUD
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('hud-multi').classList.add('hidden');
    } else {
        players.push(createPlayer(1, canvas.width / 3, canvas.height / 2));
        players.push(createPlayer(2, (canvas.width / 3) * 2, canvas.height / 2));
        // Show multiplayer HUD
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('hud-multi').classList.remove('hidden');
    }
    asteroids = [];
    particles = [];
    allGameOver = false;
    for (let i = 0; i < 5; i++) spawnAsteroid();
}

function getPlayer(id) {
    return players.find(p => p.id === id);
}

// Spawn asteroids
function spawnAsteroid() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    switch (side) {
        case 0: x = -50; y = Math.random() * canvas.height; break;
        case 1: x = canvas.width + 50; y = Math.random() * canvas.height; break;
        case 2: x = Math.random() * canvas.width; y = -50; break;
        case 3: x = Math.random() * canvas.width; y = canvas.height + 50; break;
    }
    const angle = Math.atan2(canvas.height / 2 - y, canvas.width / 2 - x) + (Math.random() - 0.5) * 1.2;
    const speed = Math.random() * 2 + 1;
    const radius = Math.random() * 25 + 15;
    asteroids.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.04,
        vertices: generateAsteroidShape(radius)
    });
}

function generateAsteroidShape(radius) {
    const points = [];
    const numVerts = Math.floor(Math.random() * 5) + 7;
    for (let i = 0; i < numVerts; i++) {
        const angle = (i / numVerts) * Math.PI * 2;
        const r = radius + (Math.random() - 0.5) * radius * 0.5;
        points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    return points;
}

// ----- Keyboard Input (P1 only in single player) -----
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key] = true; });
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

// ----- Actions -----
function shootFor(playerId) {
    const p = getPlayer(playerId);
    if (!p || p.dead || p.gameOver) return;
    const speed = 8;
    p.bullets.push({
        x: p.x + Math.cos(p.angle) * 22,
        y: p.y + Math.sin(p.angle) * 22,
        vx: Math.cos(p.angle) * speed + p.vx * 0.3,
        vy: Math.sin(p.angle) * speed + p.vy * 0.3,
        life: 60
    });
}

function activateBoostFor(playerId) {
    const p = getPlayer(playerId);
    if (!p || p.dead || p.gameOver) return;
    if (!p.boostActive) {
        p.boostActive = true;
        p.boostTimer = 90;
    }
}

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: Math.random() * 30 + 15,
            maxLife: 45,
            color,
            radius: Math.random() * 3 + 1
        });
    }
}

function resetPlayer(p) {
    if (gameMode === 'single') {
        p.x = canvas.width / 2;
        p.y = canvas.height / 2;
    } else {
        p.x = p.id === 1 ? canvas.width / 3 : (canvas.width / 3) * 2;
        p.y = canvas.height / 2;
    }
    p.vx = 0;
    p.vy = 0;
    p.angle = -Math.PI / 2;
}

// ----- Update -----
function update() {
    if (allGameOver) return;

    // Update each player
    players.forEach(p => {
        if (p.gameOver) return;

        // Handle respawn timer
        if (p.dead) {
            p.respawnTimer--;
            if (p.respawnTimer <= 0) {
                if (p.lives <= 0) {
                    p.gameOver = true;
                    return;
                }
                p.dead = false;
                resetPlayer(p);
            }
            return;
        }

        const accel = p.boostActive ? 0.35 : 0.18;
        const friction = 0.985;
        const maxSpeed = p.boostActive ? 8 : 5;

        // Keyboard input (Player 1 only, single player mode)
        if (p.id === 1) {
            if (keys['ArrowLeft'] || keys['a']) p.angle -= 0.06;
            if (keys['ArrowRight'] || keys['d']) p.angle += 0.06;
            if (keys['ArrowUp'] || keys['w']) {
                p.vx += Math.cos(p.angle) * accel;
                p.vy += Math.sin(p.angle) * accel;
            }
            if (keys[' ']) { keys[' '] = false; shootFor(1); }
        }

        // Remote joystick per player
        const input = remoteInputs[p.id];
        if (input && input.magnitude > 0.1) {
            p.angle = input.angle;
            const force = input.magnitude * accel * 1.5;
            p.vx += Math.cos(p.angle) * force;
            p.vy += Math.sin(p.angle) * force;
        }

        // Physics
        p.vx *= friction;
        p.vy *= friction;
        const speed = Math.sqrt(p.vx ** 2 + p.vy ** 2);
        if (speed > maxSpeed) {
            p.vx = (p.vx / speed) * maxSpeed;
            p.vy = (p.vy / speed) * maxSpeed;
        }
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < -30) p.x = canvas.width + 30;
        if (p.x > canvas.width + 30) p.x = -30;
        if (p.y < -30) p.y = canvas.height + 30;
        if (p.y > canvas.height + 30) p.y = -30;

        // Boost timer
        if (p.boostActive) {
            p.boostTimer--;
            if (p.boostTimer <= 0) p.boostActive = false;
            spawnParticles(
                p.x - Math.cos(p.angle) * 18,
                p.y - Math.sin(p.angle) * 18,
                p.colors.boost, 2
            );
        }

        // Engine particles
        if ((input && input.magnitude > 0.1) || (p.id === 1 && (keys['ArrowUp'] || keys['w']))) {
            spawnParticles(
                p.x - Math.cos(p.angle) * 18,
                p.y - Math.sin(p.angle) * 18,
                p.colors.trail, 1
            );
        }

        // Bullets update
        p.bullets.forEach(b => {
            b.x += b.vx;
            b.y += b.vy;
            b.life--;
        });
        p.bullets = p.bullets.filter(b => b.life > 0);
    });

    // Asteroids movement
    asteroids.forEach(a => {
        a.x += a.vx;
        a.y += a.vy;
        a.rotation += a.rotSpeed;
    });
    asteroids = asteroids.filter(a =>
        a.x > -200 && a.x < canvas.width + 200 && a.y > -200 && a.y < canvas.height + 200
    );

    // Collision: each player's bullets vs asteroids
    players.forEach(p => {
        if (p.dead || p.gameOver) return;
        for (let bi = p.bullets.length - 1; bi >= 0; bi--) {
            for (let ai = asteroids.length - 1; ai >= 0; ai--) {
                const b = p.bullets[bi];
                const a = asteroids[ai];
                if (!b || !a) continue;
                const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
                if (dist < a.radius) {
                    spawnParticles(a.x, a.y, '#f472b6', 12);
                    p.score += Math.floor(50 / a.radius * 10);
                    // Split into smaller
                    if (a.radius > 18) {
                        for (let s = 0; s < 2; s++) {
                            const newR = a.radius * 0.55;
                            const ang = Math.random() * Math.PI * 2;
                            const sp = Math.random() * 2 + 1.5;
                            asteroids.push({
                                x: a.x, y: a.y,
                                vx: Math.cos(ang) * sp,
                                vy: Math.sin(ang) * sp,
                                radius: newR,
                                rotation: 0,
                                rotSpeed: (Math.random() - 0.5) * 0.06,
                                vertices: generateAsteroidShape(newR)
                            });
                        }
                    }
                    asteroids.splice(ai, 1);
                    p.bullets.splice(bi, 1);
                    break;
                }
            }
        }
    });

    // Collision: ship vs asteroids (per player)
    players.forEach(p => {
        if (p.dead || p.gameOver) return;
        for (let ai = asteroids.length - 1; ai >= 0; ai--) {
            const a = asteroids[ai];
            const dist = Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
            if (dist < p.radius + a.radius * 0.7) {
                spawnParticles(p.x, p.y, '#ef4444', 20);
                p.lives--;
                asteroids.splice(ai, 1);
                p.dead = true;
                p.respawnTimer = 120; // ~2 seconds at 60fps
                break;
            }
        }
    });

    // Check global game over
    const allDead = players.every(p => p.gameOver);
    if (allDead) {
        allGameOver = true;
        setTimeout(() => {
            // Reset all
            initPlayers();
        }, 3000);
    }

    // Particles
    particles.forEach(pp => {
        pp.x += pp.vx;
        pp.y += pp.vy;
        pp.life--;
    });
    particles = particles.filter(pp => pp.life > 0);

    // Update HUD
    if (gameMode === 'single') {
        const p = players[0];
        if (p) {
            document.getElementById('score').textContent = p.score;
            const heartsArr = [];
            for (let i = 0; i < Math.max(p.lives, 0); i++) heartsArr.push('♥');
            document.getElementById('lives').textContent = heartsArr.join('');
        }
    } else {
        players.forEach(p => {
            const scoreEl = document.getElementById(`p${p.id}-score`);
            const livesEl = document.getElementById(`p${p.id}-lives`);
            if (scoreEl) scoreEl.textContent = p.score;
            if (livesEl) {
                const heartsArr = [];
                for (let i = 0; i < Math.max(p.lives, 0); i++) heartsArr.push('♥');
                livesEl.textContent = heartsArr.join('') || '☠';
            }
        });
    }
}

// ----- Render -----
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background gradient
    const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 100, canvas.width / 2, canvas.height / 2, canvas.width);
    grad.addColorStop(0, '#0f0f2e');
    grad.addColorStop(1, '#050510');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars
    stars.forEach(s => {
        ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x % canvas.width, s.y % canvas.height, s.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // Particles
    particles.forEach(p => {
        const alpha = p.life / p.maxLife;
        ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw each player's bullets
    players.forEach(p => {
        if (p.bullets.length === 0) return;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.colors.bullet;
        p.bullets.forEach(b => {
            ctx.fillStyle = p.colors.bullet;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.shadowBlur = 0;
    });

    // Asteroids
    asteroids.forEach(a => {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rotation);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.moveTo(a.vertices[0].x, a.vertices[0].y);
        for (let i = 1; i < a.vertices.length; i++) {
            ctx.lineTo(a.vertices[i].x, a.vertices[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    });

    // Draw each player's ship
    players.forEach(p => {
        if (p.dead || p.gameOver) return;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        // Glow
        ctx.shadowBlur = p.boostActive ? 25 : 12;
        ctx.shadowColor = p.boostActive ? p.colors.boost : p.colors.main;

        // Ship body
        ctx.fillStyle = p.boostActive ? p.colors.boostGlow : p.colors.main;
        ctx.strokeStyle = p.colors.glow;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(-14, -12);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-14, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Player label (multiplayer only)
        if (gameMode === 'multi') {
            ctx.shadowBlur = 0;
            ctx.rotate(-p.angle); // un-rotate for text
            ctx.fillStyle = p.colors.main;
            ctx.font = '600 10px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText(`P${p.id}`, 0, -28);
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    });

    // Game Over text
    if (allGameOver) {
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 48px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '600 16px Inter';
        ctx.fillText('Respawning...', canvas.width / 2, canvas.height / 2 + 25);

        // Show scores in multiplayer
        if (gameMode === 'multi') {
            players.forEach((p, i) => {
                ctx.fillStyle = p.colors.main;
                ctx.font = '700 20px Orbitron';
                ctx.fillText(`P${p.id}: ${p.score}`, canvas.width / 2, canvas.height / 2 + 60 + i * 32);
            });
        }
    }

    // Per-player death message
    players.forEach(p => {
        if (p.dead && !p.gameOver) {
            ctx.fillStyle = p.colors.main;
            ctx.font = '600 14px Orbitron';
            ctx.textAlign = 'center';
            ctx.globalAlpha = 0.7;
            const pos = gameMode === 'single'
                ? { x: canvas.width / 2, y: canvas.height / 2 }
                : { x: p.id === 1 ? canvas.width / 4 : (canvas.width / 4) * 3, y: canvas.height / 2 };
            ctx.fillText(`P${p.id} HIT!`, pos.x, pos.y);
            if (p.lives > 0) {
                ctx.font = '400 11px Inter';
                ctx.fillText('Respawning...', pos.x, pos.y + 22);
            } else {
                ctx.fillStyle = '#ef4444';
                ctx.font = '700 13px Orbitron';
                ctx.fillText('DESTROYED', pos.x, pos.y + 22);
            }
            ctx.globalAlpha = 1;
        }
    });
}

// ----- Game Loop -----
let spawnTimer = 0;

function startGameLoop() {
    function loop() {
        update();
        draw();
        spawnTimer++;
        const maxAsteroids = gameMode === 'multi' ? 16 : 12;
        if (spawnTimer % 90 === 0 && asteroids.length < maxAsteroids) {
            spawnAsteroid();
        }
        requestAnimationFrame(loop);
    }
    loop();
}
