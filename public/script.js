const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

const params = new URLSearchParams(location.search);
const roomId = params.get('room');
const name = sessionStorage.getItem('playerName');

if (!roomId || !name) {
  location.href = 'lobby.html';
}

let myId = null;

// ---------- debug ช่วยตรวจสอบว่าเชื่อมต่อได้จริงไหม ----------
socket.on('connect', () => console.log('✅ เชื่อมต่อ server สำเร็จ, socket id:', socket.id));
socket.on('connect_error', (err) => console.error('❌ เชื่อมต่อ server ไม่ได้:', err.message));

socket.emit('joinRoom', { roomId, name });

socket.on('gameState', (state) => {
  console.log('📦 ได้รับ gameState:', state); // ลบทิ้งได้เมื่อทุกอย่างทำงานปกติแล้ว
  myId = state.yourId;

  document.getElementById('yourName').textContent = `${name} (คุณ)`;

  const isMyTurn = state.currentPlayerId === myId;
  renderHand(state.yourHand, isMyTurn);
  renderTopCard(state.topCard);
  renderOpponents(state.players, state.currentPlayerId);
  renderTurnIndicator(state.players, state.currentPlayerId);
  renderUnoButton(state.players);
});

socket.on('unoAnnounced', ({ name }) => showToast(`🎉 ${name} กด UNO แล้ว!`));
socket.on('unoPenalty', ({ name }) => showToast(`⚠️ ${name} ลืมกด UNO! จั่วเพิ่ม 2 ใบ`));
socket.on('errorMsg', (msg) => showToast(`❌ ${msg}`));
socket.on('gameOver', (winnerName) => showToast(`🏆 ${winnerName} ชนะ!`));

// ---------- FLIP animation สำหรับมือตัวเอง ----------
function getCardPositions(container) {
  const positions = new Map();
  container.querySelectorAll('.card').forEach(el => {
    positions.set(el.dataset.cardId, el.getBoundingClientRect());
  });
  return positions;
}

function playFlipAnimation(container, oldPositions) {
  container.querySelectorAll('.card').forEach(el => {
    const oldRect = oldPositions.get(el.dataset.cardId);
    if (!oldRect) return;
    const newRect = el.getBoundingClientRect();
    const dx = oldRect.left - newRect.left;
    const dy = oldRect.top - newRect.top;
    if (dx || dy) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.transition = 'none';
      requestAnimationFrame(() => {
        el.style.transform = '';
        el.style.transition = 'transform 0.3s ease';
      });
    }
  });
}

function renderHand(hand, isMyTurn) {
  const container = document.getElementById('hand');
  const oldPositions = getCardPositions(container);
  container.innerHTML = '';

  hand.forEach((card, index) => {
    const el = document.createElement('div');
    el.className = 'card' + (isMyTurn ? '' : ' disabled');
    el.dataset.cardId = `${card.color}-${card.value}-${index}`;
    el.style.background = card.color === 'wild' ? '#333' : cardColorHex(card.color);
    if (card.color === 'wild') el.style.color = '#fff';
    el.textContent = formatCardLabel(card);
    el.onclick = () => handleCardClick(card, index, el);
    container.appendChild(el);
  });

  playFlipAnimation(container, oldPositions);
}

function handleCardClick(card, index, cardEl) {
  const targetPile = document.getElementById('topCard');
  const startRect = cardEl.getBoundingClientRect();
  const endRect = targetPile.getBoundingClientRect();

  const flyingCard = cardEl.cloneNode(true);
  Object.assign(flyingCard.style, {
    position: 'fixed',
    left: `${startRect.left}px`,
    top: `${startRect.top}px`,
    width: `${startRect.width}px`,
    height: `${startRect.height}px`,
    margin: '0',
    zIndex: '999',
    transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
  });
  document.body.appendChild(flyingCard);
  cardEl.style.visibility = 'hidden';

  requestAnimationFrame(() => {
    flyingCard.style.left = `${endRect.left}px`;
    flyingCard.style.top = `${endRect.top}px`;
  });
  setTimeout(() => flyingCard.remove(), 350);

  if (card.color === 'wild') {
    const chosen = prompt('เลือกสี: red, yellow, green, blue');
    socket.emit('playCard', { cardIndex: index, chosenColor: chosen });
  } else {
    socket.emit('playCard', { cardIndex: index });
  }
}

