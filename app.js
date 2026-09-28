/* Connect Four X — main app (game core, NEUMAI, pass & play, review, stats, settings). */
(() => {
  'use strict';
  const W = 7, H = 6, WIN = 100000, MATE = WIN - 100;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const cx = c => 70 + 100 * c, cy = r => 670 - 100 * r, R = 42;
  const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reducedMQ.matches;
  const wide = () => matchMedia('(min-width: 900px)').matches;
  const fmtN = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n || 0));
  const fmtMs = ms => (ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------------- storage ----------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const prefs = Object.assign({
    skin: 'neon', sound: true, haptics: true, persona: 'grandmaster', tier: 'impossible', first: 'me',
    blitz: 0, powerups: true, p1name: 'Player 1', p2name: 'Player 2', lblitz: 0, lhints: false, oblitz: 0
  }, store.get('c4x-prefs', {}));
  const savePrefs = () => store.set('c4x-prefs', prefs);
  let history = store.get('c4x-history', []);
  const saveHistory = () => { history = history.slice(-250); store.set('c4x-history', history); };

  const TIERS = {
    tough: { label: 'Hard', ms: 350, note: 'Thinks for a moment. Beatable if you are sharp.' },
    brutal: { label: 'Very hard', ms: 1500, note: 'Looks much deeper and rarely slips.' },
    impossible: { label: 'Impossible', ms: 4000, note: 'Full power, plus a perfect online solver when the internet allows it.' }
  };
  const SKINS = {
    neon: { label: 'Neon Cyberpunk', theme: '#07060F', sw: ['#FF2E88', '#22E6FF', '#2A1E66'] },
    wood: { label: 'Wood & Marble', theme: '#E9E6E1', sw: ['#B3261E', '#F1E6CC', '#9A5B2E'] },
    minimal: { label: 'Minimal Dark', theme: '#111214', sw: ['#FF6B5B', '#EDEDED', '#24272D'] },
    arcade: { label: 'Retro Arcade', theme: '#000000', sw: ['#FF3131', '#FFE600', '#1F2BFF'] }
  };
  function applySkin() {
    document.documentElement.dataset.skin = prefs.skin;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', SKINS[prefs.skin].theme);
  }
  applySkin();

  // ---------------- sound + haptics ----------------
  const Snd = {
    ctx: null, master: null,
    init() {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = .9; this.master.connect(this.ctx.destination); } catch (e) { return; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    ok() { return prefs.sound && this.ctx && this.ctx.state === 'running'; },
    tone(f, dur, type = 'sine', vol = .2, at = 0, f2) {
      if (!this.ok()) return;
      const t = this.ctx.currentTime + at, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .02);
    },
    noise(dur, vol, at = 0, freq = 2000, freq2) {
      if (!this.ok()) return;
      const t = this.ctx.currentTime + at, n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = this.ctx.createBufferSource(), fl = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      s.buffer = buf; fl.type = 'bandpass'; fl.Q.value = 1.2; fl.frequency.setValueAtTime(freq, t);
      if (freq2) fl.frequency.exponentialRampToValueAtTime(freq2, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t);
    },
    clack(v = 1, high = false) {
      const arcade = prefs.skin === 'arcade';
      if (arcade) { this.tone(high ? 520 : 330, .08, 'square', .12 * v, 0, 120); return; }
      this.tone(high ? 330 : 240, .1, 'triangle', .32 * v, 0, 90);
      this.tone(95, .14, 'sine', .35 * v, 0, 55);
      this.noise(.05, .35 * v, 0, prefs.skin === 'wood' ? 1400 : 2800);
    },
    whoosh() { this.noise(.45, .18, 0, 400, 3000); },
    tap() { this.tone(660, .06, 'sine', .08); },
    hint() { this.tone(880, .12, 'sine', .1); this.tone(1320, .2, 'sine', .1, .1); },
    tick() { this.tone(1500, .03, 'square', .04); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .2, 'square', .07, i * .1));
      [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, .5, 'triangle', .1, .45 + i * .02));
    },
    lose() { [392, 370, 349, 294].forEach((f, i) => this.tone(f, i === 3 ? .7 : .3, 'sawtooth', .05, i * .28, f * .96)); },
    draw() { this.tone(523, .2, 'triangle', .12, 0); this.tone(523, .4, 'triangle', .12, .22); },
    think() { this.tone(1200, .04, 'sine', .035); },
    ding() { this.tone(988, .15, 'sine', .15); this.tone(1319, .3, 'sine', .15, .15); },
    pop() { this.tone(700, .07, 'sine', .1, 0, 1100); }
  };
  const buzz = p => { try { if (prefs.haptics && navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  document.addEventListener('pointerdown', () => Snd.init(), { passive: true });
  document.addEventListener('keydown', () => Snd.init());

  // ---------------- engine client ----------------
  const Engine = (() => {
    let worker = null, id = 0, inlineThink = null;
    const pending = new Map();
    try {
      worker = new Worker('js/engine.js');
      worker.onmessage = e => { const f = pending.get(e.data.id); pending.delete(e.data.id); if (f) f(e.data.res); };
      worker.onerror = () => { worker = null; pending.forEach(f => f(null)); pending.clear(); };
    } catch (e) { worker = null; }
    function inline(moves, ms) {
      inlineThink = inlineThink || (typeof engineFactory === 'function' ? engineFactory() : null);
      return new Promise(res => setTimeout(() => {
        const t0 = Date.now(); const r = inlineThink(moves, Math.min(ms, 1500)); r.time = Date.now() - t0; res(r);
      }, 30));
    }
    // Requests run one at a time in the worker, so a queue keeps timing honest.
    let chain = Promise.resolve();
    function think(moves, ms) {
      const job = chain.then(() => {
        if (!worker) return inline(moves, ms);
        return new Promise(res => { const k = ++id; pending.set(k, res); worker.postMessage({ id: k, moves, ms }); }).then(r => r || inline(moves, ms));
      });
      chain = job.catch(() => {});
      return job;
    }
    return { think };
  })();

  // Free perfect-play solver (reachable from the installed app, blocked in previews).
  let solverDown = false;
  async function askSolver(moves) {
    if (solverDown) throw new Error('down');
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3000);
    try {
      const r = await fetch('https://connect4.gamesolver.org/solve?pos=' + moves.map(c => c + 1).join(''), { signal: ctrl.signal });
      if (!r.ok) throw new Error('status');
      const j = await r.json(); const sc = j && j.score;
      if (!Array.isArray(sc) || sc.length !== 7) throw new Error('data');
      return sc;
    } catch (e) { solverDown = true; throw e; }
    finally { clearTimeout(t); }
  }
  function bestFromSolver(sc, h) {
    let best = -1, bs = -1e9;
    for (const c of [3, 2, 4, 1, 5, 0, 6]) { if (h[c] >= H || sc[c] === 100) continue; if (sc[c] > bs) { bs = sc[c]; best = c; } }
    return { move: best, score: bs };
  }

  // ---------------- personas ----------------
  const PERSONAS = {
    grandmaster: {
      label: 'Arrogant Grandmaster', short: 'Grandmaster', note: 'Cold, confident, and a little smug.',
      open: ['The center. Naturally. Try to keep up.', 'I take the middle. Every master does.'],
      start: ['Another challenger. Make it interesting.', 'Your move. Choose wisely, it matters less than you think.'],
      thinking: ['Calculating your defeat…', 'Give me a moment to see twenty moves ahead.', 'Counting your mistakes…'],
      block: ['Did you really think I missed that?', 'Blocked. Predictable.', 'A threat? How quaint.'],
      pounce: ['That move was a gift. I accept.', 'Ah, the error I was waiting for.', 'You just lost the thread. I have not.'],
      winLock: ['It is over. I win in {n} moves, whatever you do.', 'Forced win locked in. {n} moves to go.', 'Checkmate in all but name. {n} more moves.'],
      solved: ['The position is solved. You cannot escape.', 'I have already won. You just do not know it yet.'],
      doomed: ['Hmm. You have found something strong. Let us see if you know it.', 'Impressive… if you can finish it.'],
      drawLock: ['Perfect play from here is a draw. Do not get ideas.', 'A draw is the best you will get. Take it if you can.'],
      ahead: ['The pressure is building. On you.', 'Every move you make shrinks your options.', 'I like my position. You should not like yours.'],
      even: ['Balanced, for now.', 'An adequate move.', 'Fine. Continue.'],
      behind: ['Interesting. You are making this harder than expected.', 'Not bad. Not enough.'],
      hint: ['Asking for help already?', 'Use your hints. You will need them.', 'Even with a hint, the ending is the same.'],
      undo: ['Taking it back? The board remembers.', 'Rewinding will not change the ending.'],
      aiWin: ['As calculated.', 'Four in a row. Another student educated.', 'Did you expect a different result?'],
      aiLose: ['…Impossible. Reset the board. Now.', 'You won. I will be reviewing this for a long time.'],
      draw: ['A draw. You should frame this.', 'Stalemate. Acceptable, barely.'],
      timeout: ['The clock beat you before I did.', 'Too slow.']
    },
    robot: {
      label: 'Sarcastic Robot', short: 'Robot', note: 'Beeps, boops, and a lot of attitude.',
      open: ['Middle column. Wow, so creative of me.', 'Beep boop. Center. Riveting.'],
      start: ['Oh good, a human. Let us get this over with.', 'Ready when you are. Well, I was ready yesterday.'],
      thinking: ['Processing… just kidding, I already knew.', 'Consulting my three million friends…', 'Loading sarcasm module…'],
      block: ['Nice try. My sensors are not made of cardboard.', 'Blocked. Did you want applause?', 'Oh no, a threat. Anyway.'],
      pounce: ['Oh, you did NOT just do that. Thanks!', 'That move made my circuits very happy.', 'Error detected. Yours.'],
      winLock: ['Fun fact: I win in {n} moves. You can keep clicking though.', 'Spoiler alert: I win in {n}.', '{n} more moves until your sad music plays.'],
      solved: ['I solved this game. You are playing the tutorial.', 'It is mathematically over. Enjoy the ride.'],
      doomed: ['Wait. Are you… good at this? Rude.', 'Hold on, recalculating my self-esteem.'],
      drawLock: ['Congrats, perfect play says draw. Riveting.', 'We are heading for a tie. How thrilling.'],
      ahead: ['Things are looking great. For me.', 'I would say good luck, but I am a robot.', 'Your odds are dropping faster than my patience.'],
      even: ['Even. For now. Enjoy it.', 'Okay, that one was fine.', 'Adequate. I will allow it.'],
      behind: ['I am fine. Everything is fine.', 'Just letting you feel good about yourself.'],
      hint: ['Using a hint? Bold strategy.', 'Cheat codes activated. Cute.', 'Asking the robot for help to beat the robot. Genius.'],
      undo: ['Ctrl+Z, huh? Classic.', 'Rewinding time. Must be nice.'],
      aiWin: ['GG. Well, G for me.', 'Four in a row. Shocking, truly.', 'victory_dance.exe is running.'],
      aiLose: ['I let you win. Obviously. Definitely.', 'System error. Please do not tell the other robots.'],
      draw: ['A tie. Everyone gets a participation trophy.', 'Draw. Thrilling.'],
      timeout: ['Tick tock. Time is up, slowpoke.', 'The clock does not wait. Neither do I.']
    },
    coach: {
      label: 'Encouraging Coach', short: 'Coach', note: 'Friendly tips so you improve every game.',
      open: ['I will start in the center. It is the strongest column, remember that!', 'Center first. Watch how it connects in every direction.'],
      start: ['Let us have a great game! Try to build in the middle.', 'Good luck! Watch my three-in-a-rows.'],
      thinking: ['Let me think it through…', 'Good position. Let me look ahead…', 'Hmm, let me see what you are planning.'],
      block: ['I had to block that. You spotted a real threat, nice!', 'Blocked! That was a strong idea though.', 'Good threat! I needed to stop it.'],
      pounce: ['Careful! That move gave me an opening. Check my threats before you move.', 'Oops, that one hurts. Look for my three-in-a-rows first.', 'Tip: before each move, ask what I can do next.'],
      winLock: ['I can force a win in {n} moves now. Review the game afterwards to find the turning point!', 'I found a forced win in {n}. Keep playing, you will learn from it.'],
      solved: ['The solver says I have a forced win. Review this one after, there is a lesson here!', 'This position is won for me. Let us look at what happened in the review.'],
      doomed: ['You have a winning position! Take your time and find the best move.', 'You are winning! Stay focused.'],
      drawLock: ['With perfect play this is a draw. Great defending!', 'You have held a draw so far. Excellent!'],
      ahead: ['I am slightly ahead. Look for threats on the odd rows.', 'Watch the center columns. That is where I am building.', 'Try to block before my lines reach three.'],
      even: ['Nice move! It is even.', 'Solid. The position is balanced.', 'Good choice. Keep building in the middle.'],
      behind: ['Great play, you are putting pressure on me!', 'You are doing really well. Keep it up!'],
      hint: ['Good idea to check! Look at why that column works.', 'Hints are great for learning. Try to spot the idea yourself next time.'],
      undo: ['Sure, try another idea!', 'Taking it back is how we learn.'],
      aiWin: ['Good game! Tap Review to see the turning point.', 'Well played. Let us find where it slipped in the review.'],
      aiLose: ['You beat me! Fantastic game!', 'Wonderful! You found every right move.'],
      draw: ['A draw against me is a great result!', 'Excellent defense. Draw!'],
      timeout: ['The timer ran out. Try moving a little faster!', 'Time is up! Quick instincts come with practice.']
    }
  };
  const personaLine = (key, vars = {}) => {
    const P = PERSONAS[G.persona] || PERSONAS.grandmaster;
    const arr = P[key]; if (!arr) return '';
    return pick(arr).replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : '');
  };

  // ---------------- game state ----------------
  const newBoard = () => ({ moves: [], board: new Int8Array(42), h: new Int8Array(7) });
  let G = Object.assign(newBoard(), { mode: 'none', over: true, players: [null, {}, {}], token: 0 });
  const turnPiece = () => (G.moves.length % 2 === 0 ? 1 : 2);
  const cur = () => G.players[turnPiece()];
  const active = () => G.mode !== 'none' && G.mode !== 'review' && !G.over;
  const canAct = () => active() && !G.busy && !G.thinking && cur() && cur().kind === 'me';
  const myPiece = () => (G.players[1].kind === 'me' && G.players[2].kind !== 'me' ? 1 : G.players[2].kind === 'me' && G.players[1].kind !== 'me' ? 2 : 0);

  // ---------------- board rendering ----------------
  const stage = $('#stage'), discsEl = $('#discs'), hitsEl = $('#hits'), linesEl = $('#lines'), boardArea = $('#board-area');
  (function drawFace() {
    let d = 'M30 100 H710 A30 30 0 0 1 740 130 V710 A30 30 0 0 1 710 740 H30 A30 30 0 0 1 0 710 V130 A30 30 0 0 1 30 100 Z';
    let rings = '';
    for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) {
      const x = cx(c), y = cy(r), rr = 40;
      d += ` M${x - rr} ${y} a${rr} ${rr} 0 1 0 ${rr * 2} 0 a${rr} ${rr} 0 1 0 ${-rr * 2} 0 Z`;
      rings += `<circle cx="${x}" cy="${y}" r="${rr + 1}"/>`;
    }
    $('#face-path').setAttribute('d', d);
    $('#tex-path').setAttribute('d', d);
    $('#rings').innerHTML = rings;
  })();
  function posDisc(e, c, y) {
    e.style.left = (cx(c) - R) / 7.4 + '%';
    e.style.top = (y - R) / 7.7 + '%';
    e.style.width = (2 * R) / 7.4 + '%';
    e.style.height = (2 * R) / 7.7 + '%';
  }
  const discEls = new Array(42).fill(null);
  const ghostEl = el('div', 'disc p1 ghost hide');
  posDisc(ghostEl, 3, 50); discsEl.appendChild(ghostEl);
  const hits = [];
  for (let c = 0; c < W; c++) {
    const b = el('button', 'hit');
    b.type = 'button'; b.id = 'col-' + c;
    b.setAttribute('aria-label', 'Drop in column ' + (c + 1));
    b.addEventListener('click', () => onColumn(c));
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') ghost(c); });
    b.addEventListener('focus', () => ghost(c));
    hitsEl.appendChild(b); hits.push(b);
  }
  hitsEl.addEventListener('pointerleave', () => ghost(-1));
  let hover = -1;
  function ghost(c) {
    hover = c;
    if (c < 0 || !canAct() || G.h[c] >= H) { ghostEl.classList.add('hide'); return; }
    ghostEl.className = 'disc ghost p' + turnPiece();
    posDisc(ghostEl, c, 50);
  }
  function dropAnim(e, r) {
    if (reduced() || !e.animate) { Snd.clack(1); buzz(15); return Promise.resolve(); }
    const hPx = stage.getBoundingClientRect().height, unit = hPx / 770;
    const startY = -(cy(r) - 50) * unit, cell = 100 * unit, rows = H - r;
    const fall = 170 + rows * 48, total = fall / .6;
    const a = e.animate([
      { transform: `translateY(${startY}px)`, easing: 'cubic-bezier(.5,0,.95,.6)' },
      { transform: 'translateY(0) scale(1.1,.86)', offset: .6, easing: 'ease-out' },
      { transform: `translateY(${-cell * .24}px) scale(.96,1.04)`, offset: .75, easing: 'ease-in' },
      { transform: 'translateY(0) scale(1.05,.93)', offset: .86, easing: 'ease-out' },
      { transform: `translateY(${-cell * .07}px)`, offset: .93, easing: 'ease-in' },
      { transform: 'translateY(0)' }
    ], { duration: total });
    setTimeout(() => { Snd.clack(1, rows > 3); buzz(18); stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); }, total * .6);
    setTimeout(() => Snd.clack(.35, true), total * .86);
    setTimeout(() => Snd.clack(.12, true), total * .99);
    return a.finished.catch(() => {});
  }
  function addDisc(c, r, p, animate) {
    const e = el('div', 'disc p' + p);
    posDisc(e, c, cy(r));
    discsEl.appendChild(e);
    discEls[c * H + r] = e;
    discsEl.querySelectorAll('.disc.last').forEach(d => d.classList.remove('last'));
    e.classList.add('last');
    return animate ? dropAnim(e, r) : Promise.resolve();
  }
  function clearFx() {
    linesEl.innerHTML = '';
    $('#result').hidden = true; $('#result').textContent = '';
    clearHint();
  }
  function renderPosition(moves, upto = moves.length) {
    clearFx();
    discEls.forEach((d, i) => { if (d) d.remove(); discEls[i] = null; });
    const hh = new Int8Array(7);
    for (let i = 0; i < upto; i++) { const c = moves[i]; addDisc(c, hh[c], i % 2 === 0 ? 1 : 2, false); hh[c]++; }
    if (!upto) discsEl.querySelectorAll('.disc.last').forEach(d => d.classList.remove('last'));
  }
  function findWin(board, c, r, p) {
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const line = [[c, r]];
      for (const s of [1, -1]) {
        let a = c + dc * s, b = r + dr * s;
        while (a >= 0 && a < W && b >= 0 && b < H && board[a * H + b] === p) { line.push([a, b]); a += dc * s; b += dr * s; }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }
  // Replays a move list and returns the final state + winner line (for review/sync).
  function replay(moves) {
    const s = newBoard(); let win = null;
    moves.forEach((c, i) => { const p = i % 2 === 0 ? 1 : 2, r = s.h[c]; s.board[c * H + r] = p; s.h[c]++; s.moves.push(c); const l = findWin(s.board, c, r, p); if (l) win = { piece: p, line: l, at: i + 1 }; });
    return { s, win };
  }
  function wouldWin(p, c) {
    if (G.h[c] >= H) return false;
    const r = G.h[c], b = G.board.slice(); b[c * H + r] = p;
    return !!findWin(b, c, r, p);
  }
  function drawWinLine(line) {
    line.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    line.forEach(([c, r]) => { const d = discEls[c * H + r]; if (d) d.classList.add('win'); });
    const a = line[0], b = line[line.length - 1];
    const x1 = cx(a[0]), y1 = cy(a[1]), x2 = cx(b[0]), y2 = cy(b[1]), len = Math.hypot(x2 - x1, y2 - y1);
    linesEl.innerHTML = `<line class="winline" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-dasharray="${len}" stroke-dashoffset="${reduced() ? 0 : len}"/>`;
    const ln = linesEl.firstChild;
    if (!reduced() && ln.animate) ln.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 450, easing: 'ease-out', fill: 'forwards' });
  }
  let hintEls = [];
  function clearHint() { hintEls.forEach(e => e.remove()); hintEls = []; }
  function showHint(c) {
    clearHint();
    const arrow = el('div', 'hint-arrow');
    arrow.style.left = (cx(c) - 42) / 7.4 + '%';
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v14M6 12l6 6 6-6"/></svg>';
    const col = el('div', 'hint-col');
    col.style.left = (cx(c) - 44) / 7.4 + '%';
    stage.append(arrow, col); hintEls = [arrow, col];
  }

  // ---------------- speech bubble + feed ----------------
  let speechTimer = null;
  function speak(text, piece, who) {
    if (!text) return;
    boardArea.querySelectorAll('.speech').forEach(s => s.remove());
    const b = el('div', 'speech ' + (piece === 2 ? 'right' : 'left'));
    const w = el('span', 'who', who || 'NEUMAI'); b.append(w, document.createTextNode(text));
    boardArea.appendChild(b);
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 450); }, 4200);
    feedSay(text, who || 'NEUMAI');
  }
  const paneFeed = $('#pane-feed'), paneChat = $('#pane-chat'), paneMoves = $('#pane-moves');
  function scrollBottom(p) { requestAnimationFrame(() => { p.scrollTop = p.scrollHeight; }); }
  function clearFeed(note) {
    paneFeed.textContent = '';
    if (note) paneFeed.appendChild(el('p', 'empty-note', note));
  }
  function feed(tag, text, cls, mono) {
    paneFeed.querySelector('.empty-note')?.remove();
    const row = el('div', 'feed-row');
    row.append(el('span', 'tag ' + (cls || ''), tag));
    const t = el('div'); t.textContent = text;
    if (mono) { const m = el('div', 'mono', mono); t.appendChild(m); }
    row.appendChild(t);
    paneFeed.appendChild(row); scrollBottom(paneFeed);
    return row;
  }
  function feedSay(text, who) {
    paneFeed.querySelector('.empty-note')?.remove();
    const d = el('div', 'feed-say');
    d.append(el('small', '', who), document.createTextNode(text));
    paneFeed.appendChild(d); scrollBottom(paneFeed);
  }
  function feedMeter(scores, h) {
    const wrap = el('div', 'cols-meter');
    const valid = scores.map((s, c) => (h[c] >= H || s === 100 ? null : s));
    const max = Math.max(1, ...valid.filter(v => v != null).map(Math.abs));
    valid.forEach((v, c) => {
      const d = el('div'); const i = el('i'); const b = el('b');
      if (v != null) {
        b.style.height = Math.max(8, Math.abs(v) / max * 100) + '%';
        b.style.background = v > 0 ? 'var(--good)' : v < 0 ? 'var(--bad)' : 'var(--neutral)';
      }
      i.appendChild(b);
      d.append(i, document.createTextNode(v == null ? '·' : (c + 1) + (v > 0 ? ' W' : v < 0 ? ' L' : ' D')));
      d.title = v == null ? 'Column full' : `Column ${c + 1}: ${v > 0 ? 'win' : v < 0 ? 'loss' : 'draw'} with perfect play`;
      wrap.appendChild(d);
    });
    paneFeed.appendChild(wrap); scrollBottom(paneFeed);
  }
  const evalWords = s => (s > MATE ? 'forced win' : s < -MATE ? 'forced loss' : s > 150 ? 'clear edge' : s > 50 ? 'slight edge' : s < -150 ? 'under pressure' : s < -50 ? 'slightly worse' : 'balanced');

  // ---------------- views & navigation ----------------
  let view = 'home';
  function showView(v) {
    view = v;
    ['home', 'game', 'online', 'stats'].forEach(n => { $('#view-' + n).hidden = n !== v; });
    $$('[data-nav]').forEach(b => {
      const n = b.dataset.nav;
      const on = n === v || (n === 'home' && v === 'game' && !['online', 'spectate'].includes(G.mode)) || (n === 'online' && v === 'game' && ['online', 'spectate'].includes(G.mode));
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#resume-btn').hidden = !(active() && v === 'home');
    if (v === 'home') renderQuick();
    if (v === 'stats') renderStats();
    if (v === 'online' && window.Online) window.Online.open();
    if (v !== 'game') closeSide();
  }
  $$('[data-nav]').forEach(b => b.addEventListener('click', () => {
    Snd.tap();
    const n = b.dataset.nav;
    if (n === 'settings') { openSettings(); return; }
    if (n === 'online' && ['online', 'spectate'].includes(G.mode) && active()) { showView('game'); return; }
    showView(n);
  }));
  $('#go-home').addEventListener('click', () => { Snd.tap(); showView('home'); });
  $('#resume-btn').addEventListener('click', () => showView('game'));
  $('#settings-btn').addEventListener('click', () => { Snd.tap(); openSettings(); });
  const soundBtn = $('#sound-btn');
  function renderSoundBtn() {
    soundBtn.setAttribute('aria-pressed', prefs.sound);
    soundBtn.querySelector('.on').style.display = prefs.sound ? '' : 'none';
    soundBtn.querySelector('.off').style.display = prefs.sound ? 'none' : '';
  }
  soundBtn.addEventListener('click', () => { Snd.init(); prefs.sound = !prefs.sound; savePrefs(); renderSoundBtn(); Snd.tap(); });
  renderSoundBtn();

  // side panel: tabs + mobile drawer
  let sideTab = 'feed';
  function setSideTab(t) {
    sideTab = t;
    ['feed', 'chat', 'moves'].forEach(n => {
      $('#tab-' + n).setAttribute('aria-selected', n === t);
      $('#pane-' + n).hidden = n !== t;
    });
    $('#chat-foot').hidden = t !== 'chat' || !chatEnabled;
    if (t === 'moves') renderMoves();
    const p = $('#pane-' + t); scrollBottom(p);
  }
  $$('.side-tabs button').forEach(b => b.addEventListener('click', () => setSideTab(b.dataset.tab)));
  function configureTabs(tabs) {
    ['feed', 'chat', 'moves'].forEach(n => { $('#tab-' + n).hidden = !tabs.includes(n); });
    if (!tabs.includes(sideTab)) setSideTab(tabs[0]); else setSideTab(sideTab);
  }
  const side = $('#side'), backdrop = $('#side-backdrop');
  function openSide(tab) {
    if (tab) setSideTab(tab);
    if (wide()) return;
    side.classList.add('open'); backdrop.hidden = false;
  }
  function closeSide() { side.classList.remove('open'); backdrop.hidden = true; }
  backdrop.addEventListener('click', closeSide);
  $('#side-grabber').addEventListener('click', closeSide);
  $('#panel-btn').addEventListener('click', () => {
    Snd.tap();
    const tab = ['online', 'spectate'].includes(G.mode) ? 'chat' : G.mode === 'local' ? 'moves' : 'feed';
    if (wide()) { setSideTab(tab); return; }
    if (side.classList.contains('open')) closeSide(); else openSide(tab);
  });

  // ---------------- toast / sheet ----------------
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3400);
  }
  const sheet = $('#sheet'), sheetBody = $('#sheet-body');
  function openSheet(build) { sheetBody.textContent = ''; build(sheetBody); sheet.hidden = false; }
  function closeSheet() { sheet.hidden = true; sheetBody.textContent = ''; }
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!sheet.hidden) closeSheet(); else closeSide(); } });
  function segControl(options, value, onPick, labelledBy) {
    const s = el('div', 'seg'); s.setAttribute('role', 'group'); if (labelledBy) s.setAttribute('aria-labelledby', labelledBy);
    options.forEach(([v, label, dot]) => {
      const b = el('button'); b.type = 'button';
      if (dot) { const d = el('span', 'chip-dot ' + dot); b.appendChild(d); }
      b.appendChild(document.createTextNode(label));
      b.setAttribute('aria-pressed', v === value);
      b.addEventListener('click', () => { Snd.tap(); s.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); onPick(v); });
      s.appendChild(b);
    });
    return s;
  }
  function field(label, control, hint) {
    const f = el('div', 'field'); const id = 'lbl-' + Math.random().toString(36).slice(2, 8);
    const l = el('span', 'label', label); l.id = id; f.appendChild(l);
    if (typeof control === 'function') control = control(id);
    f.appendChild(control);
    if (hint) { const h = el('p', 'hint', hint); f.appendChild(h); f._hint = h; }
    return f;
  }
  function switchRow(label, on, onChange, hint) {
    const row = el('div', 'toggle-row');
    const t = el('div'); t.appendChild(el('b', '', label)); if (hint) t.appendChild(el('p', 'hint', hint));
    const s = el('button', 'switch'); s.type = 'button'; s.setAttribute('role', 'switch'); s.setAttribute('aria-checked', on); s.setAttribute('aria-label', label);
    s.addEventListener('click', () => { const v = s.getAttribute('aria-checked') !== 'true'; s.setAttribute('aria-checked', v); Snd.tap(); onChange(v); });
    row.append(t, s); return row;
  }
  const blitzOpts = [[0, 'Off'], [10, '10 s'], [5, '5 s']];

  // ---------------- match setup ----------------
  $('#mode-ai').addEventListener('click', () => { Snd.init(); Snd.tap(); setupAI(); });
  $('#mode-local').addEventListener('click', () => { Snd.init(); Snd.tap(); setupLocal(); });
  $('#mode-online').addEventListener('click', () => { Snd.init(); Snd.tap(); showView('online'); });

  function setupAI() {
    openSheet(b => {
      b.appendChild(el('h2', 'display', 'Vs NEUMAI'));
      const tf = field('Difficulty', id => segControl(Object.entries(TIERS).map(([k, t]) => [k, t.label]), prefs.tier, v => { prefs.tier = v; tf._hint.textContent = TIERS[v].note; }, id), TIERS[prefs.tier].note);
      b.appendChild(tf);
      const pf = field('Personality', id => segControl(Object.entries(PERSONAS).map(([k, p]) => [k, p.short]), prefs.persona, v => { prefs.persona = v; pf._hint.textContent = PERSONAS[v].note; }, id), PERSONAS[prefs.persona].note);
      b.appendChild(pf);
      b.appendChild(field('Who goes first', id => segControl([['me', 'Me', 'p1'], ['ai', 'NEUMAI', 'p1'], ['random', 'Random']], prefs.first, v => { prefs.first = v; }, id), 'Whoever goes first plays the first color.'));
      b.appendChild(field('Blitz timer (per move)', id => segControl(blitzOpts, prefs.blitz, v => { prefs.blitz = v; }, id), 'Run out of time and a random column is played for you.'));
      b.appendChild(switchRow('Power-ups', prefs.powerups, v => { prefs.powerups = v; }, '3 hints and 3 undos per game. Games using them are marked as assisted in your stats.'));
      const foot = el('div', 'foot');
      const cancel = el('button', 'btn', 'Cancel'); cancel.type = 'button'; cancel.onclick = closeSheet;
      const go = el('button', 'btn primary', 'Start match'); go.type = 'button';
      go.onclick = () => { savePrefs(); closeSheet(); startAI(); };
      foot.append(cancel, go); b.appendChild(foot);
    });
  }
  function setupLocal() {
    openSheet(b => {
      b.appendChild(el('h2', 'display', 'Pass & Play'));
      const n1 = el('input', 'input'); n1.maxLength = 16; n1.value = prefs.p1name; n1.setAttribute('aria-label', 'First player name');
      const n2 = el('input', 'input'); n2.maxLength = 16; n2.value = prefs.p2name; n2.setAttribute('aria-label', 'Second player name');
      const names = el('div', 'row');
      const w1 = el('div', 'field'); w1.style.flex = '1 1 140px'; const l1 = el('span', 'label'); l1.append(el('span', 'chip-dot p1'), document.createTextNode(' Goes first')); w1.append(l1, n1);
      const w2 = el('div', 'field'); w2.style.flex = '1 1 140px'; const l2 = el('span', 'label'); l2.append(el('span', 'chip-dot p2'), document.createTextNode(' Goes second')); w2.append(l2, n2);
      names.append(w1, w2); b.appendChild(names);
      b.appendChild(field('Blitz timer (per move)', id => segControl(blitzOpts, prefs.lblitz, v => { prefs.lblitz = v; }, id)));
      b.appendChild(switchRow('NEUMAI hints', prefs.lhints, v => { prefs.lhints = v; }, '3 hints and 3 undos for each game.'));
      const foot = el('div', 'foot');
      const cancel = el('button', 'btn', 'Cancel'); cancel.type = 'button'; cancel.onclick = closeSheet;
      const go = el('button', 'btn primary', 'Start match'); go.type = 'button';
      go.onclick = () => {
        prefs.p1name = (n1.value.trim() || 'Player 1').slice(0, 16);
        prefs.p2name = (n2.value.trim() || 'Player 2').slice(0, 16);
        savePrefs(); closeSheet(); startLocal();
      };
      foot.append(cancel, go); b.appendChild(foot);
    });
  }

  // ---------------- starting matches ----------------
  function resetGame(extra) {
    G.token = (G.token || 0) + 1;
    stopClock();
    const token = G.token;
    G = Object.assign(newBoard(), {
      mode: 'none', over: false, busy: false, thinking: false, result: null, players: [null, {}, {}],
      token, blitz: 0, persona: prefs.persona, tier: prefs.tier, hints: 0, undos: 0, assisted: false,
      lastEval: null, lockAnnounced: false, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), startedAt: Date.now()
    }, extra);
    renderPosition([]);
    closeSide();
    clearFeed();
    paneChat.textContent = '';
  }
  function startAI(again) {
    const first = prefs.first === 'random' ? (Math.random() < .5 ? 'me' : 'ai') : prefs.first;
    const aiName = 'NEUMAI';
    const P = PERSONAS[prefs.persona];
    const me = { name: 'You', kind: 'me', sub: 'Human' };
    const ai = { name: aiName, kind: 'ai', sub: `${TIERS[prefs.tier].label} · ${P.short}` };
    resetGame({
      mode: 'ai', blitz: prefs.blitz, persona: prefs.persona, tier: prefs.tier,
      hints: prefs.powerups ? 3 : 0, undos: prefs.powerups ? 3 : 0,
      players: [null, first === 'me' ? me : ai, first === 'me' ? ai : me]
    });
    clearFeed('NEUMAI reports what it calculates here after every move.');
    feed('INIT', `NEUMAI online. Tier: ${TIERS[G.tier].label}. Search budget: ${fmtMs(effectiveMs())} per move${TIERS[G.tier] === TIERS.impossible ? ', plus the perfect solver when reachable' : ''}.`);
    enterGame();
    const aiPiece = G.players[1].kind === 'ai' ? 1 : 2;
    if (G.players[1].kind === 'me') speak(personaLine('start'), aiPiece, 'NEUMAI');
    nextTurn();
  }
  function startLocal() {
    resetGame({
      mode: 'local', blitz: prefs.lblitz, hints: prefs.lhints ? 3 : 0, undos: prefs.lhints ? 3 : 0,
      players: [null, { name: prefs.p1name, kind: 'me', sub: 'Goes first' }, { name: prefs.p2name, kind: 'me', sub: 'Goes second' }]
    });
    clearFeed(G.hints ? 'Hints from NEUMAI show up here.' : 'Hints are off for this match.');
    enterGame();
    nextTurn();
  }
  function enterGame() {
    const online = ['online', 'spectate'].includes(G.mode);
    chatEnabled = online;
    configureTabs(G.mode === 'ai' ? ['feed', 'moves'] : online ? ['chat', 'moves'] : ['feed', 'moves']);
    setSideTab(G.mode === 'local' ? 'moves' : online ? 'chat' : 'feed');
    $('#panel-btn-label').textContent = online ? 'Chat' : G.mode === 'local' ? 'Moves' : 'Feed';
    $('#action-bar').hidden = false; $('#review-bar').hidden = true;
    $('#watchers').hidden = true;
    renderPlates(); renderActions(); renderMoves();
    showView('game');
  }

  // ---------------- HUD ----------------
  function renderPlates() {
    for (const p of [1, 2]) {
      const pl = G.players[p] || {};
      $('#name-' + p).textContent = pl.name || (p === 1 ? 'Player 1' : 'Player 2');
      $('#sub-' + p).textContent = pl.sub || '';
      $('#plate-' + p).classList.toggle('active', active() && turnPiece() === p);
    }
    const s = G.over ? 'Match over' : active() ? `${cur().name} to move` : '';
    $('#status').textContent = s;
  }
  function renderActions() {
    const show = G.mode === 'ai' || G.mode === 'local';
    const hb = $('#hint-btn'), ub = $('#undo-btn');
    hb.hidden = !(show && (G.hints > 0 || G.hintsUsed));
    ub.hidden = !(show && (G.undos > 0 || G.undosUsed));
    $('#hint-count').textContent = G.hints;
    $('#undo-count').textContent = G.undos;
    hb.disabled = !canAct() || G.hints <= 0;
    const anyMine = G.mode === 'local' ? G.moves.length > 0 : G.moves.some((c, i) => G.players[i % 2 === 0 ? 1 : 2].kind === 'me');
    ub.disabled = G.thinking || G.busy || G.undos <= 0 || !anyMine || G.over && G.mode === 'none';
    const ab = $('#action-bar');
    const visible = [hb, ub].filter(b => !b.hidden).length + 2;
    ab.style.gridTemplateColumns = `repeat(${visible}, 1fr)`;
    $('#menu-btn').querySelector('.t').textContent = G.over ? 'Menu' : 'Leave';
    hits.forEach((b, c) => { const lock = !canAct() || G.h[c] >= H; b.classList.toggle('locked', lock); b.setAttribute('aria-disabled', lock); });
    if (!canAct()) ghostEl.classList.add('hide');
  }

  // ---------------- blitz clock ----------------
  const T = { raf: 0, deadline: 0, piece: 0, total: 0, lastTick: 0 };
  function stopClock() {
    cancelAnimationFrame(T.raf); T.raf = 0;
    for (const p of [1, 2]) { $('#timer-' + p).hidden = true; $('#clock-' + p).textContent = ''; $('#clock-' + p).classList.remove('low'); }
  }
  function startClock() {
    stopClock();
    if (!G.blitz || G.over || !active()) return;
    T.total = G.blitz * 1000; T.deadline = performance.now() + T.total; T.piece = turnPiece(); T.lastTick = G.blitz + 1;
    const tm = $('#timer-' + T.piece), bar = tm.querySelector('i'), clock = $('#clock-' + T.piece);
    tm.hidden = false;
    const token = G.token, len = G.moves.length;
    const loop = () => {
      if (G.token !== token || G.moves.length !== len || G.over) return;
      const left = Math.max(0, T.deadline - performance.now());
      bar.style.transform = `scaleX(${left / T.total})`;
      const secs = Math.ceil(left / 1000);
      clock.textContent = secs + 's';
      const low = left < 3000;
      clock.classList.toggle('low', low); tm.classList.toggle('low', low);
      if (low && secs < T.lastTick && cur().kind === 'me') Snd.tick();
      T.lastTick = secs;
      if (left <= 0) { onTimeout(token, len); return; }
      T.raf = requestAnimationFrame(loop);
    };
    T.raf = requestAnimationFrame(loop);
  }
  function onTimeout(token, len) {
    if (G.token !== token || G.moves.length !== len || G.over) return;
    const p = cur();
    if (p.kind !== 'me' || G.busy) return; // AI never times out; remote clients handle their own clock
    const legal = [0, 1, 2, 3, 4, 5, 6].filter(c => G.h[c] < H);
    const c = pick(legal);
    toast(`Time's up! Random drop in column ${c + 1}.`);
    buzz([80, 40, 80]);
    if (G.mode === 'ai') speak(personaLine('timeout'), aiPiece(), 'NEUMAI');
    playMove(c, 'timeout');
  }
  const effectiveMs = () => { const base = TIERS[G.tier || prefs.tier].ms; return G.blitz ? Math.min(base, G.blitz * 1000 * .45) : base; };
  const aiPiece = () => (G.players[1].kind === 'ai' ? 1 : 2);

  // ---------------- turn flow ----------------
  function nextTurn() {
    renderPlates(); renderActions();
    if (G.over) return;
    startClock();
    if (cur().kind === 'ai') aiTurn();
    else if (hover >= 0) ghost(hover);
  }
  function onColumn(c) {
    if (!canAct() || G.h[c] >= H) return;
    Snd.init();
    playMove(c, 'me');
  }
  document.addEventListener('keydown', e => {
    if (view !== 'game' || (e.target && e.target.closest && e.target.closest('input,textarea'))) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 7) onColumn(n - 1);
    if (G.mode === 'review') { if (e.key === 'ArrowLeft') reviewStep(-1); if (e.key === 'ArrowRight') reviewStep(1); }
  });

  async function playMove(c, source) {
    const token = G.token, idx = G.moves.length, p = turnPiece();
    G.busy = true; ghost(-1); clearHint(); stopClock(); renderActions();
    const r = G.h[c];
    G.board[c * H + r] = p; G.h[c]++; G.moves.push(c);
    renderMoves();
    const anim = addDisc(c, r, p, true);
    const line = findWin(G.board, c, r, p);
    const draw = !line && G.moves.length === 42;
    if (G.mode === 'online' && source !== 'remote' && window.Online) {
      window.Online.sendMove(c, idx, line ? 'won' : draw ? 'draw' : 'playing').then(ok => { if (!ok) resyncOnline(); });
    }
    await anim;
    if (G.token !== token) return;
    G.busy = false;
    if (line) { endGame(p, line); return; }
    if (draw) { endGame(0, null); return; }
    nextTurn();
  }

  // ---------------- NEUMAI turn ----------------
  async function aiTurn() {
    const token = G.token, moves = G.moves.slice(), aip = turnPiece();
    G.thinking = true; renderActions();
    const thinkingRow = feed('SCAN', 'Thinking…', '', `budget ${fmtMs(effectiveMs())}`);
    const bubbleTimer = setTimeout(() => { if (G.token === token && G.thinking) speak(personaLine('thinking'), aip, 'NEUMAI'); }, 900);
    const tick = setInterval(() => Snd.think(), 800);
    const t0 = performance.now();
    let res = null, solver = null;
    try {
      if (moves.length === 0) res = { move: 3, book: true };
      else if (G.tier === 'impossible' && !solverDown) {
        try { solver = await askSolver(moves); const b = bestFromSolver(solver, G.h); if (b.move >= 0) res = { move: b.move, solver: b.score }; } catch (e) { feed('NOTE', 'Online solver not reachable. Running on the built-in engine only.'); }
      }
      if (!res) res = await Engine.think(moves, effectiveMs());
      const el2 = performance.now() - t0;
      if (el2 < 500) await sleep(500 - el2);
    } finally { clearInterval(tick); clearTimeout(bubbleTimer); }
    if (G.token !== token) return;
    thinkingRow.remove();
    const blocked = wouldWin(3 - aip, res.move);
    reportAI(res, solver, performance.now() - t0, blocked, aip, moves.length);
    G.thinking = false;
    playMove(res.move, 'ai');
  }
  function reportAI(res, solver, ms, blocked, aip, ply) {
    let key = 'even', vars = {};
    if (res.book) {
      feed('BOOK', 'Opening book: column 4. The center is the only first move that wins with perfect play.', 'best');
      key = 'open';
    } else if (solver) {
      feed('SOLVER', `Perfect solver checked every column in ${fmtMs(ms)}.`, 'solver');
      feedMeter(solver, G.h);
      const s = res.solver;
      if (s > 0) {
        const stones = 43 - 2 * s, n = Math.max(1, Math.ceil((stones - ply) / 2));
        feed('LOCK', `Forced win locked in. Column ${res.move + 1} wins by move ${stones} at the latest.`, 'lock');
        key = G.lockAnnounced ? 'winLock' : 'solved'; vars.n = n; G.lockAnnounced = true;
      } else if (s === 0) { feed('DRAW', `Column ${res.move + 1} holds a draw with perfect play.`, 'draw'); key = 'drawLock'; }
      else { feed('ALERT', `Every column loses against perfect play. Choosing column ${res.move + 1} to last the longest.`, 'lock'); key = 'doomed'; }
      if (s <= 0 && blocked) key = 'block';
      G.lastEval = s > 0 ? WIN : s < 0 ? -WIN : 0;
    } else {
      const s = res.score;
      feed('SCAN', `Searched ${res.depth} moves deep`, '', `${fmtN(res.nodes)} positions · ${fmtMs(res.time || ms)}`);
      feed('BEST', `Column ${res.move + 1} · ${evalWords(s)}${Math.abs(s) <= MATE ? ` (${s > 0 ? '+' : ''}${s})` : ''}`, 'best');
      if (res.pv && res.pv.length > 1) feed('LINE', 'Expected continuation', '', res.pv.slice(0, 10).map(c => c + 1).join(' → '));
      if (s > MATE) {
        const n = Math.ceil((WIN - s) / 2);
        feed('LOCK', `Forced win found: NEUMAI wins in ${n} move${n > 1 ? 's' : ''} whatever you play.`, 'lock');
        key = 'winLock'; vars.n = n; G.lockAnnounced = true;
      } else if (s < -MATE) {
        feed('ALERT', 'Every line loses against perfect play. Playing for the longest resistance.', 'lock'); key = 'doomed';
      } else if (res.exact && s === 0) { feed('DRAW', 'Guaranteed draw with perfect play from both sides.', 'draw'); key = 'drawLock'; }
      else if (blocked) { feed('BLOCK', `Blocked your four in column ${res.move + 1}.`, 'hint'); key = 'block'; }
      else if (G.lastEval != null && s - G.lastEval > 120 && ply > 2) { feed('SWING', `Your last move helped NEUMAI: evaluation jumped by ${s - G.lastEval}.`); key = 'pounce'; }
      else key = s > 80 ? 'ahead' : s < -80 ? 'behind' : 'even';
      G.lastEval = s;
    }
    // Speak less often on quiet moves so the bubble stays meaningful.
    const quiet = ['even', 'ahead', 'behind'].includes(key);
    if (!quiet || Math.random() < .55) speak(personaLine(key, vars), aip, 'NEUMAI');
  }

  // ---------------- hint & undo ----------------
  $('#hint-btn').addEventListener('click', async () => {
    if (!canAct() || G.hints <= 0) return;
    Snd.init();
    const token = G.token, moves = G.moves.slice(), btn = $('#hint-btn');
    G.hints--; G.hintsUsed = true; G.assisted = true; G.busy = true; renderActions();
    btn.querySelector('.t').textContent = '…';
    let res = null, solver = null;
    try {
      if (!solverDown && G.mode === 'ai' && G.tier === 'impossible') { try { solver = await askSolver(moves); const b = bestFromSolver(solver, G.h); res = { move: b.move, solverScore: b.score }; } catch (e) {} }
      if (!res) res = await Engine.think(moves, 1200);
    } finally { btn.querySelector('.t').textContent = 'Hint'; }
    if (G.token !== token) return;
    G.busy = false;
    Snd.hint(); buzz(25);
    showHint(res.move);
    let why = '';
    if (solver) why = res.solverScore > 0 ? 'It wins with perfect play.' : res.solverScore === 0 ? 'It holds the draw.' : 'Every column loses, this one lasts longest.';
    else why = res.score > MATE ? `It forces a win in ${Math.ceil((WIN - res.score) / 2)}.` : res.score < -MATE ? 'Every column loses, this one lasts longest.' : `Position after it: ${evalWords(res.score)}.`;
    feed('HINT', `Try column ${res.move + 1}. ${why}`, 'hint');
    if (!wide()) toast(`Hint: column ${res.move + 1}. ${why}`);
    if (G.mode === 'ai') speak(personaLine('hint'), aiPiece(), 'NEUMAI');
    renderActions();
  });
  $('#undo-btn').addEventListener('click', () => {
    if (G.undos <= 0 || G.thinking || G.busy || !G.moves.length) return;
    if (G.mode !== 'ai' && G.mode !== 'local') return;
    const wasOver = G.over;
    G.token++; stopClock();
    const pop = () => { const c = G.moves.pop(); G.h[c]--; G.board[c * H + G.h[c]] = 0; };
    if (G.mode === 'local') pop();
    else {
      const mine = G.moves.some((c, i) => G.players[i % 2 === 0 ? 1 : 2].kind === 'me');
      if (!mine) return;
      do { pop(); } while (G.moves.length && cur().kind !== 'me');
      if (cur().kind !== 'me') { /* back at start with AI to move */ }
    }
    G.undos--; G.undosUsed = true; G.assisted = G.mode === 'ai' ? true : G.assisted;
    G.over = false; G.result = null; G.lastEval = null;
    renderPosition(G.moves);
    Snd.whoosh();
    if (wasOver) feed('UNDO', 'Match reopened.');
    feed('UNDO', 'Move taken back.');
    if (G.mode === 'ai') speak(personaLine('undo'), aiPiece(), 'NEUMAI');
    renderMoves();
    nextTurn();
  });
  $('#menu-btn').addEventListener('click', () => {
    Snd.tap();
    if (G.over || G.mode === 'spectate') { leaveMatch(); return; }
    openSheet(b => {
      b.appendChild(el('h2', 'display', 'Leave this match?'));
      b.appendChild(el('p', 'muted', G.mode === 'online' ? 'Your opponent will be told you left.' : 'You can come back to it from the Play screen while the app stays open.'));
      const foot = el('div', 'foot');
      const stay = el('button', 'btn', 'Keep playing'); stay.type = 'button'; stay.onclick = closeSheet;
      const go = el('button', 'btn primary', G.mode === 'online' ? 'Leave match' : 'Go to menu'); go.type = 'button';
      go.onclick = () => { closeSheet(); if (G.mode === 'online') leaveMatch(); else showView('home'); };
      foot.append(stay, go); b.appendChild(foot);
    });
  });
  function leaveMatch() {
    if (['online', 'spectate'].includes(G.mode) && window.Online) { window.Online.leave(); return; }
    showView('home');
  }

  // ---------------- end of game ----------------
  function endGame(winner, line, reason) {
    if (G.over) return;
    G.over = true; G.busy = false; G.thinking = false; stopClock();
    G.result = { winner, reason };
    if (line) drawWinLine(line);
    renderPlates(); renderActions();
    const mp = myPiece();
    let outcome = winner === 0 ? 'draw' : mp ? (winner === mp ? 'win' : 'loss') : 'win';
    if (G.mode === 'ai') {
      if (outcome === 'win') { Snd.win(); confetti(); buzz([60, 50, 60, 50, 120]); speak(personaLine('aiLose'), aiPiece(), 'NEUMAI'); }
      else if (outcome === 'loss') { Snd.lose(); buzz(220); speak(personaLine('aiWin'), aiPiece(), 'NEUMAI'); }
      else { Snd.draw(); speak(personaLine('draw'), aiPiece(), 'NEUMAI'); }
      feed(outcome === 'win' ? 'RESULT' : outcome === 'loss' ? 'RESULT' : 'DRAW', outcome === 'win' ? 'You won. NEUMAI has been defeated.' : outcome === 'loss' ? 'NEUMAI connected four.' : 'Board full. Draw.', outcome === 'loss' ? 'lock' : outcome === 'draw' ? 'draw' : 'best');
    } else if (G.mode === 'spectate') {
      Snd.draw();
    } else {
      if (winner === 0) Snd.draw(); else if (outcome === 'win') { Snd.win(); confetti(); buzz([60, 50, 60, 50, 120]); } else { Snd.lose(); buzz(220); }
    }
    recordGame(outcome);
    const delay = line ? 900 : 350, token = G.token;
    setTimeout(() => { if (G.token === token && G.over) showResultCard(winner, outcome, reason); }, delay);
  }
  function showResultCard(winner, outcome, reason) {
    const wName = winner ? G.players[winner].name : '';
    let title, cls, sub;
    if (winner === 0) { title = 'Draw'; cls = 'draw'; sub = 'Nobody connected four.'; }
    else if (G.mode === 'local' || G.mode === 'spectate') { title = `${wName} wins`; cls = 'win'; sub = reason === 'left' ? 'The other player left.' : 'Four in a row!'; }
    else if (outcome === 'win') { title = 'You win!'; cls = 'win'; sub = reason === 'left' ? 'Your opponent left the match.' : G.mode === 'ai' ? `You beat NEUMAI on ${TIERS[G.tier].label}.` : 'Four in a row!'; }
    else { title = `${wName} wins`; cls = 'loss'; sub = G.mode === 'ai' ? 'Review the game to find the turning point.' : 'So close. Ask for a rematch?'; }
    const buttons = [];
    if (G.mode === 'ai') buttons.push({ label: 'Play again', primary: true, fn: () => startAI(true) });
    if (G.mode === 'local') buttons.push({ label: 'Rematch', primary: true, fn: () => { const a = prefs.p1name; prefs.p1name = prefs.p2name; prefs.p2name = a; savePrefs(); startLocal(); } });
    if (G.mode === 'online') buttons.push({ label: 'Rematch', primary: true, fn: () => window.Online && window.Online.rematch() });
    if (G.moves.length) buttons.push({ label: 'Review game', fn: () => startReview(currentRecord()) });
    buttons.push({ label: G.mode === 'online' || G.mode === 'spectate' ? 'Lobby' : 'Menu', fn: leaveMatch });
    buttons.push({ label: 'See board', fn: () => { $('#result').hidden = true; } });
    showCard(title, cls, sub, buttons);
  }
  function showCard(title, cls, sub, buttons) {
    const rEl = $('#result'); rEl.textContent = '';
    const card = el('div', 'card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', title);
    const h = el('h2', 'display ' + cls, title); const p = el('p', '', sub); const row = el('div', 'row');
    buttons.forEach(b => { const x = el('button', 'btn' + (b.primary ? ' primary' : ''), b.label); x.type = 'button'; x.addEventListener('click', () => { Snd.tap(); b.fn(); }); row.appendChild(x); });
    card.append(h, p, row); rEl.appendChild(card); rEl.hidden = false;
    row.firstChild && row.firstChild.focus({ preventScroll: true });
  }
  function currentRecord() {
    return G.record || { moves: G.moves.slice(), names: [G.players[1].name, G.players[2].name], mode: G.mode, myPiece: myPiece(), t: Date.now() };
  }
  function recordGame(outcome) {
    if (G.mode === 'spectate' || G.mode === 'review' || !G.moves.length) return;
    const mp = myPiece();
    let oppKey, opp;
    if (G.mode === 'ai') { oppKey = 'ai:' + G.tier; opp = `NEUMAI · ${TIERS[G.tier].label}`; }
    else if (G.mode === 'online') { oppKey = 'friend:' + (G.oppUid || G.players[3 - mp].name); opp = G.players[3 - mp].name; }
    else { oppKey = 'local'; opp = `${G.players[1].name} vs ${G.players[2].name}`; }
    const winner = G.result.winner;
    const rec = {
      id: G.id, t: Date.now(), mode: G.mode, oppKey, opp, tier: G.mode === 'ai' ? G.tier : null,
      result: G.mode === 'local' ? (winner === 0 ? 'draw' : 'p' + winner) : outcome,
      moves: G.moves.slice(), myPiece: mp, names: [G.players[1].name, G.players[2].name],
      blitz: G.blitz || 0, assisted: !!G.assisted, reason: G.result.reason || null
    };
    history = history.filter(h => h.id !== rec.id);
    history.push(rec); saveHistory();
    G.record = rec;
  }

  // ---------------- move list + review ----------------
  function renderMoves() {
    const moves = G.mode === 'review' ? G.review.moves : G.moves;
    paneMoves.textContent = '';
    if (!moves.length) { paneMoves.appendChild(el('p', 'empty-note', 'No moves yet.')); return; }
    const list = el('div', 'movelist');
    moves.forEach((c, i) => {
      const b = el('button'); b.type = 'button';
      b.append(el('span', 'chip-dot p' + (i % 2 === 0 ? 1 : 2)), document.createTextNode(`${i + 1}. ${c + 1}`));
      if (G.mode === 'review') {
        const m = G.review.marks[i + 1];
        if (m) { const t = el('span', 'mk ' + m.cls, m.short); b.appendChild(t); }
        if (G.review.pos === i + 1) b.setAttribute('aria-current', 'true');
        b.addEventListener('click', () => { reviewGo(i + 1); if (!wide()) closeSide(); });
      } else b.disabled = true;
      list.appendChild(b);
    });
    paneMoves.appendChild(list);
    if (G.mode === 'review' && G.review.summary) paneMoves.appendChild(el('p', 'hint', G.review.summary));
    scrollBottom(paneMoves);
  }

  function startReview(rec) {
    if (!rec || !rec.moves || !rec.moves.length) return;
    const token = (G.token || 0) + 1;
    const prev = G;
    stopClock();
    G = Object.assign(newBoard(), {
      mode: 'review', over: true, token, players: [null, { name: rec.names[0], kind: 'x', sub: 'First' }, { name: rec.names[1], kind: 'x', sub: 'Second' }],
      review: { moves: rec.moves.slice(), pos: rec.moves.length, evals: [], best: [], marks: {}, done: false, myPiece: rec.myPiece || 0, rec, prevMode: prev.mode },
      record: rec
    });
    closeSide();
    configureTabs(['moves', 'feed']);
    setSideTab('moves');
    clearFeed('Quick engine analysis runs in the background. Marks appear on the move list as it finishes.');
    $('#action-bar').hidden = true; $('#review-bar').hidden = false;
    $('#watchers').hidden = true;
    $('#rv-range').max = rec.moves.length;
    renderPlates();
    showView('game');
    reviewGo(rec.moves.length);
    analyzeGame(token);
  }
  function reviewGo(k) {
    const R = G.review; if (!R) return;
    k = Math.max(0, Math.min(R.moves.length, k));
    R.pos = k;
    renderPosition(R.moves, k);
    const { win } = replay(R.moves.slice(0, k));
    if (win) drawWinLine(win.line);
    $('#rv-range').value = k;
    renderPlates();
    for (const p of [1, 2]) $('#plate-' + p).classList.toggle('active', k < R.moves.length && (k % 2 === 0 ? 1 : 2) === p);
    reviewNote();
    renderMoves();
    drawEvalChart();
  }
  function reviewStep(d) { if (G.mode === 'review') { Snd.tap(); reviewGo(G.review.pos + d); } }
  $('#rv-first').addEventListener('click', () => reviewGo(0));
  $('#rv-prev').addEventListener('click', () => reviewStep(-1));
  $('#rv-next').addEventListener('click', () => reviewStep(1));
  $('#rv-last').addEventListener('click', () => reviewGo(G.review ? G.review.moves.length : 0));
  $('#rv-range').addEventListener('input', e => reviewGo(+e.target.value));
  $('#rv-panel').addEventListener('click', () => openSide('moves'));
  $('#rv-exit').addEventListener('click', () => {
    const R = G.review;
    G.token++;
    G = Object.assign(newBoard(), { mode: 'none', over: true, players: [null, {}, {}], token: G.token });
    renderPosition([]);
    $('#review-bar').hidden = true; $('#action-bar').hidden = false;
    showView(R && R.prevMode === 'online' ? 'online' : R && R.fromStats ? 'stats' : 'home');
  });
  function reviewNote() {
    const R = G.review, k = R.pos, note = $('#review-note');
    if (k === 0) { note.textContent = 'Start position. Step forward to replay the game.'; return; }
    const c = R.moves[k - 1], p = k % 2 === 1 ? 1 : 2, who = G.players[p].name;
    let t = `Move ${k}: ${who} played column ${c + 1}.`;
    const m = R.marks[k];
    if (m) t += ` ${m.text}`;
    else if (!R.done) t += ' Analyzing…';
    if (R.turning === k) t += ' This was the turning point.';
    note.textContent = t;
  }
  // Evaluation from the first player's point of view, scaled for the chart.
  function evalP1(res, k) {
    if (!res) return null;
    const side = k % 2 === 0 ? 1 : 2;
    let s = res.score;
    let v = s > MATE ? 1000 : s < -MATE ? -1000 : Math.max(-600, Math.min(600, s));
    return side === 1 ? v : -v;
  }
  async function analyzeGame(token) {
    const R = G.review, moves = R.moves, n = moves.length;
    const { win } = replay(moves);
    const per = n > 30 ? 140 : 200;
    feed('SCAN', `Analyzing ${n} moves at about ${per} ms each…`);
    for (let k = 0; k <= n; k++) {
      if (G.token !== token) return;
      if (win && k === win.at) { R.evals[k] = win.piece === 1 ? 1000 : -1000; continue; }
      if (k === 42) { R.evals[k] = 0; continue; }
      const res = await Engine.think(moves.slice(0, k), per);
      if (G.token !== token) return;
      R.evals[k] = evalP1(res, k); R.best[k] = res.move;
      if (k > 0) classify(k);
      if (k % 3 === 0 || k === n) { drawEvalChart(); renderMoves(); }
    }
    R.done = true;
    // Turning point: the biggest drop for the side that moved.
    let worst = 0, at = 0;
    for (let k = 1; k <= n; k++) { const d = drop(k); if (d > worst) { worst = d; at = k; } }
    R.turning = worst >= 60 ? at : 0;
    const counts = { blunder: 0, mistake: 0, inacc: 0 };
    Object.values(R.marks).forEach(m => { if (counts[m.cls] != null) counts[m.cls]++; });
    R.summary = `Analysis done. ${R.turning ? `Turning point: move ${R.turning}. ` : 'No clear turning point. '}${counts.blunder} blunder${counts.blunder === 1 ? '' : 's'}, ${counts.mistake} mistake${counts.mistake === 1 ? '' : 's'}.`;
    feed('DONE', R.summary, 'best');
    reviewNote(); renderMoves(); drawEvalChart();
  }
  function drop(k) {
    const R = G.review, a = R.evals[k - 1], b = R.evals[k];
    if (a == null || b == null) return 0;
    const sign = k % 2 === 1 ? 1 : -1;
    return sign * (a - b);
  }
  function classify(k) {
    const R = G.review, a = R.evals[k - 1], b = R.evals[k];
    if (a == null || b == null) return;
    const sign = k % 2 === 1 ? 1 : -1, before = sign * a, after = sign * b, d = before - after;
    const better = R.best[k - 1] != null && R.best[k - 1] !== R.moves[k - 1] ? ` Better was column ${R.best[k - 1] + 1}.` : '';
    let m = null;
    if (before >= 900 && after < 900) m = { cls: 'blunder', short: '??', text: `Missed a forced win.${better}` };
    else if (before > -900 && after <= -900) m = { cls: 'blunder', short: '??', text: `Blunder: this allowed a forced loss.${better}` };
    else if (d >= 150) m = { cls: 'mistake', short: '?', text: `Mistake: the position got clearly worse.${better}` };
    else if (d >= 60) m = { cls: 'inacc', short: '?!', text: `Slight inaccuracy.${better}` };
    else if (R.best[k - 1] === R.moves[k - 1]) m = { cls: 'best', short: '✓', text: 'Engine agrees with this move.' };
    if (m) R.marks[k] = m; else delete R.marks[k];
  }
  function drawEvalChart() {
    const R = G.review, box = $('#eval-chart'); if (!R) return;
    const n = R.moves.length, w = 600, h = 70, mid = h / 2;
    const x = k => (n ? k / n : 0) * w, y = v => mid - (v / 1000) * (mid - 4);
    let pts = [];
    for (let k = 0; k <= n; k++) if (R.evals[k] != null) pts.push([x(k), y(R.evals[k]), k]);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = pts.length ? `${path} L${pts[pts.length - 1][0].toFixed(1)} ${mid} L${pts[0][0].toFixed(1)} ${mid} Z` : '';
    const px = x(R.pos);
    const marks = Object.entries(R.marks).filter(([, m]) => m.cls === 'blunder' || m.cls === 'mistake')
      .map(([k, m]) => `<circle cx="${x(+k)}" cy="${y(R.evals[k] ?? 0)}" r="4.5" fill="${m.cls === 'blunder' ? 'var(--bad)' : '#F29A1A'}" stroke="var(--panel-solid)" stroke-width="2"/>`).join('');
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:70px;width:100%" role="img" aria-label="Evaluation over the game">
      <defs><clipPath id="clip-top"><rect x="0" y="0" width="${w}" height="${mid}"/></clipPath><clipPath id="clip-bot"><rect x="0" y="${mid}" width="${w}" height="${mid}"/></clipPath></defs>
      <rect x="0" y="0" width="${w}" height="${h}" rx="8" fill="var(--faint)"/>
      <line x1="0" x2="${w}" y1="${mid}" y2="${mid}" class="grid" stroke="var(--panel-border)"/>
      ${area ? `<path d="${area}" fill="var(--p1)" opacity=".35" clip-path="url(#clip-top)"/><path d="${area}" fill="var(--p2)" opacity=".35" clip-path="url(#clip-bot)"/><path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke"/>` : ''}
      ${marks}
      <line x1="${px}" x2="${px}" y1="0" y2="${h}" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>`;
    const svg = box.firstElementChild;
    svg.style.cursor = 'pointer';
    svg.onclick = e => { const r = svg.getBoundingClientRect(); reviewGo(Math.round((e.clientX - r.left) / r.width * n)); };
  }

  // ---------------- online hooks (used by online.js) ----------------
  let chatEnabled = false;
  const EMOJI = ['🔥', '😂', '😮', '😎', '👏', '😭', '🤯', '👑'];
  const PHRASES = ['Calculated!', 'Good game!', 'So close!', 'Nice move!', 'Oops!', 'Wow!', 'Your turn…', 'Rematch?'];
  function buildChatFoot(spectator) {
    const tray = $('#react-tray'), ph = $('#phrases');
    tray.textContent = ''; ph.textContent = '';
    EMOJI.forEach((e, i) => { const b = el('button', '', e); b.type = 'button'; b.setAttribute('aria-label', 'Send ' + e); b.onclick = () => { buzz(10); window.Online && window.Online.sendChat('e', i); }; tray.appendChild(b); });
    if (!spectator) PHRASES.forEach((p, i) => { const b = el('button', '', p); b.type = 'button'; b.onclick = () => { Snd.pop(); window.Online && window.Online.sendChat('p', i); }; ph.appendChild(b); });
    ph.hidden = !!spectator;
  }
  function floatReact(emoji, piece) {
    const f = el('div', 'float-react', emoji);
    f.style.left = piece === 2 ? '78%' : piece === 1 ? '10%' : '45%';
    f.style.top = '0';
    boardArea.appendChild(f);
    setTimeout(() => f.remove(), 1900);
  }
  function resyncOnline() { toast('That move did not go through. Syncing the board.'); if (window.Online) window.Online.resync(); }
  const C4 = window.C4 = {
    toast, Snd, buzz, showView, esc: s => s,
    get prefs() { return prefs; },
    savePrefs,
    inActiveMatch: () => ['online'].includes(G.mode) && active(),
    viewing: () => view,
    enterOnline({ gameId, spectator, myPiece: mp, names, blitz, oppUid }) {
      resetGame({
        mode: spectator ? 'spectate' : 'online', blitz: spectator ? 0 : (blitz || 0), oppUid, gameId,
        players: [null,
          { name: names[0], kind: spectator ? 'remote' : mp === 1 ? 'me' : 'remote', sub: spectator ? 'Player' : mp === 1 ? 'You' : 'Opponent' },
          { name: names[1], kind: spectator ? 'remote' : mp === 2 ? 'me' : 'remote', sub: spectator ? 'Player' : mp === 2 ? 'You' : 'Opponent' }]
      });
      G.displayBlitz = blitz || 0;
      if (spectator) G.players[1].sub = G.players[2].sub = 'Playing';
      if (!spectator && blitz) { G.players[1].sub += ` · ${blitz}s`; G.players[2].sub += ` · ${blitz}s`; }
      paneChat.textContent = '';
      paneChat.appendChild(el('p', 'empty-note', spectator ? 'You are watching. Send reactions with the tray below.' : 'Say hi with a reaction or a quick phrase.'));
      buildChatFoot(spectator);
      enterGame();
      if (spectator) toast(`Watching ${names[0]} vs ${names[1]}`);
      nextTurn();
    },
    // Apply the authoritative move list from the server.
    async syncOnline(d) {
      if (!['online', 'spectate'].includes(G.mode)) return;
      const mv = d.moves || [];
      let diverged = mv.length < G.moves.length;
      for (let i = 0; i < Math.min(G.moves.length, mv.length); i++) if (G.moves[i] !== mv[i]) diverged = true;
      if (diverged) {
        G.token++; stopClock();
        const { s } = replay(mv); G.moves = s.moves; G.board = s.board; G.h = s.h; G.busy = false; G.over = false;
        renderPosition(G.moves);
      }
      while (G.moves.length < mv.length && !G.over) {
        if (G.busy) { await sleep(120); continue; }
        await playMove(mv[G.moves.length], 'remote');
      }
      if (d.status === 'left' && !G.over) {
        const leaver = d.leftBy;
        const winnerPiece = G.mode === 'spectate' ? (leaver === d.players[0] ? 2 : 1) : myPiece();
        if (G.mode === 'online' && leaver === d.me) return;
        endGame(winnerPiece, null, 'left');
      }
      renderPlates(); renderActions();
    },
    oppGone() { if (G.mode === 'online' && active()) endGame(myPiece(), null, 'left'); },
    onChat(msgs) {
      paneChat.querySelector('.empty-note')?.remove();
      msgs.forEach(m => {
        const text = m.k === 'e' ? EMOJI[m.i] : PHRASES[m.i];
        if (!text) return;
        const d = el('div', 'feed-say' + (m.mine ? ' me' : ''));
        d.append(el('small', '', m.mine ? 'You' : m.name), document.createTextNode(text));
        if (m.k === 'e') d.style.fontSize = '24px';
        paneChat.appendChild(d);
        if (m.live) {
          if (m.k === 'e') floatReact(text, m.piece);
          else if (!m.mine) { speak(text, m.piece || 2, m.name); paneFeed.lastChild?.remove(); }
          if (!m.mine) { Snd.pop(); buzz(12); }
        }
      });
      scrollBottom(paneChat);
    },
    onWatchers(n) { const w = $('#watchers'); w.hidden = !n; w.textContent = n ? `${n} watching` : ''; },
    currentMoves: () => G.moves.slice(),
    detach() { if (['online', 'spectate'].includes(G.mode)) { G.token++; stopClock(); G.mode = 'none'; G.over = true; closeSide(); } }
  };

  // ---------------- home quick stats ----------------
  function renderQuick() {
    const q = $('#quick'); q.textContent = '';
    const vsAI = history.filter(h => h.mode === 'ai');
    const tile = (big, small) => { const d = el('div', 'glass'); d.append(el('b', 'display', big), el('small', '', small)); q.appendChild(d); };
    const w = vsAI.filter(h => h.result === 'win').length, l = vsAI.filter(h => h.result === 'loss').length, dr = vsAI.filter(h => h.result === 'draw').length;
    tile(`${w}–${l}–${dr}`, 'Your record vs NEUMAI (W–L–D)');
    const imp = vsAI.filter(h => h.tier === 'impossible');
    tile(String(imp.filter(h => h.result === 'win').length), 'Wins on Impossible');
    const online = history.filter(h => h.mode === 'online');
    tile(String(online.length), 'Online matches played');
    let streak = 0; for (let i = history.length - 1; i >= 0; i--) { if (history[i].mode === 'local') continue; if (history[i].result === 'win') streak++; else break; }
    tile(String(streak), 'Current win streak');
  }

  // ---------------- stats dashboard ----------------
  function renderStats() {
    const root = $('#stats'); root.textContent = '';
    const head = el('div', 'hero'); head.appendChild(el('h1', 'display', 'Stats')); root.appendChild(head);
    const rated = history.filter(h => h.mode === 'ai' || h.mode === 'online');
    if (!history.length) {
      const p = el('div', 'panel glass'); p.appendChild(el('p', 'muted', 'No matches yet. Play NEUMAI or a friend and your record, win-rate graph and match history will show up here.'));
      root.appendChild(p); return;
    }
    const W_ = rated.filter(h => h.result === 'win').length, L_ = rated.filter(h => h.result === 'loss').length, D_ = rated.filter(h => h.result === 'draw').length;
    const tiles = el('div', 'stat-tiles');
    const tile = (big, small) => { const d = el('div', 'tile glass'); d.append(el('b', '', big), el('small', '', small)); tiles.appendChild(d); };
    tile(String(rated.length), 'Rated matches');
    tile(rated.length ? Math.round(W_ / rated.length * 100) + '%' : '–', 'Win rate');
    tile(String(W_), 'Wins'); tile(String(L_), 'Losses'); tile(String(D_), 'Draws');
    let best = 0, run = 0; rated.forEach(h => { run = h.result === 'win' ? run + 1 : 0; best = Math.max(best, run); });
    tile(String(best), 'Best win streak');
    root.appendChild(tiles);

    const grid = el('div', 'chart-grid');
    // Win rate over time (cumulative)
    const p1 = el('div', 'panel glass'); p1.appendChild(el('h2', 'display', 'Win rate over time'));
    const chart = el('div', 'chart'); p1.appendChild(chart);
    p1.appendChild(el('p', 'hint', 'Cumulative win rate after each rated match (vs NEUMAI and online).'));
    drawTrend(chart, rated.slice(-60));
    grid.appendChild(p1);
    // Record by opponent
    const p2 = el('div', 'panel glass'); p2.appendChild(el('h2', 'display', 'Record by opponent'));
    const legend = el('div', 'legend');
    [['var(--good)', 'Win'], ['var(--neutral)', 'Draw'], ['var(--bad)', 'Loss']].forEach(([c, t]) => { const s = el('span'); const i = el('i'); i.style.background = c; s.append(i, document.createTextNode(t)); legend.appendChild(s); });
    p2.appendChild(legend);
    const rows = el('div', 'opp-rows');
    const groups = new Map();
    rated.forEach(h => { const g = groups.get(h.oppKey) || { name: h.opp, w: 0, d: 0, l: 0 }; g.name = h.opp; g[h.result === 'win' ? 'w' : h.result === 'draw' ? 'd' : 'l']++; groups.set(h.oppKey, g); });
    const order = ['ai:tough', 'ai:brutal', 'ai:impossible'];
    const keys = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || groups.get(b).w + groups.get(b).l + groups.get(b).d - (groups.get(a).w + groups.get(a).l + groups.get(a).d));
    keys.slice(0, 12).forEach(k => {
      const g = groups.get(k), n = g.w + g.d + g.l;
      const r = el('div', 'opp-row');
      r.appendChild(el('span', 'name', g.name));
      const bar = el('div', 'bar');
      [['w', 'var(--good)', 'wins'], ['d', 'var(--neutral)', 'draws'], ['l', 'var(--bad)', 'losses']].forEach(([f, c, t]) => { if (!g[f]) return; const s = el('span'); s.style.width = g[f] / n * 100 + '%'; s.style.background = c; s.title = `${g[f]} ${t}`; bar.appendChild(s); });
      r.appendChild(bar);
      r.appendChild(el('span', 'rec', `${g.w}–${g.d}–${g.l} · ${Math.round(g.w / n * 100)}%`));
      rows.appendChild(r);
    });
    if (!keys.length) rows.appendChild(el('p', 'muted', 'Play NEUMAI or an online match to see records here.'));
    p2.appendChild(rows);
    const local = history.filter(h => h.mode === 'local');
    if (local.length) p2.appendChild(el('p', 'hint', `Pass & Play: ${local.length} match${local.length === 1 ? '' : 'es'} (not counted in your win rate).`));
    grid.appendChild(p2);
    root.appendChild(grid);

    // Recent matches
    const p3 = el('div', 'panel glass'); p3.appendChild(el('h2', 'display', 'Recent matches'));
    const ul = el('ul', 'history');
    history.slice(-25).reverse().forEach(h => {
      const li = el('li');
      const res = h.mode === 'local' ? (h.result === 'draw' ? 'draw' : 'win') : h.result;
      const label = h.mode === 'local' ? (h.result === 'draw' ? 'DRAW' : (h.result === 'p1' ? h.names[0] : h.names[1]).slice(0, 8)) : h.result.toUpperCase();
      li.appendChild(el('span', 'res ' + res, label));
      const meta = el('div', 'meta');
      meta.appendChild(el('b', '', h.opp));
      const bits = [new Date(h.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), `${h.moves.length} moves`];
      if (h.blitz) bits.push(`${h.blitz}s blitz`); if (h.assisted) bits.push('assisted'); if (h.reason === 'left') bits.push('opponent left');
      meta.appendChild(el('small', '', bits.join(' · ')));
      li.appendChild(meta);
      const rv = el('button', 'btn', 'Review'); rv.type = 'button'; rv.style.minHeight = '36px'; rv.style.padding = '6px 12px';
      rv.onclick = () => { const r = Object.assign({}, h); startReview(r); G.review.fromStats = true; };
      li.appendChild(rv);
      ul.appendChild(li);
    });
    p3.appendChild(ul);
    root.appendChild(p3);
  }
  function drawTrend(box, games) {
    if (games.length < 2) { box.appendChild(el('p', 'muted', 'Play at least two rated matches to see the graph.')); return; }
    const w = 560, h = 200, padL = 36, padR = 12, padT = 12, padB = 26;
    let wins = 0;
    const pts = games.map((g, i) => { if (g.result === 'win') wins++; return { i, v: wins / (i + 1), g }; });
    const x = i => padL + (games.length === 1 ? 0 : i / (games.length - 1)) * (w - padL - padR);
    const y = v => padT + (1 - v) * (h - padT - padB);
    const d = pts.map((p, k) => (k ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
    const area = `${d} L${x(pts[pts.length - 1].i).toFixed(1)} ${y(0)} L${x(0)} ${y(0)} Z`;
    const grid = [0, .25, .5, .75, 1].map(v => `<line class="grid" x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('');
    const last = pts[pts.length - 1];
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Win rate over your last ${games.length} rated matches, now ${Math.round(last.v * 100)} percent">
      ${grid}
      <text class="axis" x="${padL}" y="${h - 6}">Match 1</text><text class="axis" x="${w - padR}" y="${h - 6}" text-anchor="end">Match ${games.length}</text>
      <path d="${area}" fill="var(--accent)" opacity=".14"/>
      <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${x(last.i)}" cy="${y(last.v)}" r="5" fill="var(--accent)" stroke="var(--panel-solid)" stroke-width="2"/>
      <text class="axis" x="${x(last.i) - 8}" y="${y(last.v) - 10}" text-anchor="end" style="fill:var(--ink);font-weight:700">${Math.round(last.v * 100)}%</text>
      <line id="trend-cross" y1="${padT}" y2="${h - padB}" stroke="var(--muted)" stroke-dasharray="3 3" style="display:none"/>
      <rect id="trend-hit" x="${padL}" y="${padT}" width="${w - padL - padR}" height="${h - padT - padB}" fill="transparent"/>
    </svg>`;
    const svg = box.querySelector('svg'), hit = box.querySelector('#trend-hit'), cross = box.querySelector('#trend-cross');
    const tip = el('div', 'tooltip'); tip.hidden = true; box.appendChild(tip);
    const move = e => {
      const r = svg.getBoundingClientRect(); const sx = (e.clientX - r.left) / r.width * w;
      const i = Math.max(0, Math.min(games.length - 1, Math.round((sx - padL) / (w - padL - padR) * (games.length - 1))));
      const p = pts[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = '';
      tip.hidden = false; tip.style.left = (x(i) / w * r.width) + 'px'; tip.style.top = (y(p.v) / h * r.height) + 'px';
      tip.textContent = `Match ${i + 1}: ${p.g.result} vs ${p.g.opp} · ${Math.round(p.v * 100)}%`;
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.style.display = 'none'; });
  }

  // ---------------- settings ----------------
  function openSettings() {
    openSheet(b => {
      b.appendChild(el('h2', 'display', 'Settings'));
      const skins = el('div', 'skins');
      Object.entries(SKINS).forEach(([k, s]) => {
        const btn = el('button', 'skin ' + k); btn.type = 'button'; btn.setAttribute('aria-pressed', prefs.skin === k);
        const sw = el('span', 'sw'); s.sw.forEach(c => { const i = el('i'); i.style.background = c; if (k === 'arcade') i.style.borderRadius = '0'; sw.appendChild(i); });
        btn.append(sw, document.createTextNode(s.label));
        btn.onclick = () => { prefs.skin = k; savePrefs(); applySkin(); skins.querySelectorAll('.skin').forEach(x => x.setAttribute('aria-pressed', x === btn)); Snd.tap(); };
        skins.appendChild(btn);
      });
      b.appendChild(field('Theme', skins));
      b.appendChild(switchRow('Sound effects', prefs.sound, v => { prefs.sound = v; savePrefs(); renderSoundBtn(); }));
      b.appendChild(switchRow('Vibration', prefs.haptics, v => { prefs.haptics = v; savePrefs(); if (v) buzz(20); }, 'Short buzzes when discs land (Android).'));
      const pf = field('NEUMAI personality', id => segControl(Object.entries(PERSONAS).map(([k, p]) => [k, p.short]), prefs.persona, v => { prefs.persona = v; savePrefs(); pf._hint.textContent = PERSONAS[v].note; if (G.mode === 'ai' && !G.over) G.persona = v; }, id), PERSONAS[prefs.persona].note);
      b.appendChild(pf);
      b.appendChild(switchRow('Power-ups vs NEUMAI', prefs.powerups, v => { prefs.powerups = v; savePrefs(); }, 'Applies from your next match.'));
      const reset = el('button', 'btn ghost', 'Reset stats and history'); reset.type = 'button';
      reset.onclick = () => {
        if (reset.dataset.confirm) { history = []; saveHistory(); toast('Stats cleared.'); reset.textContent = 'Reset stats and history'; delete reset.dataset.confirm; if (view === 'stats') renderStats(); renderQuick(); return; }
        reset.dataset.confirm = '1'; reset.textContent = 'Tap again to delete all stats';
      };
      b.appendChild(reset);
      const done = el('button', 'btn primary', 'Done'); done.type = 'button'; done.onclick = closeSheet;
      b.appendChild(done);
    });
  }

  // ---------------- confetti ----------------
  function confetti() {
    if (reduced()) return;
    const cv = $('#confetti'), ctx = cv.getContext('2d');
    cv.hidden = false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.width = innerWidth * dpr, h = cv.height = innerHeight * dpr;
    const cs = getComputedStyle(document.documentElement);
    const cols = ['--p1', '--p2', '--accent', '--good'].map(v => cs.getPropertyValue(v).trim()).concat(['#FFFFFF']);
    const ps = Array.from({ length: 170 }, () => ({
      x: w / 2 + (Math.random() - .5) * w * .3, y: h * .45, vx: (Math.random() - .5) * 26 * dpr, vy: (-Math.random() * 22 - 8) * dpr,
      s: (6 + Math.random() * 7) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: pick(cols), round: Math.random() < .35
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.vy += .55 * dpr; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 7); ctx.fill(); } else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (t - t0 < 3200) requestAnimationFrame(frame); else { ctx.clearRect(0, 0, w, h); cv.hidden = true; }
    })(t0);
  }

  // ---------------- boot ----------------
  if ('serviceWorker' in navigator && document.querySelector('link[rel="manifest"]')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.addEventListener('resize', () => { if (wide()) closeSide(); });
  showView('home');
})();
