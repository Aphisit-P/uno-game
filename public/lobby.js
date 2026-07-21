function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ตัดตัวที่สับสนออก
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

document.getElementById('createBtn').onclick = () => {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) return alert('กรุณาใส่ชื่อ');
  const roomId = generateRoomCode();
  sessionStorage.setItem('playerName', name);
  location.href = `room.html?room=${roomId}`;
};

document.getElementById('joinBtn').onclick = () => {
  const name = document.getElementById('nameInput').value.trim();
  const roomId = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!name) return alert('กรุณาใส่ชื่อ');
  if (!roomId) return alert('กรุณาใส่รหัสห้อง');
  sessionStorage.setItem('playerName', name);
  location.href = `room.html?room=${roomId}`;
};

// ถ้ามี ?room=xxxx ติดมาจากลิงก์แชร์ ให้เติมในช่องอัตโนมัติ
const params = new URLSearchParams(location.search);
if (params.get('room')) {
  document.getElementById('roomCodeInput').value = params.get('room');
}

// โหลดธีมเดิม
const savedTheme = localStorage.getItem('uno-theme');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
document.querySelectorAll('.theme-switcher button').forEach(btn => {
  btn.onclick = () => {
    document.documentElement.setAttribute('data-theme', btn.dataset.theme);
    localStorage.setItem('uno-theme', btn.dataset.theme);
  };
});