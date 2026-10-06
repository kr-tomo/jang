/* 장기 컴퓨터 상대 — 알파-베타 탐색 (워커/메인/Node 공용) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.JanggiAI = factory(root.Janggi);
})(typeof self !== 'undefined' ? self : this, function (J) {
  'use strict';
  const { CHO, HAN, K, R, C, N, E, G, P, PASS } = J;
  const { genMoves, attacked, Position } = J;

  const MATE = 30000, WIN = 20000;
  const VAL = [0, 0, 1300, 700, 500, 300, 300, 200];

  /* ---------- 평가 ---------- */
  const PST = new Int16Array(15 * 90);
  (function buildPst() {
    for (let p = -7; p <= 7; p++) {
      if (!p) continue;
      const col = p > 0 ? CHO : HAN, t = Math.abs(p);
      for (let s = 0; s < 90; s++) {
        const r = J.rowOf(s), c = J.colOf(s);
        const adv = col === CHO ? 9 - r : r;
        const cen = 4 - Math.abs(c - 4);
        let v = VAL[t];
        if (t === P) {
          if (adv >= 3) v += (adv - 3) * 14;
          if (J.palaceId(r, c) === -col) v += 30;
          v += cen * 3;
        } else if (t === N) v += cen * 6 + Math.min(adv, 6) * 4;
        else if (t === E) v += cen * 3 + Math.min(adv, 5) * 2;
        else if (t === C) v += cen * 4;
        else if (t === R) v += cen * 3 + Math.min(adv, 7) * 5;
        else if (t === K) v += (c === 4 ? 10 : 0);
        PST[(p + 7) * 90 + s] = v;
      }
    }
  })();

  function evaluate(b, turn) { // turn 입장 점수
    let sc = 0;
    for (let s = 0; s < 90; s++) {
      const p = b[s];
      if (p) sc += p > 0 ? PST[(p + 7) * 90 + s] : -PST[(p + 7) * 90 + s];
    }
    return (turn === CHO ? sc : -sc) + 5;
  }

  /* ---------- 탐색 ---------- */
  const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const tKey = new Int32Array(TT_SIZE), tDepth = new Int8Array(TT_SIZE), tFlag = new Int8Array(TT_SIZE);
  const tScore = new Int32Array(TT_SIZE), tMove = new Int32Array(TT_SIZE);
  const history = new Int32Array(128 * 128);

  function Search(pos, rules, opts) {
    this.pos = pos; this.rules = rules; this.nodes = 0; this.stop = false;
    this.deadline = opts.deadline; this.killers = [];
    for (let i = 0; i < 64; i++) this.killers.push([0, 0]);
    this.bufs = [];
    for (let i = 0; i < 80; i++) this.bufs.push([]);
    this.forbid = rules.bikjang === false;
    this.scoreRule = !!rules.score;
  }

  Search.prototype.facingValue = function () { // 마주봄(빅장) 즉시 종료 시 값 (side-to-move 기준)
    if (!this.scoreRule) return 0;
    const pts = J.materialPoints(this.pos.b);
    const diffCho = pts.cho - pts.han;
    const v = diffCho > 0 ? WIN : -WIN;
    return this.pos.turn === CHO ? v : -v;
  };

  Search.prototype.order = function (moves, ttMove, ply) {
    const b = this.pos.b, n = moves.length, sc = new Array(n);
    const k = this.killers[ply] || [0, 0];
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      let s = 0;
      if (m === ttMove) s = 1e7;
      else {
        const cap = b[m >> 7];
        if (cap) s = 1e6 + VAL[cap < 0 ? -cap : cap] * 10 - VAL[Math.abs(b[m & 127])] / 10;
        else if (m === k[0]) s = 9e5;
        else if (m === k[1]) s = 8e5;
        else s = history[(m & 127) * 128 + (m >> 7)];
      }
      sc[i] = s;
    }
    // 삽입 정렬 (수가 적다)
    for (let i = 1; i < n; i++) {
      const m = moves[i], s = sc[i];
      let j = i - 1;
      while (j >= 0 && sc[j] < s) { moves[j + 1] = moves[j]; sc[j + 1] = sc[j]; j--; }
      moves[j + 1] = m; sc[j + 1] = s;
    }
  };

  Search.prototype.quiesce = function (alpha, beta, ply, qd) {
    if ((++this.nodes & 2047) === 0 && Date.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const pos = this.pos, color = pos.turn;
    const stand = evaluate(pos.b, color);
    if (qd <= 0) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = this.bufs[ply];
    genMoves(pos.b, color, moves, true);
    this.order(moves, 0, ply);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const cap = pos.b[m >> 7];
      if (cap === K || cap === -K) continue;
      pos.make(m);
      if (attacked(pos.b, pos.kingSq(color), -color) || (this.forbid && pos.facing())) { pos.unmake(); continue; }
      const sc = -this.quiesce(-beta, -alpha, ply + 1, qd - 1);
      pos.unmake();
      if (this.stop) return 0;
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  };

  Search.prototype.search = function (depth, alpha, beta, ply) {
    if ((++this.nodes & 2047) === 0 && Date.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const pos = this.pos, color = pos.turn;
    const inChk = attacked(pos.b, pos.kingSq(color), -color);
    if (inChk) depth++; // 장군 연장
    if (depth <= 0) return this.quiesce(alpha, beta, ply, 6);

    const alpha0 = alpha;
    const idx = pos.hash & TT_MASK;
    let ttMove = 0;
    if (tKey[idx] === pos.hash && tFlag[idx]) {
      ttMove = tMove[idx];
      if (tDepth[idx] >= depth) {
        let s = tScore[idx];
        if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
        const f = tFlag[idx];
        if (f === 1) return s;
        if (f === 2 && s > alpha) alpha = s;
        else if (f === 3 && s < beta) beta = s;
        if (alpha >= beta) return s;
      }
    }

    const moves = this.bufs[ply];
    genMoves(pos.b, color, moves, false);
    this.order(moves, ttMove, ply);
    let best = -MATE - 1, bestMove = 0, legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const cap = pos.b[m >> 7];
      pos.make(m);
      if (attacked(pos.b, pos.kingSq(color), -color)) { pos.unmake(); continue; }
      let sc;
      if (pos.facing()) {
        if (this.forbid) { pos.unmake(); continue; }
        legal++;
        sc = -this.facingValue(); // 상대 입장 값을 뒤집어 현재 입장으로
        // facingValue는 pos.turn(=상대) 기준
        pos.unmake();
        if (sc > best) { best = sc; bestMove = m; }
        if (sc > alpha) alpha = sc;
        if (alpha >= beta) break;
        continue;
      }
      legal++;
      if (legal === 1) sc = -this.search(depth - 1, -beta, -alpha, ply + 1);
      else {
        sc = -this.search(depth - 1, -alpha - 1, -alpha, ply + 1);
        if (!this.stop && sc > alpha && sc < beta) sc = -this.search(depth - 1, -beta, -alpha, ply + 1);
      }
      pos.unmake();
      if (this.stop) return 0;
      if (sc > best) { best = sc; bestMove = m; }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (!cap) {
          const k = this.killers[ply];
          if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
          history[(m & 127) * 128 + (m >> 7)] += depth * depth;
        }
        break;
      }
    }
    if (legal === 0) {
      if (inChk) return -MATE + ply;
      return evaluate(pos.b, color); // 둘 수 없음 → 한수쉼
    }
    let flag = 1;
    if (best <= alpha0) flag = 3; else if (best >= beta) flag = 2;
    let st = best;
    if (st > MATE - 200) st += ply; else if (st < -MATE + 200) st -= ply;
    tKey[idx] = pos.hash; tDepth[idx] = depth; tFlag[idx] = flag; tScore[idx] = st; tMove[idx] = bestMove;
    return best;
  };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* opts: { level:'easy'|'hard', rules, repCounts:{key:n}, repOn, timeMs, maxDepth } */
  function chooseMove(board, turn, opts) {
    const rules = opts.rules || {};
    const pos = Position.fromArray(board, turn);
    const legal = J.legalMoves(pos, rules);
    if (!legal.length) return { move: PASS, forced: true };
    if (legal.length === 1) return { move: legal[0], depth: 0 };

    // 반복 회피 (3회째 국면이 되는 수는 가능하면 피한다)
    let cands = legal;
    if (opts.repOn && opts.repCounts) {
      const filtered = legal.filter((m) => {
        pos.make(m);
        const k = J.keyOf(pos.b, pos.turn);
        pos.unmake();
        return (opts.repCounts[k] || 0) < 2;
      });
      if (filtered.length) cands = filtered;
    }

    if (opts.level === 'easy') return { move: easyMove(pos, cands, rules), depth: 1 };

    // 어려움: 반복 심화
    const timeMs = opts.timeMs || 2000, maxDepth = opts.maxDepth || 8;
    history.fill(0);
    const deadline = Date.now() + timeMs;
    const S = new Search(pos, rules, { deadline });
    let root = shuffle(cands.slice());
    let bestMove = root[0], bestScore = -MATE, doneDepth = 0;
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -MATE - 1, beta = MATE + 1, curBest = 0, curScore = -MATE - 1;
      // 이전 최선수를 먼저
      const i0 = root.indexOf(bestMove);
      if (i0 > 0) { root.splice(i0, 1); root.unshift(bestMove); }
      for (let i = 0; i < root.length; i++) {
        const m = root[i];
        const color = pos.turn;
        pos.make(m);
        let sc;
        if (pos.facing()) { sc = -S.facingValue(); }
        else if (i === 0) sc = -S.search(d - 1, -beta, -alpha, 1);
        else {
          sc = -S.search(d - 1, -alpha - 1, -alpha, 1);
          if (!S.stop && sc > alpha) sc = -S.search(d - 1, -beta, -alpha, 1);
        }
        pos.unmake();
        if (S.stop) break;
        if (sc > curScore) { curScore = sc; curBest = m; }
        if (sc > alpha) alpha = sc;
      }
      if (S.stop) { if (curBest && curScore > bestScore - 0 && d > 1 && false) bestMove = curBest; break; }
      bestMove = curBest; bestScore = curScore; doneDepth = d;
      if (bestScore > MATE - 100) break; // 외통 발견
      if (Date.now() > deadline) break;
    }
    return { move: bestMove, depth: doneDepth, score: bestScore, nodes: S.nodes };
  }

  function easyMove(pos, cands, rules) {
    if (Math.random() < 0.12) return cands[(Math.random() * cands.length) | 0];
    const color = pos.turn;
    let best = cands[0], bestSc = -Infinity;
    for (const m of cands) {
      pos.make(m);
      let sc;
      if (pos.facing()) sc = 0;
      else sc = -evaluate(pos.b, pos.turn);
      // 외통 직행 보너스
      if (!pos.facing() && attacked(pos.b, pos.kingSq(pos.turn), color)) sc += 40;
      pos.unmake();
      sc += (Math.random() - 0.5) * 420; // 큰 잡음
      if (sc > bestSc) { bestSc = sc; best = m; }
    }
    return best;
  }

  return { chooseMove, evaluate };
});
