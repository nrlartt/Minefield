const configMap = {
  easy: { cols: 9, rows: 9, mines: 10 },
  medium: { cols: 16, rows: 16, mines: 40 },
  hard: { cols: 30, rows: 16, mines: 99 }
};

if (window.self !== window.top) {
  document.body.classList.add('embedded');
}

const boardEl = document.getElementById('board');
const minesLeftEl = document.getElementById('mines-left');
const timerEl = document.getElementById('timer');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const statusEl = document.getElementById('status');
const newGameBtn = document.getElementById('new-game');

let game;

const GAME_ID = 'e4d2c778-a41d-47e8-bbff-4490821495f0';
let sdk = null;
let sdkReady = false;
let pendingSdkPoints = 0;

function initSDK() {
  try {
    if (!window.OpenGameSDK) return;
    sdk = new window.OpenGameSDK({ gameId: GAME_ID, ui: { usePointsWidget: true } });
    sdk.init().then(() => { sdkReady = true; }).catch(() => {});
  } catch (_) {}
}

function sdkAddPoints(points) {
  if (!Number.isFinite(points) || points <= 0) return;
  pendingSdkPoints += Math.floor(points);
}

function flushSdkPoints() {
  if (!sdkReady || !sdk || pendingSdkPoints <= 0) return;
  try { sdk.addPoints(pendingSdkPoints); pendingSdkPoints = 0; } catch (_) {}
}

function sdkSavePoints() {
  if (!sdkReady || !sdk) return;
  flushSdkPoints();
  try { sdk.savePoints(); } catch (_) {}
}

function calculateWinPoints() {
  const difficultyBase = { easy: 120, medium: 260, hard: 520 }[game.mode] || 200;
  const speedBonus = Math.max(0, 240 - game.timer);
  const comboBonus = (game.bestCombo - 1) * 35;
  return Math.min(2400, difficultyBase + speedBonus + comboBonus);
}

function addScore(points) {
  if (!Number.isFinite(points) || points <= 0) return;
  game.score += Math.floor(points);
  sdkAddPoints(points);
  updateHud();
}

function applyRevealReward(revealedCount) {
  if (revealedCount <= 0) return;
  if (revealedCount >= 2) game.combo += 1;
  else game.combo = 1;
  game.bestCombo = Math.max(game.bestCombo, game.combo);

  const base = revealedCount * 4;
  const zeroChainBonus = revealedCount >= 4 ? Math.floor(revealedCount * 1.5) : 0;
  const comboMultiplier = 1 + (game.combo - 1) * 0.12;
  addScore(Math.floor((base + zeroChainBonus) * comboMultiplier));
}

function fitBoardToViewport() {
  if (!game || !boardEl.parentElement) return;
  const areaWidth = Math.max(280, boardEl.parentElement.clientWidth - 24);
  const gap = window.innerWidth <= 900 ? 1 : 2;
  const cellSize = Math.max(14, Math.min(30, Math.floor((areaWidth - (game.cols - 1) * gap) / game.cols)));
  const glyphSize = Math.max(10, Math.floor(cellSize * 0.56));
  boardEl.style.setProperty('--cell-gap', `${gap}px`);
  boardEl.style.setProperty('--cell-size', `${cellSize}px`);
  boardEl.style.setProperty('--glyph-size', `${glyphSize}px`);
  boardEl.style.gridTemplateColumns = `repeat(${game.cols}, var(--cell-size))`;
}

function createGame(mode = 'hard') {
  const cfg = configMap[mode];
  const total = cfg.cols * cfg.rows;

  game = {
    ...cfg,
    mode,
    cells: Array.from({ length: total }, () => ({
      mine: false,
      open: false,
      flagged: false,
      count: 0
    })),
    started: false,
    over: false,
    won: false,
    flagsUsed: 0,
    openedSafe: 0,
    score: 0,
    combo: 1,
    bestCombo: 1,
    timer: 0,
    timerId: null
  };

  boardEl.innerHTML = '';

  for (let i = 0; i < game.cells.length; i++) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.dataset.i = i;
    boardEl.appendChild(cell);
  }

  fitBoardToViewport();
  updateHud();
  setStatus('Ready');
}

function idxToRC(i) {
  return { r: Math.floor(i / game.cols), c: i % game.cols };
}

function rcToIdx(r, c) {
  return r * game.cols + c;
}

function neighbors(i) {
  const { r, c } = idxToRC(i);
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < game.rows && nc >= 0 && nc < game.cols) {
        out.push(rcToIdx(nr, nc));
      }
    }
  }
  return out;
}

