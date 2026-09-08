const canvas = document.getElementById('carromCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const remainingEl = document.getElementById('remaining');
const p1ScoreEl = document.getElementById('p1Score');
const p2ScoreEl = document.getElementById('p2Score');
const strikerSlider = document.getElementById('strikerPos');
const resetBtn = document.getElementById('resetBtn');
const rulesBtn = document.getElementById('rulesBtn');
const rulesModal = document.getElementById('rulesModal');
const closeRules = document.getElementById('closeRules');
const modeSelect = document.getElementById('modeSelect');
const turnBadge = document.getElementById('turn-badge');

const singleBoard = document.getElementById('single-score-board');
const multiBoard = document.getElementById('multi-score-board');

const BOARD_SIZE = 500;
const BORDER_MARGIN = 25;
const POCKET_RADIUS = 20;
const COIN_RADIUS = 10;
const STRIKER_RADIUS = 14;

let gameMode = 'single'; // 'single' or 'multi'
let currentPlayer = 1; // 1 (White, Bottom) or 2 (Black, Top)
let p1Score = 0;
let p2Score = 0;
let singleScore = 0;

let gameState = 'AIMING'; // AIMING, MOVING, GAMEOVER
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragCurrent = { x: 0, y: 0 };

// Track shots
let coinsPocketedThisTurn = [];
let strikerFouledThisTurn = false;

const pockets = [
  { x: BORDER_MARGIN + 5, y: BORDER_MARGIN + 5 },
  { x: BOARD_SIZE - BORDER_MARGIN - 5, y: BORDER_MARGIN + 5 },
  { x: BORDER_MARGIN + 5, y: BOARD_SIZE - BORDER_MARGIN - 5 },
  { x: BOARD_SIZE - BORDER_MARGIN - 5, y: BOARD_SIZE - BORDER_MARGIN - 5 }
];

class Piece {
  constructor(x, y, radius, type, color, scoreValue, mass = 1) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = radius;
    this.type = type; // 'white', 'black', 'queen', 'striker'
    this.color = color;
    this.scoreValue = scoreValue;
    this.mass = mass;
    this.active = true;
  }

  update() {
    if (!this.active) return;

    this.x += this.vx;
    this.y += this.vy;

    // Friction
    this.vx *= 0.982;
    this.vy *= 0.982;

    if (Math.hypot(this.vx, this.vy) < 0.05) {
      this.vx = 0;
      this.vy = 0;
    }

    // Wall bounce
    const minX = BORDER_MARGIN + this.radius;
    const maxX = BOARD_SIZE - BORDER_MARGIN - this.radius;
    const minY = BORDER_MARGIN + this.radius;
    const maxY = BOARD_SIZE - BORDER_MARGIN - this.radius;

    if (this.x < minX) { this.x = minX; this.vx *= -0.85; }
    if (this.x > maxX) { this.x = maxX; this.vx *= -0.85; }
    if (this.y < minY) { this.y = minY; this.vy *= -0.85; }
    if (this.y > maxY) { this.y = maxY; this.vy *= -0.85; }
  }

  draw() {
    if (!this.active) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#1a1a1a';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = (this.type === 'black') ? '#555' : '#888';
    ctx.stroke();

    ctx.restore();
  }
}

let pieces = [];
let striker;

function getBaselineY() {
  return (gameMode === 'multi' && currentPlayer === 2) ? 100 : 400;
}

function updateTurnBadge() {
  if (gameMode === 'multi') {
    turnBadge.classList.remove('hidden');
    turnBadge.textContent = `Player ${currentPlayer}'s Turn (${currentPlayer === 1 ? 'White' : 'Black'})`;
    turnBadge.style.backgroundColor = (currentPlayer === 1) ? '#27ae60' : '#2980b9';
  } else {
    turnBadge.classList.add('hidden');
  }
}

function initGame() {
  singleScore = 0;
  p1Score = 0;
  p2Score = 0;
  currentPlayer = 1;
  gameState = 'AIMING';

  scoreEl.textContent = singleScore;
  p1ScoreEl.textContent = p1Score;
  p2ScoreEl.textContent = p2Score;

  strikerSlider.value = 250;
  strikerSlider.disabled = false;

  updateTurnBadge();

  pieces = [];

  // Striker
  striker = new Piece(250, getBaselineY(), STRIKER_RADIUS, 'striker', '#00bfff', 0, 2.2);

  // Queen
  pieces.push(new Piece(250, 250, COIN_RADIUS, 'queen', '#e74c3c', 50, 1.0));

  // Inner ring
  const innerColors = ['#f5f5dc', '#2c3e50', '#f5f5dc', '#2c3e50', '#f5f5dc', '#2c3e50'];
  const innerTypes = ['white', 'black', 'white', 'black', 'white', 'black'];
  const innerScores = [10, 5, 10, 5, 10, 5];

  for (let i = 0; i < 6; i++) {
    const angle = (i * 60) * Math.PI / 180;
    const x = 250 + Math.cos(angle) * 21;
    const y = 250 + Math.sin(angle) * 21;
    pieces.push(new Piece(x, y, COIN_RADIUS, innerTypes[i], innerColors[i], innerScores[i], 1.0));
  }

  // Outer ring
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 + 15) * Math.PI / 180;
    const x = 250 + Math.cos(angle) * 42;
    const y = 250 + Math.sin(angle) * 42;
    const isWhite = i % 2 === 0;
    pieces.push(new Piece(
      x, y, COIN_RADIUS,
      isWhite ? 'white' : 'black',
      isWhite ? '#f5f5dc' : '#2c3e50',
      isWhite ? 10 : 5,
      1.0
    ));
  }

  updateRemainingCount();
}