// ---------- กองกลาง (การ์ดหน้าเปิดให้ทุกคนเห็นเหมือนกัน) ----------
function renderTopCard(card) {
  if (!card) return;
  const el = document.getElementById('topCard');
  const displayColor = card.color === 'wild' ? (card.chosenColor || 'wild') : card.color;
  el.style.background = displayColor === 'wild' ? '#333' : cardColorHex(displayColor);
  el.style.color = '#fff';
  el.textContent = formatCardLabel(card);
}

function formatCardLabel(card) {
  const labels = { skip: '⛔', reverse: '🔁', draw2: '+2', wild: '🌈', wild4: '+4' };
  return labels[card.value] || card.value;
}

function cardColorHex(color) {
  return { red: '#d32f2f', yellow: '#fbc02d', green: '#388e3c', blue: '#1976d2' }[color] || '#333';
}

// ---------- ที่นั่งคู่ต่อสู้ (เห็นแค่หลังการ์ด) ----------
function assignSeats(n) {
  if (n <= 1) return ['top'];
  if (n === 2) return ['left', 'right'];
  if (n === 3) return ['top', 'left', 'right'];
  const base = ['top', 'left', 'right'];
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(i < 3 ? base[i] : 'overflow');
  return arr;
}

function renderOpponents(players, currentPlayerId) {
  const opponents = players.filter(p => p.id !== myId);
  const seatTop = document.getElementById('seatTop');
  const seatLeft = document.getElementById('seatLeft');
  const seatRight = document.getElementById('seatRight');
  const overflow = document.getElementById('overflowSeats');
  [seatTop, seatLeft, seatRight, overflow].forEach(el => (el.innerHTML = ''));

  const slots = assignSeats(opponents.length);

  opponents.forEach((p, i) => {
    const slot = slots[i];
    const target = slot === 'top' ? seatTop : slot === 'left' ? seatLeft : slot === 'right' ? seatRight : overflow;

    const seatEl = document.createElement('div');
    seatEl.className = 'opponent-seat' + (p.id === currentPlayerId ? ' active-turn' : '');
    seatEl.innerHTML = `
      <div class="opponent-name">${escapeHtml(p.name)} (${p.count})</div>
      <div class="opponent-cards">${renderCardBacks(p.count)}</div>
      ${p.vulnerable ? `<button class="catch-btn" onclick="catchPlayer('${p.id}')">จับผิด!</button>` : ''}
    `;
    target.appendChild(seatEl);
  });
}

function renderCardBacks(count) {
  const shown = Math.min(count, 7);
  let html = '';
  for (let i = 0; i < shown; i++) html += `<div class="mini-card-back"></div>`;
  return html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function catchPlayer(targetId) {
  socket.emit('catchUnoFail', { targetId });
}

// ---------- แสดงว่าตาใคร ----------
function renderTurnIndicator(players, currentPlayerId) {
  const el = document.getElementById('turnIndicator');
  if (currentPlayerId === myId) {
    el.textContent = '🔥 ตาของคุณ';
  } else {
    const p = players.find(pl => pl.id === currentPlayerId);
    el.textContent = p ? `รอ ${p.name} เล่น...` : '';
  }
}

// ---------- ปุ่ม UNO ----------
function renderUnoButton(players) {
  const me = players.find(p => p.id === myId);
  const btn = document.getElementById('unoBtn');
  if (me && (me.count === 1 || me.count === 2) && !me.calledUno) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

document.getElementById('unoBtn').onclick = () => socket.emit('callUno');
document.getElementById('drawPile').onclick = () => socket.emit('drawCard');

// ---------- toast แจ้งเตือน ----------
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ---------- ธีม ----------
document.querySelectorAll('.theme-switcher button').forEach(btn => {
  btn.onclick = () => {
    document.documentElement.setAttribute('data-theme', btn.dataset.theme);
    localStorage.setItem('uno-theme', btn.dataset.theme);
  };
});
const savedTheme = localStorage.getItem('uno-theme');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);