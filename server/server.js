const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { UnoGame } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://unobyblackbara.netlify.app/', // ใส่ URL จริงจาก Netlify
    methods: ['GET', 'POST'],
  },
});

app.use(express.static('../public'));

const rooms = {}; // roomId -> UnoGame

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ roomId, name }) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = new UnoGame(roomId);
    rooms[roomId].addPlayer(socket.id, name);
    socket.data.roomId = roomId;

    io.to(roomId).emit('roomUpdate', {
      players: rooms[roomId].players.map(p => ({ id: p.id, name: p.name, count: p.hand.length })),
    });
  });

  socket.on('startGame', () => {
    const room = rooms[socket.data.roomId];
    if (!room || room.players.length < 2) return;
    room.start();
    io.to(room.roomId).emit('gameStarted'); // บอกทุก client ให้ redirect ไปหน้าเกม
    broadcastState(room);
  });

  socket.on('playCard', ({ cardIndex, chosenColor }) => {
    const room = rooms[socket.data.roomId];
    const result = room.playCard(socket.id, cardIndex, chosenColor);
    if (result.error) return socket.emit('errorMsg', result.error);
    if (result.winner) io.to(room.roomId).emit('gameOver', result.winner);
    broadcastState(room);
  });

  socket.on('drawCard', () => {
    const room = rooms[socket.data.roomId];
    const result = room.drawForPlayer(socket.id);
    if (result.error) return socket.emit('errorMsg', result.error);
    broadcastState(room);
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.data.roomId];
    if (room) room.players = room.players.filter(p => p.id !== socket.id);
  });

  socket.on('callUno', () => {
    const room = rooms[socket.data.roomId];
    const result = room.callUno(socket.id);
    if (result.error) return socket.emit('errorMsg', result.error);
    io.to(room.roomId).emit('unoAnnounced', { name: result.callerName });
    broadcastState(room);
  });

  socket.on('catchUnoFail', ({ targetId }) => {
    const room = rooms[socket.data.roomId];
    const result = room.catchUnoFail(socket.id, targetId);
    if (result.error) return socket.emit('errorMsg', result.error);
    io.to(room.roomId).emit('unoPenalty', { name: result.targetName });
    broadcastState(room);
  });
});

function broadcastState(room) {
  room.players.forEach(p => {
    io.to(p.id).emit('gameState', {
      yourHand: p.hand,
      topCard: room.topCard(),
      currentPlayerId: room.currentPlayer().id,
      players: room.players.map(pl => ({
        id: pl.id,
        name: pl.name,
        count: pl.hand.length,
        vulnerable: !!pl.vulnerableToUnoPenalty, // ใช้โชว์ปุ่ม "จับผิด" ที่หน้าคนอื่น
      })),
    });
  });
}

server.listen(3000, () => console.log('Server running on port 3000'));