function updateRemainingCount() {
  const activeCoins = pieces.filter(p => p.active).length;
  remainingEl.textContent = activeCoins;
  if (activeCoins === 0) {
    gameState = 'GAMEOVER';
  }
}

function resolveCollisions() {
  const allObjects = [...pieces.filter(p => p.active), striker];

  for (let i = 0; i < allObjects.length; i++) {
    for (let j = i + 1; j < allObjects.length; j++) {
      const p1 = allObjects[i];
      const p2 = allObjects[j];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = p1.radius + p2.radius;

      if (dist < minDist) {
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);

        const overlap = minDist - dist;
        p1.x -= nx * overlap * 0.5;
        p1.y -= ny * overlap * 0.5;
        p2.x += nx * overlap * 0.5;
        p2.y += ny * overlap * 0.5;

        const tx = -ny;
        const ty = nx;

        const dpTan1 = p1.vx * tx + p1.vy * ty;
        const dpTan2 = p2.vx * tx + p2.vy * ty;

        const dpNorm1 = p1.vx * nx + p1.vy * ny;
        const dpNorm2 = p2.vx * nx + p2.vy * ny;

        const m1 = p1.mass;
        const m2 = p2.mass;

        const mom1 = (dpNorm1 * (m1 - m2) + 2 * m2 * dpNorm2) / (m1 + m2);
        const mom2 = (dpNorm2 * (m2 - m1) + 2 * m1 * dpNorm1) / (m1 + m2);

        p1.vx = (tx * dpTan1 + nx * mom1) * 0.92;
        p1.vy = (ty * dpTan1 + ny * mom1) * 0.92;
        p2.vx = (tx * dpTan2 + nx * mom2) * 0.92;
        p2.vy = (ty * dpTan2 + ny * mom2) * 0.92;
      }
    }
  }
}

function checkPockets() {
  const allObjects = [...pieces.filter(p => p.active), striker];

  allObjects.forEach(obj => {
    pockets.forEach(pocket => {
      const dist = Math.hypot(obj.x - pocket.x, obj.y - pocket.y);
      if (dist < POCKET_RADIUS + 2) {
        if (obj === striker) {
          strikerFouledThisTurn = true;
          obj.vx = 0;
          obj.vy = 0;
          obj.x = parseFloat(strikerSlider.value);
          obj.y = getBaselineY();
        } else {
          obj.active = false;
          obj.vx = 0;
          obj.vy = 0;
          coinsPocketedThisTurn.push(obj);
          updateRemainingCount();
        }
      }
    });
  });
}

function evaluateTurn() {
  if (gameMode === 'single') {
    if (strikerFouledThisTurn) {
      singleScore = Math.max(0, singleScore - 10);
    }
    coinsPocketedThisTurn.forEach(coin => {
      singleScore += coin.scoreValue;
    });
    scoreEl.textContent = singleScore;
  } else {
    // Pass & Play (2 Player)
    let extraTurn = false;

    if (strikerFouledThisTurn) {
      if (currentPlayer === 1) p1Score = Math.max(0, p1Score - 10);
      else p2Score = Math.max(0, p2Score - 10);
    }

    coinsPocketedThisTurn.forEach(coin => {
      if (coin.type === 'queen') {
        if (currentPlayer === 1) p1Score += 50;
        else p2Score += 50;
        extraTurn = true;
      } else if (coin.type === 'white') {
        p1Score += 10;
        if (currentPlayer === 1) extraTurn = true;
      } else if (coin.type === 'black') {
        p2Score += 5;
        if (currentPlayer === 2) extraTurn = true;
      }
    });

    p1ScoreEl.textContent = p1Score;
    p2ScoreEl.textContent = p2Score;

    // Switch turns if no valid coin potted or foul occurred
    if (strikerFouledThisTurn || !extraTurn) {
      currentPlayer = (currentPlayer === 1) ? 2 : 1;
    }

    updateTurnBadge();
  }

  // Reset turn tracking
  coinsPocketedThisTurn = [];
  strikerFouledThisTurn = false;
}

