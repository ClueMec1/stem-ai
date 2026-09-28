function engineFactory() {
  const W = 7, H = 6, N = 42, WIN = 100000, MATE = WIN - 100;
  const ORDER = [3, 2, 4, 1, 5, 0, 6];

  // All 69 four-cell windows. Cell index = col * 6 + row (row 0 = bottom).
  const wins = [];
  for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) {
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const ec = c + 3 * dc, er = r + 3 * dr;
      if (ec < 0 || ec >= W || er < 0 || er >= H) continue;
      wins.push([0, 1, 2, 3].map(k => (c + k * dc) * H + (r + k * dr)));
    }
  }
  const NW = wins.length;
  const WC = Int32Array.from(wins.flat());
  const cw0 = Array.from({ length: N }, () => []);
  wins.forEach((w, i) => w.forEach(cell => cw0[cell].push(i)));
  const CW = cw0.map(a => Int32Array.from(a));

  let seed = 0x2545f491;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const Z1 = [null, new Int32Array(N), new Int32Array(N)], Z2 = [null, new Int32Array(N), new Int32Array(N)];
  for (let p = 1; p <= 2; p++) for (let i = 0; i < N; i++) { Z1[p][i] = rnd(); Z2[p][i] = rnd(); }

  const board = new Int8Array(N), h = new Int8Array(W);
  const cnt = [null, new Int8Array(NW), new Int8Array(NW)];
  let moves = 0, h1 = 0, h2 = 0;

  function play(c) {
    const p = (moves & 1) ? 2 : 1, cell = c * H + h[c];
    board[cell] = p; h[c]++;
    const cw = CW[cell], cp = cnt[p];
    for (let i = 0; i < cw.length; i++) cp[cw[i]]++;
    h1 ^= Z1[p][cell]; h2 ^= Z2[p][cell]; moves++;
  }
  function undo(c) {
    moves--;
    const p = (moves & 1) ? 2 : 1;
    h[c]--;
    const cell = c * H + h[c];
    board[cell] = 0;
    const cw = CW[cell], cp = cnt[p];
    for (let i = 0; i < cw.length; i++) cp[cw[i]]--;
    h1 ^= Z1[p][cell]; h2 ^= Z2[p][cell];
  }
  // Would player p complete four by filling this (empty) cell?
  function winsAt(p, cell) {
    const cw = CW[cell], cp = cnt[p];
    for (let i = 0; i < cw.length; i++) if (cp[cw[i]] === 3) return true;
    return false;
  }

  // Threat value with odd/even (zugzwang) parity: first player wants
  // threats on odd rows (1,3,5), second player on even rows (2,4,6).
  function threatVal(pl, w) {
    for (let k = 0; k < 4; k++) {
      const cell = WC[w * 4 + k];
      if (board[cell] === 0) {
        const r = cell % H;
        const good = pl === 1 ? (r % 2 === 0) : (r % 2 === 1);
        return good ? 70 : 30;
      }
    }
    return 0;
  }
  function evaluate() {
    const a = cnt[1], b = cnt[2];
    let s = 0;
    for (let w = 0; w < NW; w++) {
      const x = a[w], y = b[w];
      if (x && y) continue;
      if (x === 3) s += threatVal(1, w); else if (x === 2) s += 5; else if (x === 1) s += 1;
      if (y === 3) s -= threatVal(2, w); else if (y === 2) s -= 5; else if (y === 1) s -= 1;
    }
    for (let r = 0; r < H; r++) { const v = board[3 * H + r]; if (v === 1) s += 4; else if (v === 2) s -= 4; }
    return (moves & 1) ? -s : s;
  }

  const TB = 21, TS = 1 << TB, TM = TS - 1;
  const tKey = new Int32Array(TS), tVal = new Int32Array(TS), tDep = new Int8Array(TS), tFlag = new Int8Array(TS), tMove = new Int8Array(TS);
  const hist = new Int32Array(3 * N);
  let nodes = 0, deadline = 0;
  const STOP = { stop: true };

  function negamax(depth, alpha, beta, ply) {
    if (((++nodes) & 2047) === 0 && Date.now() > deadline) throw STOP;
    if (moves === N) return 0;
    const p = (moves & 1) ? 2 : 1, o = 3 - p;
    for (let c = 0; c < W; c++) if (h[c] < H && winsAt(p, c * H + h[c])) return WIN - ply - 1;
    let forced = -1, nt = 0;
    for (let c = 0; c < W; c++) if (h[c] < H && winsAt(o, c * H + h[c])) { nt++; forced = c; }
    if (nt > 1) return -(WIN - ply - 2);
    if (moves === N - 1) return 0;
    const maxS = WIN - ply - 3;
    if (beta > maxS) { beta = maxS; if (alpha >= beta) return beta; }
    const rem = N - moves;
    if (depth > rem) depth = rem;
    if (depth <= 0) return evaluate();

    const idx = h1 & TM;
    let ttMove = -1;
    if (tFlag[idx] && tKey[idx] === h2) {
      ttMove = tMove[idx];
      if (tDep[idx] >= depth) {
        let v = tVal[idx];
        if (v > MATE) v -= ply; else if (v < -MATE) v += ply;
        const f = tFlag[idx];
        if (f === 1) return v;
        if (f === 2 && v >= beta) return v;
        if (f === 3 && v <= alpha) return v;
      }
    }

    const ms = [], sc = [];
    if (forced >= 0) { ms.push(forced); sc.push(0); }
    else {
      const cp = cnt[p], co = cnt[o], hb = p * N;
      for (let j = 0; j < 7; j++) {
        const c = ORDER[j];
        if (h[c] >= H) continue;
        const cell = c * H + h[c];
        if (h[c] + 1 < H && winsAt(o, cell + 1)) continue; // gives opponent a win on top
        let s = c === ttMove ? 1e7 : 0;
        const cw = CW[cell];
        for (let i = 0; i < cw.length; i++) {
          const w = cw[i];
          if (co[w] === 0) { if (cp[w] === 2) s += 40; else if (cp[w] === 1) s += 4; }
          else if (cp[w] === 0 && co[w] === 2) s += 12;
        }
        s += Math.min(hist[hb + cell] >> 3, 60) + (3 - Math.abs(c - 3));
        let k = ms.length;
        ms.push(c); sc.push(s);
        while (k > 0 && sc[k - 1] < s) { sc[k] = sc[k - 1]; ms[k] = ms[k - 1]; k--; }
        sc[k] = s; ms[k] = c;
      }
      if (ms.length === 0) return -(WIN - ply - 2);
    }

    const a0 = alpha;
    let best = -Infinity, bestMove = ms[0];
    for (let i = 0; i < ms.length; i++) {
      const c = ms[i];
      play(c);
      let v;
      if (i === 0) v = -negamax(depth - 1, -beta, -alpha, ply + 1);
      else {
        v = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1);
        if (v > alpha && v < beta) v = -negamax(depth - 1, -beta, -alpha, ply + 1);
      }
      undo(c);
      if (v > best) { best = v; bestMove = c; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) { hist[p * N + c * H + h[c]] += depth * depth; break; }
    }
    let sv = best;
    if (sv > MATE) sv += ply; else if (sv < -MATE) sv -= ply;
    tKey[idx] = h2; tVal[idx] = sv; tDep[idx] = depth; tMove[idx] = bestMove;
    tFlag[idx] = best <= a0 ? 3 : best >= beta ? 2 : 1;
    return best;
  }

  return function think(list, ms) {
    board.fill(0); h.fill(0); cnt[1].fill(0); cnt[2].fill(0); hist.fill(0);
    moves = 0; h1 = 0; h2 = 0;
    for (const c of list) play(c);
    nodes = 0; deadline = Date.now() + ms;
    const p = (moves & 1) ? 2 : 1, rem = N - moves;
    const legal = ORDER.filter(c => h[c] < H);
    for (const c of legal) if (winsAt(p, c * H + h[c])) return { move: c, score: WIN - 1, depth: 1, nodes: 0, exact: true, pv: [c], legal: legal.length };
    if (legal.length === 1) return { move: legal[0], score: 0, depth: 0, nodes: 0, exact: false, pv: [legal[0]], legal: 1, forcedOnly: true };
    let bestMove = legal[0], bestScore = 0, done = 0;
    for (let depth = 1; depth <= rem; depth++) {
      try {
        const order = [bestMove, ...legal.filter(c => c !== bestMove)];
        let alpha = -WIN - 1, beta = WIN + 1, ib = order[0], is = -Infinity;
        for (let i = 0; i < order.length; i++) {
          const c = order[i];
          play(c);
          let v;
          if (i === 0) v = -negamax(depth - 1, -beta, -alpha, 1);
          else {
            v = -negamax(depth - 1, -alpha - 1, -alpha, 1);
            if (v > alpha) v = -negamax(depth - 1, -beta, -alpha, 1);
          }
          undo(c);
          if (v > is) { is = v; ib = c; }
          if (v > alpha) alpha = v;
        }
        bestMove = ib; bestScore = is; done = depth;
        if (Math.abs(bestScore) > MATE) break;
      } catch (e) {
        if (e !== STOP) throw e;
        board.fill(0); h.fill(0); cnt[1].fill(0); cnt[2].fill(0); moves = 0; h1 = 0; h2 = 0;
        for (const c of list) play(c);
        break;
      }
    }
    // Principal variation: follow the transposition table from the chosen move.
    const pv = [bestMove];
    play(bestMove);
    let steps = 1;
    while (steps < 12 && moves < N) {
      const idx = h1 & TM;
      if (!tFlag[idx] || tKey[idx] !== h2) break;
      const m = tMove[idx];
      if (m < 0 || m >= W || h[m] >= H) break;
      pv.push(m); play(m); steps++;
    }
    for (let i = pv.length - 1; i >= 0; i--) undo(pv[i]);
    return { move: bestMove, score: bestScore, depth: done, nodes, exact: done >= rem || Math.abs(bestScore) > MATE, pv, legal: legal.length };
  };
}

// When loaded as a Web Worker, answer search requests.
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  const think = engineFactory();
  self.onmessage = e => {
    const { id, moves, ms } = e.data;
    const t0 = Date.now();
    const res = think(moves, ms);
    res.time = Date.now() - t0;
    self.postMessage({ id, res });
  };
}
