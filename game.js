const canvas = document.getElementById('carromCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const remainingEl = document.getElementById('remaining');
const strikerSlider = document.getElementById('strikerPos');
const resetBtn = document.getElementById('resetBtn');
const rulesBtn = document.getElementById('rulesBtn');
const rulesModal = document.getElementById('rulesModal');
const closeRules = document.getElementById('closeRules');

const BOARD_SIZE = 500;
const BORDER_MARGIN = 25;
const POCKET_RADIUS = 20;
const COIN_RADIUS = 10;
const STRIKER_RADIUS = 14;

let score = 0;
let gameState = 'AIMING'; // AIMING, MOVING, GAMEOVER
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragCurrent = { x: 0, y: 0 };

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
    this.type = type;
    this.color = color;
    this.scoreValue = scoreValue;
    this.mass = mass;
    this.active = true;
  }

  update() {
    if (!this.active) return;

    this.x += this.vx;
    this.y += this.vy;

    // Apply Friction
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

    // Inner ring decoration
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = (this.type === 'black') ? '#555' : '#888';
    ctx.stroke();

    ctx.restore();
  }
}

let pieces = [];
let striker;

function initGame() {
  score = 0;
  scoreEl.textContent = score;
  gameState = 'AIMING';
  strikerSlider.value = 250;
  strikerSlider.disabled = false;

  pieces = [];

  // Striker
  striker = new Piece(250, 400, STRIKER_RADIUS, 'striker', '#00bfff', 0, 2.2);

  // Queen (Center)
  pieces.push(new Piece(250, 250, COIN_RADIUS, 'queen', '#e74c3c', 50, 1.0));

  // Inner ring (6 coins)
  const innerColors = ['#f5f5dc', '#2c3e50', '#f5f5dc', '#2c3e50', '#f5f5dc', '#2c3e50'];
  const innerTypes = ['white', 'black', 'white', 'black', 'white', 'black'];
  const innerScores = [10, 5, 10, 5, 10, 5];

  for (let i = 0; i < 6; i++) {
    const angle = (i * 60) * Math.PI / 180;
    const x = 250 + Math.cos(angle) * 21;
    const y = 250 + Math.sin(angle) * 21;
    pieces.push(new Piece(x, y, COIN_RADIUS, innerTypes[i], innerColors[i], innerScores[i], 1.0));
  }

  // Outer ring (12 coins)
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

// 2D Elastic Circle Collisions
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

        // Separate circles to prevent sticking
        const overlap = minDist - dist;
        p1.x -= nx * overlap * 0.5;
        p1.y -= ny * overlap * 0.5;
        p2.x += nx * overlap * 0.5;
        p2.y += ny * overlap * 0.5;

        // Tangent
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
          // Striker Foul (-10 points)
          score = Math.max(0, score - 10);
          scoreEl.textContent = score;
          obj.vx = 0;
          obj.vy = 0;
          obj.x = parseFloat(strikerSlider.value);
          obj.y = 400;
        } else {
          // Coin potted
          obj.active = false;
          obj.vx = 0;
          obj.vy = 0;
          score += obj.scoreValue;
          scoreEl.textContent = score;
          updateRemainingCount();
        }
      }
    });
  });
}

function updatePhysics() {
  const SUB_STEPS = 4;
  for (let step = 0; step < SUB_STEPS; step++) {
    pieces.forEach(p => p.update());
    striker.update();
    resolveCollisions();
    checkPockets();
  }

  // Check if pieces stopped moving
  if (gameState === 'MOVING') {
    let moving = Math.hypot(striker.vx, striker.vy) > 0.1 ||
                 pieces.some(p => p.active && Math.hypot(p.vx, p.vy) > 0.1);

    if (!moving) {
      gameState = 'AIMING';
      strikerSlider.disabled = false;
      striker.vx = 0;
      striker.vy = 0;
      striker.x = parseFloat(strikerSlider.value);
      striker.y = 400;
    }
  }
}

function drawBoard() {
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  // Outer Wooden Frame
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

  // Baseline rendering
  const drawBaseline = (y) => {
    ctx.beginPath();
    ctx.moveTo(110, y);
    ctx.lineTo(390, y);
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    [110, 390].forEach(x => {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#e74c3c';
      ctx.fill();
      ctx.stroke();
    });
  };

  drawBaseline(400); // Bottom baseline
  drawBaseline(100); // Top baseline

  // Draw Pieces
  pieces.forEach(p => p.draw());
  striker.draw();

  // Aim Vector Visualizer
  if (isDragging && gameState === 'AIMING') {
    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const power = Math.min(Math.hypot(dx, dy), 120);
    const angle = Math.atan2(dy, dx);

    // Aim Trajectory Line
    ctx.beginPath();
    ctx.moveTo(striker.x, striker.y);
    ctx.lineTo(striker.x + Math.cos(angle) * power * 1.5, striker.y + Math.sin(angle) * power * 1.5);
    ctx.strokeStyle = 'rgba(231, 76, 60, 0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Elastic Pull Line
    ctx.beginPath();
    ctx.moveTo(striker.x, striker.y);
    ctx.lineTo(dragCurrent.x, dragCurrent.y);
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Game Over Overlay
  if (gameState === 'GAMEOVER') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    ctx.fillStyle = '#f39c12';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('BOARD CLEARED!', 250, 230);
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.fillText(`Final Score: ${score}`, 250, 270);
  }
}

function gameLoop() {
  updatePhysics();
  drawBoard();
  requestAnimationFrame(gameLoop);
}

// Controls & Interaction
strikerSlider.addEventListener('input', (e) => {
  if (gameState === 'AIMING') {
    striker.x = parseFloat(e.target.value);
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (gameState !== 'AIMING') return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  isDragging = true;
  dragStart = { x: mouseX, y: mouseY };
  dragCurrent = { x: mouseX, y: mouseY };
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  dragCurrent = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
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

// Rules Modal Events
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