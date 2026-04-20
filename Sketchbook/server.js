const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const PORT = 3000;

// Serve the Sketchbook game at the root
app.use(express.static(path.join(__dirname)));
app.use('/build', express.static(path.join(__dirname, 'build')));

// Serve the Mobile Controller at /controller
app.use('/controller', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --------------- Socket.IO ---------------
const rooms = {};

io.on('connection', (socket) => {
    console.log(`🔌 Connected: ${socket.id}`);

    socket.on('join-as-game', () => {
        const roomId = generateRoomId();
        rooms[roomId] = { game: socket.id, controllers: [] };
        socket.join(roomId);
        socket.roomId = roomId;
        socket.role = 'game';
        socket.emit('room-created', { roomId });
        console.log(`🎮 Game joined room: ${roomId}`);
    });

    socket.on('join-as-controller', (data) => {
        const roomId = data.roomId;
        if (!rooms[roomId]) {
            socket.emit('error-msg', { message: 'Room not found. Check the code and try again.' });
            return;
        }
        socket.join(roomId);
        socket.roomId = roomId;
        socket.role = 'controller';
        rooms[roomId].controllers.push(socket.id);
        socket.emit('joined-room', { roomId });
        io.to(rooms[roomId].game).emit('controller-connected', { controllerId: socket.id });
        console.log(`📱 Controller joined room: ${roomId}`);
    });

    socket.on('joystick-input', (data) => {
        if (socket.roomId && rooms[socket.roomId]) {
            io.to(rooms[socket.roomId].game).emit('joystick-input', data);
        }
    });

    socket.on('button-action', (data) => {
        if (socket.roomId && rooms[socket.roomId]) {
            io.to(rooms[socket.roomId].game).emit('button-action', data);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Disconnected: ${socket.id}`);
        if (socket.roomId && rooms[socket.roomId]) {
            if (socket.role === 'game') {
                io.to(socket.roomId).emit('game-disconnected');
                delete rooms[socket.roomId];
            } else {
                rooms[socket.roomId].controllers = rooms[socket.roomId].controllers.filter(
                    (id) => id !== socket.id
                );
                if (rooms[socket.roomId].game) {
                    io.to(rooms[socket.roomId].game).emit('controller-disconnected', {
                        controllerId: socket.id
                    });
                }
            }
        }
    });
});

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

server.listen(PORT, () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('🚀 Sketchbook + Mobile Controller Running!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🎮 Desktop Game:  http://localhost:${PORT}/`);
    console.log(`📱 Mobile Ctrl:   http://${localIP}:${PORT}/controller`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
});