function plantMines(firstClickIdx) {
  const blocked = new Set([firstClickIdx, ...neighbors(firstClickIdx)]);
  const choices = [];
  for (let i = 0; i < game.cells.length; i++) {
    if (!blocked.has(i)) choices.push(i);
  }

  for (let m = 0; m < game.mines; m++) {
    const pick = Math.floor(Math.random() * choices.length);
    const idx = choices.splice(pick, 1)[0];
    game.cells[idx].mine = true;
  }

  game.cells.forEach((cell, i) => {
    if (cell.mine) return;
    cell.count = neighbors(i).reduce((acc, n) => acc + (game.cells[n].mine ? 1 : 0), 0);
  });
}

function updateHud() {
  minesLeftEl.textContent = String(game.mines - game.flagsUsed);
  timerEl.textContent = String(game.timer);
  scoreEl.textContent = String(game.score);
  comboEl.textContent = `x${game.combo}`;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function startTimer() {
  game.timerId = setInterval(() => {
    game.timer += 1;
    updateHud();
  }, 1000);
}

function stopTimer() {
  if (game.timerId) clearInterval(game.timerId);
  game.timerId = null;
}

function renderCell(i, animateOpen = false) {
  const model = game.cells[i];
  const el = boardEl.children[i];
  el.className = 'cell';
  el.textContent = '';

  if (model.open) {
    el.classList.add('open');
    if (animateOpen) el.classList.add('reveal-pop');
    if (model.mine) {
      el.classList.add('mine');
      el.innerHTML = '<span class="mine-icon">💣</span>';
    } else if (model.count > 0) {
      el.textContent = model.count;
      el.classList.add(`n${model.count}`);
    }
  } else if (model.flagged) {
    el.classList.add('flagged');
    el.innerHTML = '<span class="flag-icon">🚩</span>';
  }
}

function revealAllMines() {
  game.cells.forEach((cell, i) => {
    if (cell.mine) {
      cell.open = true;
      renderCell(i);
    }
  });
}

function floodOpen(i) {
  const stack = [i];
  let revealed = 0;
  while (stack.length) {
    const cur = stack.pop();
    const cell = game.cells[cur];
    if (cell.open || cell.flagged) continue;
    cell.open = true;
    revealed += 1;
    game.openedSafe += 1;
    renderCell(cur, true);

    if (cell.count === 0) {
      for (const n of neighbors(cur)) {
        const nc = game.cells[n];
        if (!nc.open && !nc.mine && !nc.flagged) stack.push(n);
      }
    }
  }
  return revealed;
}

function checkWin() {
  const safeTotal = game.cells.length - game.mines;
  if (game.openedSafe >= safeTotal) {
    game.won = true;
    game.over = true;
    stopTimer();
    const reward = calculateWinPoints();
    addScore(reward);
    sdkSavePoints();
    setStatus(`You win! 🎉 +${reward} pts`);

    game.cells.forEach((cell, i) => {
      if (cell.mine && !cell.flagged) {
        cell.flagged = true;
        game.flagsUsed += 1;
        renderCell(i);
      }
    });
    updateHud();
  }
}

function openCell(i) {
  if (game.over) return;
  const cell = game.cells[i];
  if (cell.open || cell.flagged) return;

  if (!game.started) {
    game.started = true;
    plantMines(i);
    startTimer();
    setStatus('Playing');
  }

  if (cell.mine) {
    cell.open = true;
    renderCell(i, true);
    revealAllMines();
    game.over = true;
    game.combo = 1;
    stopTimer();
    updateHud();
    sdkSavePoints();
    setStatus('Boom! 💥');
    return;
  }

  const revealed = floodOpen(i);
  applyRevealReward(revealed);
  checkWin();
}

function toggleFlag(i) {
  if (game.over) return;
  const cell = game.cells[i];
  if (cell.open) return;

  if (cell.flagged) {
    cell.flagged = false;
    game.flagsUsed -= 1;
  } else {
    if (game.flagsUsed >= game.mines) return;
    cell.flagged = true;
    game.flagsUsed += 1;
    if (game.started) {
      if (cell.mine) addScore(2);
      else game.score = Math.max(0, game.score - 1);
    }
  }

  renderCell(i);
  updateHud();
}

boardEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.cell');
  if (!btn) return;
  openCell(Number(btn.dataset.i));
});

boardEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const btn = e.target.closest('.cell');
  if (!btn) return;
  toggleFlag(Number(btn.dataset.i));
});

// Mobile long-press = flag
let pressTimer = null;
boardEl.addEventListener('touchstart', (e) => {
  const btn = e.target.closest('.cell');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  pressTimer = setTimeout(() => {
    toggleFlag(i);
    pressTimer = null;
  }, 400);
}, { passive: true });

boardEl.addEventListener('touchend', (e) => {
  const btn = e.target.closest('.cell');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
    openCell(i);
  }
});

newGameBtn.addEventListener('click', () => {
  stopTimer();
  createGame('hard');
});

window.addEventListener('beforeunload', sdkSavePoints);
window.addEventListener('resize', fitBoardToViewport);
setInterval(sdkSavePoints, 30000);

initSDK();
createGame('hard');
