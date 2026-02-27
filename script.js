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
const statusEl = document.getElementById('status');
const newGameBtn = document.getElementById('new-game');

let game;

const GAME_ID = 'e4d2c778-a41d-47e8-bbff-4490821495f0';
let sdk = null;
let sdkReady = false;

function initSDK() {
  try {
    if (!window.OpenGameSDK) return;
    sdk = new window.OpenGameSDK({ gameId: GAME_ID, ui: { usePointsWidget: true } });
    sdk.init().then(() => { sdkReady = true; }).catch(() => {});
  } catch (_) {}
}

function sdkAddPoints(points) {
  if (!sdkReady || !sdk || !Number.isFinite(points) || points <= 0) return;
  try { sdk.addPoints(Math.floor(points)); } catch (_) {}
}

function sdkSavePoints() {
  if (!sdkReady || !sdk) return;
  try { sdk.savePoints(); } catch (_) {}
}

function calculateWinPoints() {
  const difficultyBase = { easy: 120, medium: 260, hard: 520 }[game.mode] || 200;
  const speedBonus = Math.max(0, 240 - game.timer);
  return Math.min(2000, difficultyBase + speedBonus);
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
    timer: 0,
    timerId: null
  };

  boardEl.style.gridTemplateColumns = `repeat(${game.cols}, 28px)`;
  boardEl.innerHTML = '';

  for (let i = 0; i < game.cells.length; i++) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.dataset.i = i;
    boardEl.appendChild(cell);
  }

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
      el.textContent = '💣';
    } else if (model.count > 0) {
      el.textContent = model.count;
      el.classList.add(`n${model.count}`);
    }
  } else if (model.flagged) {
    el.classList.add('flagged');
    el.textContent = '🚩';
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
  while (stack.length) {
    const cur = stack.pop();
    const cell = game.cells[cur];
    if (cell.open || cell.flagged) continue;
    cell.open = true;
    game.openedSafe += 1;
    renderCell(cur, true);

    if (cell.count === 0) {
      for (const n of neighbors(cur)) {
        const nc = game.cells[n];
        if (!nc.open && !nc.mine && !nc.flagged) stack.push(n);
      }
    }
  }
}

function checkWin() {
  const safeTotal = game.cells.length - game.mines;
  if (game.openedSafe >= safeTotal) {
    game.won = true;
    game.over = true;
    stopTimer();
    const reward = calculateWinPoints();
    sdkAddPoints(reward);
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
    stopTimer();
    sdkSavePoints();
    setStatus('Boom! 💥');
    return;
  }

  floodOpen(i);
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
setInterval(sdkSavePoints, 30000);

initSDK();
createGame('hard');
