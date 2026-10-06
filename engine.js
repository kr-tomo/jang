/* 장기 규칙 엔진 — 브라우저/워커/Node 공용 (UMD)
 *
 * 좌표: sq = row * 9 + col,  row 0 = 맨 위(한 진영), row 9 = 맨 아래(초 진영)
 * 기물: 부호 = 진영(초 +1 / 한 -1), 절댓값 = 종류
 *       1 장, 2 차, 3 포, 4 마, 5 상, 6 사, 7 졸/병
 * 수(move): from | (to << 7),  한수쉼은 PASS
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Janggi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHO = 1, HAN = -1;
  const K = 1, R = 2, C = 3, N = 4, E = 5, G = 6, P = 7;
  const PASS = 16383;
  const SCORE_VALUE = [0, 0, 13, 7, 5, 3, 3, 2]; // 장은 점수 없음
  const HAN_DUM = 1.5;
  const TYPE_NAME = ['', 'K', 'R', 'C', 'N', 'E', 'G', 'P'];

  // 상차림: 각 진영 "자기 기준 왼쪽에서 오른쪽" 마·상 순서
  const SETUPS = [
    { id: 'NENE', label: '마상마상' },
    { id: 'NEEN', label: '마상상마' },
    { id: 'ENNE', label: '상마마상' },
    { id: 'ENEN', label: '상마상마' },
  ];

  const rowOf = (s) => (s / 9) | 0;
  const colOf = (s) => s % 9;
  const inB = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
  const sqOf = (r, c) => r * 9 + c;
  const mv = (f, t) => f | (t << 7);
  const mvFrom = (m) => m & 127;
  const mvTo = (m) => m >> 7;

  /* ---------- 궁성 ---------- */
  function palaceId(r, c) { // HAN(-1) 위, CHO(1) 아래, 0 없음
    if (c < 3 || c > 5) return 0;
    if (r >= 0 && r <= 2) return HAN;
    if (r >= 7 && r <= 9) return CHO;
    return 0;
  }
  function isDiagPoint(r, c) {
    const pid = palaceId(r, c);
    if (!pid) return false;
    const rr = pid === HAN ? r : r - 7; // 0..2
    if (c === 4) return rr === 1;
    return rr === 0 || rr === 2;
  }

  /* ---------- 정적 테이블 ---------- */
  const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DIAGD = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  const RAY = [];      // RAY[sq][dir] = 칸 목록 (직선)
  const DRAY = [];     // DRAY[sq] = 궁성 대각선 ray 목록
  const PADJ = [];     // 궁성 안 한 칸 이동 (장·사)
  const HORSE = [], HORSE_ATT = [];
  const ELEPH = [], ELEPH_ATT = [];
  const SOLD = { 1: [], '-1': [] }, SOLD_ATT = { 1: [], '-1': [] };

  for (let s = 0; s < 90; s++) {
    const r = rowOf(s), c = colOf(s);
    RAY[s] = ORTH.map(([dr, dc]) => {
      const a = [];
      let rr = r + dr, cc = c + dc;
      while (inB(rr, cc)) { a.push(sqOf(rr, cc)); rr += dr; cc += dc; }
      return a;
    });
    DRAY[s] = [];
    if (isDiagPoint(r, c)) {
      const pid = palaceId(r, c);
      for (const [dr, dc] of DIAGD) {
        const a = [];
        let rr = r + dr, cc = c + dc;
        while (inB(rr, cc) && palaceId(rr, cc) === pid && isDiagPoint(rr, cc)) {
          a.push(sqOf(rr, cc)); rr += dr; cc += dc;
        }
        if (a.length) DRAY[s].push(a);
      }
    }
    // 궁성 한 칸 이동
    PADJ[s] = [];
    const pid = palaceId(r, c);
    if (pid) {
      for (const [dr, dc] of ORTH) {
        const rr = r + dr, cc = c + dc;
        if (inB(rr, cc) && palaceId(rr, cc) === pid) PADJ[s].push(sqOf(rr, cc));
      }
      if (isDiagPoint(r, c)) {
        for (const [dr, dc] of DIAGD) {
          const rr = r + dr, cc = c + dc;
          if (inB(rr, cc) && palaceId(rr, cc) === pid && isDiagPoint(rr, cc)) PADJ[s].push(sqOf(rr, cc));
        }
      }
    }
    // 마
    HORSE[s] = [];
    for (const [dr, dc] of ORTH) {
      const lr = r + dr, lc = c + dc;
      if (!inB(lr, lc)) continue;
      const tg = dr !== 0
        ? [[r + 2 * dr, c - 1], [r + 2 * dr, c + 1]]
        : [[r - 1, c + 2 * dc], [r + 1, c + 2 * dc]];
      for (const [tr, tc] of tg) if (inB(tr, tc)) HORSE[s].push([sqOf(lr, lc), sqOf(tr, tc)]);
    }
    // 상
    ELEPH[s] = [];
    for (const [dr, dc] of ORTH) {
      const l1r = r + dr, l1c = c + dc;
      if (!inB(l1r, l1c)) continue;
      for (const sg of [-1, 1]) {
        let l2r, l2c, tr, tc;
        if (dr !== 0) { l2r = r + 2 * dr; l2c = c + sg; tr = r + 3 * dr; tc = c + 2 * sg; }
        else { l2r = r + sg; l2c = c + 2 * dc; tr = r + 2 * sg; tc = c + 3 * dc; }
        if (inB(l2r, l2c) && inB(tr, tc)) ELEPH[s].push([sqOf(l1r, l1c), sqOf(l2r, l2c), sqOf(tr, tc)]);
      }
    }
    // 졸/병
    for (const col of [CHO, HAN]) {
      const f = col === CHO ? -1 : 1;
      const a = [];
      if (inB(r + f, c)) a.push(sqOf(r + f, c));
      if (inB(r, c - 1)) a.push(sqOf(r, c - 1));
      if (inB(r, c + 1)) a.push(sqOf(r, c + 1));
      if (palaceId(r, c) === -col && isDiagPoint(r, c)) {
        for (const dc of [-1, 1]) {
          const nr = r + f, nc = c + dc;
          if (inB(nr, nc) && palaceId(nr, nc) === -col && isDiagPoint(nr, nc)) a.push(sqOf(nr, nc));
        }
      }
      SOLD[col][s] = a;
    }
  }
  for (let s = 0; s < 90; s++) { HORSE_ATT[s] = []; ELEPH_ATT[s] = []; SOLD_ATT[1][s] = []; SOLD_ATT[-1][s] = []; }
  for (let s = 0; s < 90; s++) {
    for (const [leg, to] of HORSE[s]) HORSE_ATT[to].push([s, leg]);
    for (const [l1, l2, to] of ELEPH[s]) ELEPH_ATT[to].push([s, l1, l2]);
    for (const col of [CHO, HAN]) for (const t of SOLD[col][s]) SOLD_ATT[col][t].push(s);
  }

  /* ---------- 수 생성 (의사 합법) ---------- */
  function genMoves(b, color, out, capsOnly) {
    out.length = 0;
    for (let s = 0; s < 90; s++) {
      const p = b[s];
      if (p === 0 || (p > 0 ? 1 : -1) !== color) continue;
      const t = p < 0 ? -p : p;
      switch (t) {
        case K: case G: {
          const a = PADJ[s];
          for (let i = 0; i < a.length; i++) {
            const to = a[i], q = b[to];
            if (q === 0) { if (!capsOnly) out.push(s | (to << 7)); }
            else if (q * color < 0) out.push(s | (to << 7));
          }
          break;
        }
        case R: {
          const rays = RAY[s];
          for (let d = 0; d < 4; d++) rookRay(b, color, s, rays[d], out, capsOnly);
          const dr = DRAY[s];
          for (let d = 0; d < dr.length; d++) rookRay(b, color, s, dr[d], out, capsOnly);
          break;
        }
        case C: {
          const rays = RAY[s];
          for (let d = 0; d < 4; d++) cannonRay(b, color, s, rays[d], out, capsOnly);
          const dr = DRAY[s];
          for (let d = 0; d < dr.length; d++) cannonRay(b, color, s, dr[d], out, capsOnly);
          break;
        }
        case N: {
          const a = HORSE[s];
          for (let i = 0; i < a.length; i++) {
            const e = a[i];
            if (b[e[0]] !== 0) continue;
            const q = b[e[1]];
            if (q === 0) { if (!capsOnly) out.push(s | (e[1] << 7)); }
            else if (q * color < 0) out.push(s | (e[1] << 7));
          }
          break;
        }
        case E: {
          const a = ELEPH[s];
          for (let i = 0; i < a.length; i++) {
            const e = a[i];
            if (b[e[0]] !== 0 || b[e[1]] !== 0) continue;
            const q = b[e[2]];
            if (q === 0) { if (!capsOnly) out.push(s | (e[2] << 7)); }
            else if (q * color < 0) out.push(s | (e[2] << 7));
          }
          break;
        }
        case P: {
          const a = SOLD[color][s];
          for (let i = 0; i < a.length; i++) {
            const to = a[i], q = b[to];
            if (q === 0) { if (!capsOnly) out.push(s | (to << 7)); }
            else if (q * color < 0) out.push(s | (to << 7));
          }
          break;
        }
      }
    }
    return out;
  }
  function rookRay(b, color, s, ray, out, capsOnly) {
    for (let i = 0; i < ray.length; i++) {
      const to = ray[i], q = b[to];
      if (q === 0) { if (!capsOnly) out.push(s | (to << 7)); }
      else { if (q * color < 0) out.push(s | (to << 7)); break; }
    }
  }
  function cannonRay(b, color, s, ray, out, capsOnly) {
    const n = ray.length;
    let i = 0;
    while (i < n && b[ray[i]] === 0) i++;
    if (i >= n) return;
    const sc = b[ray[i]];
    if (sc === C || sc === -C) return; // 포는 포를 넘을 수 없다
    i++;
    for (; i < n; i++) {
      const to = ray[i], q = b[to];
      if (q === 0) { if (!capsOnly) out.push(s | (to << 7)); }
      else {
        if (q * color < 0 && q !== C && q !== -C) out.push(s | (to << 7));
        break;
      }
    }
  }

  /* ---------- 장 공격 여부 (역방향 검사) ----------
   * 장(왕) 칸이 by 진영 기물에게 공격받는지만 판단한다.
   * 장·사는 자기 궁성 밖으로 나가지 못해 상대 장을 공격할 수 없으므로 제외. */
  function attacked(b, sq, by) {
    const rays = RAY[sq];
    for (let d = 0; d < 4; d++) if (rayAttack(b, rays[d], by)) return true;
    const dr = DRAY[sq];
    for (let d = 0; d < dr.length; d++) if (rayAttack(b, dr[d], by)) return true;
    const ha = HORSE_ATT[sq];
    for (let i = 0; i < ha.length; i++) if (b[ha[i][0]] === by * N && b[ha[i][1]] === 0) return true;
    const ea = ELEPH_ATT[sq];
    for (let i = 0; i < ea.length; i++) {
      const e = ea[i];
      if (b[e[0]] === by * E && b[e[1]] === 0 && b[e[2]] === 0) return true;
    }
    const sa = SOLD_ATT[by][sq];
    for (let i = 0; i < sa.length; i++) if (b[sa[i]] === by * P) return true;
    return false;
  }
  function rayAttack(b, ray, by) {
    const n = ray.length;
    let i = 0;
    while (i < n && b[ray[i]] === 0) i++;
    if (i >= n) return false;
    const p = b[ray[i]];
    if (p === by * R) return true;
    if (p === C || p === -C) return false;
    i++;
    while (i < n && b[ray[i]] === 0) i++;
    if (i >= n) return false;
    return b[ray[i]] === by * C;
  }

  function kingsFacing(b, kc, kh) {
    if (kc < 0 || kh < 0 || colOf(kc) !== colOf(kh)) return false;
    const c = colOf(kc);
    for (let r = rowOf(kh) + 1; r < rowOf(kc); r++) if (b[sqOf(r, c)] !== 0) return false;
    return true;
  }

  /* ---------- 위치 ---------- */
  // Zobrist
  let seed = 0x9e3779b9 | 0;
  function rnd32() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
  const ZOB = new Int32Array(15 * 90);
  for (let i = 0; i < ZOB.length; i++) ZOB[i] = rnd32();
  const ZTURN = rnd32();

  class Position {
    constructor() {
      this.b = new Int8Array(90);
      this.turn = CHO;
      this.kc = -1; this.kh = -1;
      this.hash = 0;
      this.stMove = []; this.stCap = [];
    }
    static fromArray(arr, turn) {
      const p = new Position();
      for (let i = 0; i < 90; i++) p.b[i] = arr[i];
      p.turn = turn;
      p.reindex();
      return p;
    }
    reindex() {
      this.kc = -1; this.kh = -1; this.hash = 0;
      for (let s = 0; s < 90; s++) {
        const q = this.b[s];
        if (!q) continue;
        if (q === K) this.kc = s; else if (q === -K) this.kh = s;
        this.hash ^= ZOB[(q + 7) * 90 + s];
      }
      if (this.turn === HAN) this.hash ^= ZTURN;
    }
    clone() { return Position.fromArray(this.b, this.turn); }
    kingSq(color) { return color === CHO ? this.kc : this.kh; }
    make(m) {
      const b = this.b;
      if (m === PASS) {
        this.stMove.push(m); this.stCap.push(0);
        this.turn = -this.turn; this.hash ^= ZTURN;
        return;
      }
      const f = m & 127, t = m >> 7;
      const p = b[f], cap = b[t];
      b[t] = p; b[f] = 0;
      if (p === K) this.kc = t; else if (p === -K) this.kh = t;
      let h = this.hash ^ ZOB[(p + 7) * 90 + f] ^ ZOB[(p + 7) * 90 + t] ^ ZTURN;
      if (cap) h ^= ZOB[(cap + 7) * 90 + t];
      this.hash = h;
      this.stMove.push(m); this.stCap.push(cap);
      this.turn = -this.turn;
    }
    unmake() {
      const m = this.stMove.pop(), cap = this.stCap.pop();
      this.turn = -this.turn;
      if (m === PASS) { this.hash ^= ZTURN; return; }
      const b = this.b;
      const f = m & 127, t = m >> 7;
      const p = b[t];
      b[f] = p; b[t] = cap;
      if (p === K) this.kc = f; else if (p === -K) this.kh = f;
      let h = this.hash ^ ZOB[(p + 7) * 90 + f] ^ ZOB[(p + 7) * 90 + t] ^ ZTURN;
      if (cap) h ^= ZOB[(cap + 7) * 90 + t];
      this.hash = h;
    }
    inCheck(color) {
      const ks = this.kingSq(color === undefined ? this.turn : color);
      if (ks < 0) return false;
      return attacked(this.b, ks, -(color === undefined ? this.turn : color));
    }
    facing() { return kingsFacing(this.b, this.kc, this.kh); }
  }

  /* ---------- 합법수 ----------
   * rules.bikjang === false 이면 두 장이 마주 보게 되는 수는 불법.
   * (true 이면 둘 수 있고, 판 종료 처리는 게임 계층에서 한다) */
  function legalMoves(pos, rules) {
    const color = pos.turn;
    const pseudo = [];
    genMoves(pos.b, color, pseudo, false);
    const out = [];
    const forbidFacing = rules && rules.bikjang === false;
    for (let i = 0; i < pseudo.length; i++) {
      const m = pseudo[i];
      pos.make(m);
      let ok = !attacked(pos.b, pos.kingSq(color), -color);
      if (ok && forbidFacing && pos.facing()) ok = false;
      pos.unmake();
      if (ok) out.push(m);
    }
    return out;
  }

  /* ---------- 초기 배치 ---------- */
  function initialBoard(setupCho, setupHan) {
    const b = new Int8Array(90);
    const put = (r, c, p) => { b[sqOf(r, c)] = p; };
    const slotsCho = [1, 2, 6, 7], slotsHan = [7, 6, 2, 1];
    const typeOf = (ch) => (ch === 'N' ? N : E);
    for (const [col, setup, slots, back, kingRow, cannonRow, soldRow] of [
      [CHO, setupCho, slotsCho, 9, 8, 7, 6],
      [HAN, setupHan, slotsHan, 0, 1, 2, 3],
    ]) {
      const sp = setup || 'NEEN';
      put(back, 0, col * R); put(back, 8, col * R);
      put(back, 3, col * G); put(back, 5, col * G);
      for (let i = 0; i < 4; i++) put(back, slots[i], col * typeOf(sp[i]));
      put(kingRow, 4, col * K);
      put(cannonRow, 1, col * C); put(cannonRow, 7, col * C);
      for (const c of [0, 2, 4, 6, 8]) put(soldRow, c, col * P);
    }
    return b;
  }

  /* ---------- 보조 ---------- */
  function keyOf(b, turn) {
    let s = turn === CHO ? 'c' : 'h';
    for (let i = 0; i < 90; i++) s += String.fromCharCode(65 + b[i] + 7);
    return s;
  }
  function materialPoints(b) {
    let cho = 0, han = 0;
    for (let s = 0; s < 90; s++) {
      const p = b[s];
      if (!p) continue;
      if (p > 0) cho += SCORE_VALUE[p]; else han += SCORE_VALUE[-p];
    }
    return { cho, han: han + HAN_DUM, hanRaw: han };
  }
  function cap(count) { return count; }

  return {
    CHO, HAN, K, R, C, N, E, G, P, PASS, SCORE_VALUE, HAN_DUM, TYPE_NAME, SETUPS,
    rowOf, colOf, sqOf, mv, mvFrom, mvTo, inB, palaceId, isDiagPoint,
    genMoves, attacked, kingsFacing, Position, legalMoves, initialBoard, keyOf, materialPoints,
    tables: { RAY, DRAY, PADJ, HORSE, ELEPH, SOLD },
    _cap: cap,
  };
});
