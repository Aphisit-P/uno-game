// game.js
const COLORS = ['red', 'yellow', 'green', 'blue'];
const VALUES = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw2'];

function createDeck() {
  const deck = [];
  COLORS.forEach(color => {
    VALUES.forEach(value => {
      deck.push({ color, value });
      if (value !== '0') deck.push({ color, value }); // 2 ใบสำหรับ 1-9,skip,reverse,draw2
    });
  });
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild' });
    deck.push({ color: 'wild', value: 'wild4' });
  }
  return shuffle(deck);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

class UnoGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = []; // { id, name, hand: [] }
    this.deck = createDeck();
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.direction = 1; // 1 = ตามเข็ม, -1 = ทวนเข็ม
    this.started = false;
    this.unoCalledBy = new Set(); // เก็บ playerId ที่กดปุ่ม UNO แล้วในรอบนี้
  }

  addPlayer(id, name) {
    this.players.push({ id, name, hand: [] });
  }

  start() {
    this.players.forEach(p => {
      p.hand = this.deck.splice(0, 7);
    });
    // ใบแรกต้องไม่ใช่ wild4
    let first;
    do {
      first = this.deck.pop();
      this.discardPile.push(first);
    } while (first.color === 'wild');
    this.started = true;
  }

  currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  topCard() {
    return this.discardPile[this.discardPile.length - 1];
  }

  isValidPlay(card) {
    const top = this.topCard();
    return card.color === 'wild' || card.color === top.color || card.value === top.value;
  }

  playCard(playerId, cardIndex, chosenColor) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.currentPlayer().id !== playerId) return { error: 'ไม่ใช่ตาของคุณ' };

    const card = player.hand[cardIndex];
    if (!card || !this.isValidPlay(card)) return { error: 'เล่นการ์ดใบนี้ไม่ได้' };

    player.hand.splice(cardIndex, 1);
    if (card.color === 'wild') card.chosenColor = chosenColor;
    this.discardPile.push(card);

    this.applyEffect(card);

    if (player.hand.length === 0) {
      this.unoCalledBy.delete(playerId);
      return { winner: player.name };
    }

    // ถ้าเหลือ 1 ใบ แต่ยังไม่ได้กด UNO -> เปิด "หน้าต่างจับผิด" ให้คนอื่น
    if (player.hand.length === 1 && !this.unoCalledBy.has(playerId)) {
      player.vulnerableToUnoPenalty = true; // ธงบอกว่ายังไม่ปลอดภัย
    } else {
      player.vulnerableToUnoPenalty = false;
    }

    // ถ้าไม่เหลือ 1 ใบแล้ว เคลียร์สถานะ call เก่าทิ้ง (เผื่อรอบหน้า)
    if (player.hand.length !== 1) {
      this.unoCalledBy.delete(playerId);
    }

    this.nextTurn();
    return { success: true };
  }
  // ผู้เล่นกดปุ่ม "UNO!" เพื่อประกาศว่าเหลือใบเดียว
  callUno(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'ไม่พบผู้เล่น' };
    if (player.hand.length !== 1) return { error: 'กด UNO ได้เฉพาะตอนเหลือ 1 ใบเท่านั้น' };

    this.unoCalledBy.add(playerId);
    player.vulnerableToUnoPenalty = false;
    return { success: true, callerName: player.name };
  }

  // ผู้เล่นคนอื่นจับผิดว่ามีคนเหลือ 1 ใบแต่ไม่กด UNO
  catchUnoFail(accuserId, targetId) {
    const target = this.players.find(p => p.id === targetId);
    if (!target) return { error: 'ไม่พบเป้าหมาย' };
    if (target.hand.length !== 1 || this.unoCalledBy.has(targetId)) {
      return { error: 'ผู้เล่นคนนี้ไม่ได้ทำผิดกติกา UNO' };
    }
    // โดนจับได้จริง -> จั่วเพิ่ม 2 ใบเป็นบทลงโทษ
    this.drawCards(targetId, 2);
    target.vulnerableToUnoPenalty = false;
    this.unoCalledBy.delete(targetId);
    return { success: true, targetName: target.name };
  }
  
  applyEffect(card) {
    const n = this.players.length;
    if (card.value === 'reverse') this.direction *= -1;
    if (card.value === 'skip') this.advance(); // ข้ามคนถัดไป
    if (card.value === 'draw2') {
      this.advance();
      this.drawCards(this.currentPlayer().id, 2);
    }
    if (card.value === 'wild4') {
      this.advance();
      this.drawCards(this.currentPlayer().id, 4);
    }
  }

  advance() {
    const n = this.players.length;
    this.currentPlayerIndex = (this.currentPlayerIndex + this.direction + n) % n;
  }

  nextTurn() {
    this.advance();
  }

  drawCards(playerId, count) {
    const player = this.players.find(p => p.id === playerId);
    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) this.reshuffleDiscard();
      player.hand.push(this.deck.pop());
    }
  }

  reshuffleDiscard() {
    const top = this.discardPile.pop();
    this.deck = shuffle(this.discardPile);
    this.discardPile = [top];
  }

  drawForPlayer(playerId) {
    if (this.currentPlayer().id !== playerId) return { error: 'ไม่ใช่ตาของคุณ' };
    this.drawCards(playerId, 1);
    this.nextTurn();
    return { success: true };
  }
}

module.exports = { UnoGame };