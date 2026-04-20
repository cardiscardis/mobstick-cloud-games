// Integration script for Mobile Joystick Controller
const socket = io();

// UI Elements
const overlayCode = document.getElementById('overlay-code');
const overlayDot = document.getElementById('overlay-dot');
const overlayText = document.getElementById('overlay-text');
const overlayUrl = document.getElementById('overlay-url');
const overlay = document.getElementById('controller-overlay');

// Map of currently pressed keys to avoid spamming keydown
const pressedKeys = new Set();

function dispatchKey(code, type) {
    if (type === 'keydown') {
        if (pressedKeys.has(code)) return; // Already pressed
        pressedKeys.add(code);
    } else if (type === 'keyup') {
        if (!pressedKeys.has(code)) return; // Already released
        pressedKeys.delete(code);
    }

    const event = new KeyboardEvent(type, {
        key: code.replace('Key', ''),
        code: code,
        keyCode: getKeyCode(code),
        which: getKeyCode(code),
        bubbles: true,
        cancelable: true
    });
    document.dispatchEvent(event);
}

function getKeyCode(code) {
    const map = {
        'KeyW': 87,
        'KeyA': 65,
        'KeyS': 83,
        'KeyD': 68,
        'Space': 32,
        'KeyF': 70,
        'KeyG': 71,
        'ShiftLeft': 16
    };
    return map[code] || 0;
}

socket.emit('join-as-game');

socket.on('room-created', (data) => {
    overlayCode.textContent = data.roomId;
    overlayUrl.textContent = `${location.hostname}:${location.port}/controller`;
});

socket.on('controller-connected', () => {
    overlayDot.classList.add('connected');
    overlayText.textContent = 'Connected';
    overlay.classList.add('connected');
});

socket.on('controller-disconnected', () => {
    overlayDot.classList.remove('connected');
    overlayText.textContent = 'Waiting...';
    overlay.classList.remove('connected');

    // Release all keys
    ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyF', 'ShiftLeft'].forEach(code => {
        dispatchKey(code, 'keyup');
    });
});

// Joystick handles W, A, S, D
socket.on('joystick-input', (data) => {
    const { angle, magnitude } = data;

    if (magnitude < 0.1) {
        // Release all movement keys
        ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'].forEach(code => {
            dispatchKey(code, 'keyup');
        });
        return;
    }

    // Convert angle to directions
    // Angle is in radians, -PI to +PI. 
    // Right is 0, Down is PI/2, Left is PI/-PI, Up is -PI/2
    const deg = angle * (180 / Math.PI);

    let up = false, down = false, left = false, right = false;

    // 8-way directional mapping
    if (deg > -112.5 && deg < -67.5) { up = true; }
    else if (deg >= -67.5 && deg <= -22.5) { up = true; right = true; }
    else if (deg > -22.5 && deg < 22.5) { right = true; }
    else if (deg >= 22.5 && deg <= 67.5) { down = true; right = true; }
    else if (deg > 67.5 && deg < 112.5) { down = true; }
    else if (deg >= 112.5 && deg <= 157.5) { down = true; left = true; }
    else if (deg > 157.5 || deg < -157.5) { left = true; }
    else if (deg >= -157.5 && deg <= -112.5) { up = true; left = true; }

    // Dispatch events
    up ? dispatchKey('KeyW', 'keydown') : dispatchKey('KeyW', 'keyup');
    down ? dispatchKey('KeyS', 'keydown') : dispatchKey('KeyS', 'keyup');
    left ? dispatchKey('KeyA', 'keydown') : dispatchKey('KeyA', 'keyup');
    right ? dispatchKey('KeyD', 'keydown') : dispatchKey('KeyD', 'keyup');

    // If pushed to edge, sprint
    if (magnitude > 0.8) {
        dispatchKey('ShiftLeft', 'keydown');
    } else {
        dispatchKey('ShiftLeft', 'keyup');
    }
});

// Buttons handle Space, F
socket.on('button-action', (data) => {
    const { action, pressed } = data;
    const eventType = pressed ? 'keydown' : 'keyup';

    if (action === 'jump') {
        dispatchKey('Space', eventType);
    } else if (action === 'enter') {
        dispatchKey('KeyF', eventType);
    }
});
