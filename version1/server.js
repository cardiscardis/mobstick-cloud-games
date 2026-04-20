const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route: game page
app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// Route: controller (default)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --------------- Socket.IO ---------------
const rooms = {};

// Player colors
const PLAYER_COLORS = {
  1: '#00f0ff', // cyan
  2: '#f472b6'  // pink/magenta
};

io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  // Game client joins with mode selection
  socket.on('join-as-game', (data) => {
    const mode = (data && data.mode) || 'single';
    const roomId = generateRoomId();
    rooms[roomId] = {
      game: socket.id,
      mode: mode,
      controllers: [],
      maxPlayers: mode === 'multi' ? 2 : 1
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = 'game';
    socket.emit('room-created', { roomId, mode });
    console.log(`🎮 Game joined room: ${roomId} (mode: ${mode})`);
  });

  // Controller joins a room
  socket.on('join-as-controller', (data) => {
    const roomId = data.roomId;
    if (!rooms[roomId]) {
      socket.emit('error-msg', { message: 'Room not found. Check the code and try again.' });
      return;
    }

    const room = rooms[roomId];

    // Check if room is full
    if (room.controllers.length >= room.maxPlayers) {
      const modeLabel = room.mode === 'multi' ? 'Multiplayer (2 players max)' : 'Single player (1 controller max)';
      socket.emit('error-msg', { message: `Room is full! ${modeLabel}.` });
      return;
    }

    // Assign player number (1-indexed)
    const playerNumber = room.controllers.length + 1;
    const playerColor = PLAYER_COLORS[playerNumber];

    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = 'controller';
    socket.playerNumber = playerNumber;

    room.controllers.push({
      id: socket.id,
      playerNumber: playerNumber
    });

    // Tell the controller which player they are
    socket.emit('joined-room', { roomId, playerNumber, playerColor });
    socket.emit('player-assigned', { playerNumber, playerColor });

    // Notify the game
    io.to(room.game).emit('controller-connected', {
      controllerId: socket.id,
      playerNumber: playerNumber,
      playerColor: playerColor,
      totalControllers: room.controllers.length
    });

    console.log(`📱 Controller P${playerNumber} joined room: ${roomId}`);
  });

  // Joystick input (continuous) — tagged with player number
  socket.on('joystick-input', (data) => {
    if (socket.roomId && rooms[socket.roomId]) {
      io.to(rooms[socket.roomId].game).emit('joystick-input', {
        ...data,
        playerId: socket.playerNumber || 1
      });
    }
  });

  // Button actions (discrete) — tagged with player number
  socket.on('button-action', (data) => {
    if (socket.roomId && rooms[socket.roomId]) {
      io.to(rooms[socket.roomId].game).emit('button-action', {
        ...data,
        playerId: socket.playerNumber || 1
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      if (socket.role === 'game') {
        // Notify controllers
        io.to(socket.roomId).emit('game-disconnected');
        delete rooms[socket.roomId];
      } else {
        // Find the disconnected controller's player number
        const controllerInfo = room.controllers.find(c => c.id === socket.id);
        const playerNumber = controllerInfo ? controllerInfo.playerNumber : null;

        room.controllers = room.controllers.filter(c => c.id !== socket.id);

        if (room.game) {
          io.to(room.game).emit('controller-disconnected', {
            controllerId: socket.id,
            playerNumber: playerNumber,
            totalControllers: room.controllers.length
          });
        }
      }
    }
  });
});

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Get local IP
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
  console.log('🚀 Space Drift — Server Running!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎮 Desktop Game:  http://localhost:${PORT}/game`);
  console.log(`📱 Mobile Ctrl:   http://${localIP}:${PORT}/`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Open the game on your desktop and the controller on your phone.');
  console.log('Make sure both devices are on the same Wi-Fi network!');
  console.log('');
});
