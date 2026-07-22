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
      yourId: p.id,                          // 👈 เพิ่มบรรทัดนี้
      yourHand: p.hand,
      topCard: room.topCard(),
      currentPlayerId: room.currentPlayer().id,
      players: room.players.map(pl => ({
        id: pl.id,
        name: pl.name,
        count: pl.hand.length,
        vulnerable: !!pl.vulnerableToUnoPenalty,
        calledUno: room.unoCalledBy.has(pl.id), // 👈 เพิ่มบรรทัดนี้
      })),
    });
  });
}

// เพิ่มฟังก์ชันนี้ลงใน server/game.js หรือ server/server.js
function resetGame(roomId) {
    const room = rooms[roomId]; // ดึงข้อมูลห้องปัจจุบัน
    if (!room) return;

    // 1. รีเซ็ตข้อมูลเกม
    room.deck = createDeck();      // สร้างสำรับไพ่ใหม่
    room.discardPile = [];         // ล้างกองไพ่ทิ้ง
    room.gameState = 'waiting';    // เปลี่ยนสถานะกลับเป็นรอเล่น
    
    // 2. เคลียร์ไพ่ในมือของผู้เล่นทุกคน (แต่ไม่ลบผู้เล่นออกจากห้อง!)
    room.players.forEach(player => {
        player.hand = [];
    });

    // 3. แจ้งเตือนทุกคนในห้องว่าเกมรีเซ็ตแล้ว ให้โหลดหน้าจอใหม่
    io.to(roomId).emit('gameResetSuccess', { players: room.players });
}

// ตรงจุดที่เช็กคนชนะ (เมื่อการ์ดในมือผู้เล่นเหลือ 0)
if (player.hand.length === 0) {
    io.to(roomId).emit('announceWinner', { winnerName: player.name });
    
    // รอ 3 วินาทีให้ผู้เล่นเห็นหน้าจอคนชนะ แล้วทำการรีเซ็ตเกม
    setTimeout(() => {
        resetGame(roomId);
    }, 3000);
}

// เมื่อผู้เล่นกดพร้อม หรือคนครบ ให้เรียกฟังก์ชันนี้
function startCountdown(roomId) {
    let timeLeft = 3; // 👈 ปรับเวลารอเหลือแค่ 3 วินาที (ลดความช้า)

    const interval = setInterval(() => {
        // ส่งเวลาที่เหลือไปให้ผู้เล่นทุกคนในห้องเห็น
        io.to(roomId).emit('loadingCountdown', { seconds: timeLeft });

        if (timeLeft <= 0) {
            clearInterval(interval);
            // เริ่มเกมทันที
            startGame(roomId);
        }
        timeLeft--;
    }, 1000);
}

server.listen(3000, () => console.log('Server running on port 3000'));