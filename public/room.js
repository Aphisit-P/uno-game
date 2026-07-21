const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] }); // เปลี่ยนเป็น URL server จริงตอน deploy เช่น io('https://uno-server.onrender.com')

const params = new URLSearchParams(location.search);
const roomId = params.get('room');
const name = sessionStorage.getItem('playerName');

if (!roomId || !name) {
  location.href = 'lobby.html'; // ถ้าเข้ามาตรง ๆ โดยไม่มีข้อมูล ให้เด้งกลับ
}

document.getElementById('roomCode').textContent = roomId;

const shareUrl = `${location.origin}${location.pathname.replace('room.html', 'lobby.html')}?room=${roomId}`;
document.getElementById('shareLink').value = shareUrl;

document.getElementById('copyBtn').onclick = () => {
  navigator.clipboard.writeText(shareUrl);
  document.getElementById('copyBtn').textContent = 'คัดลอกแล้ว ✓';
  setTimeout(() => (document.getElementById('copyBtn').textContent = 'คัดลอกลิงก์'), 1500);
};

socket.emit('joinRoom', { roomId, name });

socket.on('roomUpdate', ({ players }) => {
  document.getElementById('playerCount').textContent = players.length;
  const list = document.getElementById('playerList');
  list.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');

  const startBtn = document.getElementById('startGameBtn');
  startBtn.disabled = players.length < 2;
});

document.getElementById('startGameBtn').onclick = () => {
  socket.emit('startGame');
};

// เมื่อ server สั่งเริ่มเกม -> ทุกคนถูกพาไปหน้าเกมจริง พร้อม roomId เดิม
socket.on('gameStarted', () => {
  location.href = `game.html?room=${roomId}`;
});