function updatePhysics() {
  const SUB_STEPS = 4;
  for (let step = 0; step < SUB_STEPS; step++) {
    pieces.forEach(p => p.update());
    striker.update();
    resolveCollisions();
    checkPockets();
  }

  if (gameState === 'MOVING') {
    let moving = Math.hypot(striker.vx, striker.vy) > 0.1 ||
                 pieces.some(p => p.active && Math.hypot(p.vx, p.vy) > 0.1);

    if (!moving) {
      evaluateTurn();
      gameState = 'AIMING';
      strikerSlider.disabled = false;
      striker.vx = 0;
      striker.vy = 0;
      striker.x = parseFloat(strikerSlider.value);
      striker.y = getBaselineY();
    }
  }
}

function drawBoard() {
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  // Outer Frame
  ctx.fillStyle = '#4a2e18';
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  // Playing Surface
  ctx.fillStyle = '#f4e0c0';
  ctx.fillRect(BORDER_MARGIN, BORDER_MARGIN, BOARD_SIZE - 2 * BORDER_MARGIN, BOARD_SIZE - 2 * BORDER_MARGIN);

  // Pockets
  pockets.forEach(pocket => {
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#777';
    ctx.stroke();
  });

  // Center Circles
  ctx.beginPath();
  ctx.arc(250, 250, 45, 0, Math.PI * 2);
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(250, 250, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#e74c3c';
  ctx.fill();

  // Baselines
  const drawBaseline = (y, active) => {
    ctx.beginPath();
    ctx.moveTo(110, y);
    ctx.lineTo(390, y);
    ctx.strokeStyle = active ? '#e74c3c' : '#bdc3c7';
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();

    [110, 390].forEach(x => {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#e74c3c' : '#bdc3c7';
      ctx.fill();
      ctx.stroke();
    });
  };

  drawBaseline(400, gameMode === 'single' || currentPlayer === 1);
  drawBaseline(100, gameMode === 'multi' && currentPlayer === 2);

  // Pieces
  pieces.forEach(p => p.draw());
  striker.draw();

  // Aim Visualizer
  if (isDragging && gameState === 'AIMING') {
    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const power = Math.min(Math.hypot(dx, dy), 120);
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.moveTo(striker.x, striker.y);
    ctx.lineTo(striker.x + Math.cos(angle) * power * 1.5, striker.y + Math.sin(angle) * power * 1.5);
    ctx.strokeStyle = 'rgba(231, 76, 60, 0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(striker.x, striker.y);
    ctx.lineTo(dragCurrent.x, dragCurrent.y);
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Game Over
  if (gameState === 'GAMEOVER') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    ctx.fillStyle = '#f39c12';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';

    if (gameMode === 'single') {
      ctx.fillText('BOARD CLEARED!', 250, 230);
      ctx.fillStyle = '#fff';
      ctx.font = '20px Arial';
      ctx.fillText(`Final Score: ${singleScore}`, 250, 270);
    } else {
      let winnerText = "IT'S A TIE!";
      if (p1Score > p2Score) winnerText = 'PLAYER 1 WINS!';
      else if (p2Score > p1Score) winnerText = 'PLAYER 2 WINS!';

      ctx.fillText(winnerText, 250, 220);
      ctx.fillStyle = '#fff';
      ctx.font = '18px Arial';
      ctx.fillText(`P1 (White): ${p1Score}  |  P2 (Black): ${p2Score}`, 250, 260);
    }
  }
}

function gameLoop() {
  updatePhysics();
  drawBoard();
  requestAnimationFrame(gameLoop);
}

// Mode Selection Handler
modeSelect.addEventListener('change', (e) => {
  gameMode = e.target.value;
  if (gameMode === 'single') {
    singleBoard.classList.remove('hidden');
    multiBoard.classList.add('hidden');
  } else {
    singleBoard.classList.add('hidden');
    multiBoard.classList.remove('hidden');
  }
  initGame();
});

strikerSlider.addEventListener('input', (e) => {
  if (gameState === 'AIMING') {
    striker.x = parseFloat(e.target.value);
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (gameState !== 'AIMING') return;

  const rect = canvas.getBoundingClientRect();
  isDragging = true;
  dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  dragCurrent = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  dragCurrent = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});

window.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging = false;

  if (gameState === 'AIMING') {
    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const power = Math.min(Math.hypot(dx, dy), 120);

    if (power > 5) {
      const angle = Math.atan2(dy, dx);
      const forceMultiplier = 0.18;

      striker.vx = Math.cos(angle) * power * forceMultiplier;
      striker.vy = Math.sin(angle) * power * forceMultiplier;

      gameState = 'MOVING';
      strikerSlider.disabled = true;
    }
  }
});

resetBtn.addEventListener('click', () => {
  initGame();
});

rulesBtn.addEventListener('click', () => {
  rulesModal.classList.remove('hidden');
});

closeRules.addEventListener('click', () => {
  rulesModal.classList.add('hidden');
});

rulesModal.addEventListener('click', (e) => {
  if (e.target === rulesModal) {
    rulesModal.classList.add('hidden');
  }
});

// Start Game
initGame();
gameLoop();