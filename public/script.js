const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] }); // ถ้า deploy คนละโดเมน ใส่ io('https://your-server.com')

const params = new URLSearchParams(location.search);
const roomId = params.get('room') || 'default-room';
const name = prompt('ใส่ชื่อของคุณ') || 'Player';
const name = sessionStorage.getItem('playerName');

socket.emit('joinRoom', { roomId, name });

socket.on('gameState', (state) => {
  renderHand(state.yourHand);
  renderTopCard(state.topCard);
  renderPlayers(state.players, state.currentPlayerId);
});

if (!roomId || !name) {
  location.href = 'lobby.html'; // กันเคสเข้ามาตรง ๆ โดยไม่มีข้อมูล
}

socket.emit('joinRoom', { roomId, name });

function renderHand(hand) {
  const container = document.getElementById('hand');
  container.innerHTML = '';
  hand.forEach((card, index) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.style.background = card.color === 'wild' ? '#333' : cardColorHex(card.color);
    el.textContent = card.value;
    el.onclick = () => handleCardClick(card, index);
    container.appendChild(el);
  });
}

function handleCardClick(card, index) {
  if (card.color === 'wild') {
    const chosen = prompt('เลือกสี: red, yellow, green, blue');
    socket.emit('playCard', { cardIndex: index, chosenColor: chosen });
  } else {
    socket.emit('playCard', { cardIndex: index });
  }
}

function cardColorHex(color) {
  return { red: '#d32f2f', yellow: '#fbc02d', green: '#388e3c', blue: '#1976d2' }[color];
}

socket.on('unoAnnounced', ({ name }) => {
  showToast(`🎉 ${name} กด UNO แล้ว!`);
});

socket.on('unoPenalty', ({ name }) => {
  showToast(`⚠️ ${name} โดนจับได้ว่าลืมกด UNO! จั่วเพิ่ม 2 ใบ`);
});

document.getElementById('unoBtn').onclick = () => socket.emit('callUno');

function renderPlayers(players, currentId) {
  const container = document.getElementById('players');
  container.innerHTML = '';
  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'player-badge' + (p.id === currentId ? ' active-turn' : '');
    el.innerHTML = `
      <span>${p.name} (${p.count})</span>
      ${p.vulnerable ? `<button class="catch-btn" onclick="catchPlayer('${p.id}')">จับผิด!</button>` : ''}
    `;
    container.appendChild(el);
  });
}

function catchPlayer(targetId) {
  socket.emit('catchUnoFail', { targetId });
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

document.getElementById('drawBtn').onclick = () => socket.emit('drawCard');
document.getElementById('startBtn').onclick = () => socket.emit('startGame');

// ระบบเปลี่ยนธีม
document.querySelectorAll('.theme-switcher button').forEach(btn => {
  btn.onclick = () => {
    const theme = btn.dataset.theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uno-theme', theme);
  };
});

// โหลดธีมที่เคยเลือกไว้
const savedTheme = localStorage.getItem('uno-theme');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

// เก็บตำแหน่งการ์ดก่อนอัปเดต DOM
function getCardPositions(container) {
  const positions = new Map();
  container.querySelectorAll('.card').forEach(el => {
    positions.set(el.dataset.cardId, el.getBoundingClientRect());
  });
  return positions;
}

// เล่น FLIP animation หลังอัปเดต DOM เสร็จ
function playFlipAnimation(container, oldPositions) {
  container.querySelectorAll('.card').forEach(el => {
    const id = el.dataset.cardId;
    const oldRect = oldPositions.get(id);
    if (!oldRect) return; // การ์ดใหม่ ไม่มีตำแหน่งเก่า ข้ามไป

    const newRect = el.getBoundingClientRect();
    const deltaX = oldRect.left - newRect.left;
    const deltaY = oldRect.top - newRect.top;

    if (deltaX || deltaY) {
      el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      el.style.transition = 'none';
      requestAnimationFrame(() => {
        el.style.transform = '';
        el.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
      });
    }
  });
}

// แก้ renderHand เดิมให้รองรับ FLIP + ใส่ id ให้การ์ดแต่ละใบ (คงที่ตามตำแหน่งจริง)
function renderHand(hand) {
  const container = document.getElementById('hand');
  const oldPositions = getCardPositions(container);

  container.innerHTML = '';
  hand.forEach((card, index) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.cardId = `${card.color}-${card.value}-${index}`; // key ชั่วคราว
    el.style.background = card.color === 'wild' ? '#333' : cardColorHex(card.color);
    el.textContent = card.value;
    el.onclick = () => handleCardClick(card, index, el);
    container.appendChild(el);
  });

  playFlipAnimation(container, oldPositions);
}

function handleCardClick(card, index, cardEl) {
  const targetPile = document.getElementById('topCard');
  const startRect = cardEl.getBoundingClientRect();
  const endRect = targetPile.getBoundingClientRect();

  // สร้างการ์ด "โคลน" ลอยไปกองกลาง เพื่อไม่ต้องรอ server ตอบ
  const flyingCard = cardEl.cloneNode(true);
  flyingCard.style.position = 'fixed';
  flyingCard.style.left = `${startRect.left}px`;
  flyingCard.style.top = `${startRect.top}px`;
  flyingCard.style.width = `${startRect.width}px`;
  flyingCard.style.height = `${startRect.height}px`;
  flyingCard.style.margin = '0';
  flyingCard.style.zIndex = '999';
  flyingCard.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
  document.body.appendChild(flyingCard);

  cardEl.style.visibility = 'hidden'; // ซ่อนใบจริงไว้ก่อน

  requestAnimationFrame(() => {
    flyingCard.style.left = `${endRect.left}px`;
    flyingCard.style.top = `${endRect.top}px`;
    flyingCard.style.transform = 'rotate(360deg)';
  });

  setTimeout(() => flyingCard.remove(), 400);

  if (card.color === 'wild') {
    const chosen = prompt('เลือกสี: red, yellow, green, blue');
    socket.emit('playCard', { cardIndex: index, chosenColor: chosen });
  } else {
    socket.emit('playCard', { cardIndex: index });
  }
}

document.getElementById('drawBtn').onclick = () => {
  const drawPile = document.getElementById('drawPile');
  const hand = document.getElementById('hand');
  const startRect = drawPile.getBoundingClientRect();
  const endRect = hand.getBoundingClientRect();

  const flyingCard = document.createElement('div');
  flyingCard.className = 'card';
  flyingCard.style.position = 'fixed';
  flyingCard.style.left = `${startRect.left}px`;
  flyingCard.style.top = `${startRect.top}px`;
  flyingCard.style.background = 'var(--card-back)';
  flyingCard.style.zIndex = '999';
  flyingCard.style.transition = 'all 0.35s ease-out';
  document.body.appendChild(flyingCard);

  requestAnimationFrame(() => {
    flyingCard.style.left = `${endRect.left + endRect.width}px`;
    flyingCard.style.top = `${endRect.top}px`;
  });

  setTimeout(() => flyingCard.remove(), 350);
  socket.emit('drawCard');
};