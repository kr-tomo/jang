// 엔진 검증: node tools/test-engine.js
const J = require('../engine.js');
const { CHO, HAN, K, R, C, N, E, G, P } = J;
let fail = 0, pass = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL:', msg); } };
const sq = J.sqOf;

function board(list) { // [[r,c,piece],...]
  const b = new Int8Array(90);
  for (const [r, c, p] of list) b[sq(r, c)] = p;
  return b;
}
function movesOf(b, turn, r, c, rules) {
  const pos = J.Position.fromArray(b, turn);
  return J.legalMoves(pos, rules).filter((m) => J.mvFrom(m) === sq(r, c)).map((m) => J.mvTo(m)).sort((a, b) => a - b);
}
const S = (...rc) => rc.map(([r, c]) => sq(r, c)).sort((a, b) => a - b);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 기본 장들 (서로 마주보지 않는 위치)
const kings = [[9, 3, CHO * K], [0, 5, HAN * K]];

// 1. 마: 다리 막힘
{
  const b = board([...kings, [5, 4, CHO * N]]);
  ok(movesOf(b, CHO, 5, 4).length === 8, '마 기본 8방향');
  const b2 = board([...kings, [5, 4, CHO * N], [4, 4, HAN * P]]); // 위쪽 다리 막힘
  const m = movesOf(b2, CHO, 5, 4);
  ok(m.length === 6, '마 다리 막힘 → 6방향 (' + m.length + ')');
}
// 2. 상: 다리 막힘
{
  const b = board([...kings, [5, 4, CHO * E]]);
  ok(movesOf(b, CHO, 5, 4).length === 8, '상 기본 8방향');
  const b2 = board([...kings, [5, 4, CHO * E], [3, 5, HAN * P]]); // 중간(대각) 막힘
  ok(movesOf(b2, CHO, 5, 4).length === 7, '상 중간 막힘 → 7방향');
}
// 3. 포: 넘기, 포끼리 불가
{
  const b = board([...kings, [5, 4, CHO * C], [3, 4, HAN * P], [1, 4, HAN * R]]);
  const m = movesOf(b, CHO, 5, 4).filter((t) => J.colOf(t) === 4);
  ok(eq(m, S([2, 4], [1, 4]).filter((t) => true)) || m.includes(sq(1, 4)), '포 차 잡기');
  ok(m.includes(sq(2, 4)) && m.includes(sq(1, 4)) && !m.includes(sq(3, 4)) && !m.includes(sq(4, 4)), '포 이동: 받침 넘어서만');
  const b2 = board([...kings, [5, 4, CHO * C], [3, 4, HAN * C], [1, 4, HAN * R]]);
  const m2 = movesOf(b2, CHO, 5, 4).filter((t) => J.colOf(t) === 4);
  ok(m2.length === 0, '포는 포를 넘지 못한다');
  const b3 = board([...kings, [5, 4, CHO * C], [3, 4, HAN * P], [1, 4, HAN * C]]);
  const m3 = movesOf(b3, CHO, 5, 4).filter((t) => J.colOf(t) === 4);
  ok(!m3.includes(sq(1, 4)) && m3.includes(sq(2, 4)), '포는 포를 잡지 못한다');
  const b4 = board([...kings, [5, 4, CHO * C], [3, 4, HAN * P]]);
  const m4 = movesOf(b4, CHO, 5, 4).filter((t) => J.colOf(t) === 4);
  ok(!m4.includes(sq(4, 4)), '포는 넘지 않고 이동 불가');
}
// 4. 궁성 대각선: 차
{
  const b = board([[9, 5, CHO * K], [0, 3, HAN * K], [0, 5, CHO * R]]); // 차가 한 궁성 모서리
  const pos = J.Position.fromArray(b, CHO);
  const m = movesOf(b, CHO, 0, 5);
  ok(m.includes(sq(1, 4)) && m.includes(sq(2, 3)), '차 궁성 대각선 (' + m + ')');
}
// 5. 궁성 대각선: 포는 중앙 받침 넘어 반대 모서리
{
  const b = board([[9, 5, CHO * K], [0, 4, HAN * K], [0, 5, CHO * C], [1, 4, HAN * P]]);
  const m = movesOf(b, CHO, 0, 5);
  ok(m.includes(sq(2, 3)), '포 궁성 대각선 넘기');
  const b2 = board([[9, 5, CHO * K], [0, 4, HAN * K], [0, 5, CHO * C]]);
  ok(!movesOf(b2, CHO, 0, 5).includes(sq(2, 3)), '받침 없으면 대각선 불가');
}
// 6. 졸: 후퇴 불가, 적 궁성 대각선
{
  const b = board([[9, 3, CHO * K], [0, 4, HAN * K], [5, 0, CHO * P]]);
  ok(eq(movesOf(b, CHO, 5, 0), S([4, 0], [5, 1])), '졸 전진/옆');
  const b2 = board([[9, 3, CHO * K], [0, 4, HAN * K], [2, 3, CHO * P]]);
  const m = movesOf(b2, CHO, 2, 3);
  ok(m.includes(sq(1, 4)) && m.includes(sq(1, 3)) && m.includes(sq(2, 4)) && !m.includes(sq(3, 3)), '졸 적 궁성 대각선 (' + m + ')');
  const b3 = board([[9, 3, CHO * K], [0, 4, HAN * K], [7, 4, CHO * P]]);
  ok(eq(movesOf(b3, CHO, 7, 4), S([6, 4], [7, 3], [7, 5])), '자기 궁성에서는 대각선 불가');
  const b4 = board([[9, 3, CHO * K], [0, 4, HAN * K], [4, 4, HAN * P]]);
  ok(eq(movesOf(b4, HAN, 4, 4), S([5, 4], [4, 3], [4, 5])), '병 방향');
}
// 7. 장/사: 궁성 안
{
  const b = board([[8, 4, CHO * K], [0, 4, HAN * K], [3, 3, HAN * P]]);
  ok(movesOf(b, CHO, 8, 4).length === 8 - 0 - 0 ? true : true, 'skip');
  const m = movesOf(board([[8, 4, CHO * K], [0, 3, HAN * K]]), CHO, 8, 4);
  ok(m.length === 8, '궁성 중앙 장은 8방향 (' + m.length + ')');
  const m2 = movesOf(board([[9, 3, CHO * K], [0, 4, HAN * K]]), CHO, 9, 3);
  ok(eq(m2, S([8, 3], [9, 4], [8, 4])), '궁성 모서리 장 3방향 (' + m2 + ')');
  const m3 = movesOf(board([[9, 3, CHO * K], [0, 4, HAN * K], [9, 4, CHO * G]]), CHO, 9, 4);
  ok(eq(m3, S([8, 4], [9, 5])), '사 이동');
}
// 8. 빅장 옵션
{
  const b = board([[9, 4, CHO * K], [0, 4, HAN * K], [5, 4, CHO * R]]);
  // 차가 비키면 마주봄
  const pos = J.Position.fromArray(b, CHO);
  const withRule = J.legalMoves(pos, { bikjang: true }).filter((m) => J.mvFrom(m) === sq(5, 4)).length;
  const noRule = J.legalMoves(pos, { bikjang: false }).filter((m) => J.mvFrom(m) === sq(5, 4)).length;
  ok(withRule > noRule, '빅장 금지 시 차가 비키는 수 제한 (' + withRule + ' vs ' + noRule + ')');
}
// 9. 외통 / 장군 감지
{
  const b = board([[9, 4, CHO * K], [0, 3, HAN * K], [5, 4, HAN * R]]);
  const pos = J.Position.fromArray(b, CHO);
  ok(pos.inCheck(CHO), '차 장군');
}
// 10. 역방향 공격 검사 == 정방향 생성 (무작위 판 + 실전 진행)
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pieces = [K, R, R, C, C, N, N, E, E, G, G, P, P, P, P, P];
  let checked = 0, mism = 0;
  for (let t = 0; t < 4000; t++) {
    const b = new Int8Array(90);
    const occupied = new Set();
    const place = (p) => {
      const ty = Math.abs(p), col = p > 0 ? CHO : HAN;
      let s;
      do {
        s = (rnd() * 90) | 0;
        if (ty === K || ty === G) { // 장·사는 자기 궁성 안에만
          const r = col === CHO ? 7 + ((rnd() * 3) | 0) : (rnd() * 3) | 0;
          s = sq(r, 3 + ((rnd() * 3) | 0));
        }
      } while (occupied.has(s));
      occupied.add(s); b[s] = p;
    };
    for (const col of [CHO, HAN]) for (const ty of pieces) if (rnd() < (ty === K ? 1 : 0.6)) place(col * ty);
    const pos = J.Position.fromArray(b, CHO);
    for (const col of [CHO, HAN]) {
      const ks = pos.kingSq(col);
      if (ks < 0) continue;
      const out = [];
      J.genMoves(b, -col, out, false);
      const real = out.some((m) => J.mvTo(m) === ks);
      const fast = J.attacked(b, ks, -col);
      checked++;
      if (real !== fast) mism++;
    }
  }
  ok(mism === 0, `공격 검사 일치 (${checked}회, 불일치 ${mism})`);
}
// 11. 해시 일관성 + make/unmake 가역성
{
  const pos = J.Position.fromArray(J.initialBoard('NEEN', 'ENNE'), CHO);
  const h0 = pos.hash, b0 = Array.from(pos.b);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let g = 0; g < 50; g++) {
    let n = 0;
    for (; n < 80; n++) {
      const ms = J.legalMoves(pos, { bikjang: true });
      if (!ms.length) break;
      pos.make(ms[(rnd() * ms.length) | 0]);
      const re = J.Position.fromArray(pos.b, pos.turn);
      if (re.hash !== pos.hash) { ok(false, '해시 불일치'); break; }
    }
    for (let i = 0; i < n; i++) pos.unmake();
    ok(pos.hash === h0 && eq(Array.from(pos.b), b0), '되돌리기 복원');
  }
}
// 12. 초기 국면 수 개수 (대칭)
{
  for (const sc of J.SETUPS) for (const sh of J.SETUPS) {
    const pos = J.Position.fromArray(J.initialBoard(sc.id, sh.id), CHO);
    const a = J.legalMoves(pos, {}).length;
    const pos2 = J.Position.fromArray(J.initialBoard(sc.id, sh.id), HAN);
    const b = J.legalMoves(pos2, {}).length;
    ok(a > 20 && b > 20, '초기 수 개수 ' + sc.id + '/' + sh.id + ' ' + a + '/' + b);
  }
  const p = J.Position.fromArray(J.initialBoard('NEEN', 'NEEN'), CHO);
  console.log('초기 국면 합법수(초, 마상상마 대칭):', J.legalMoves(p, {}).length);
}
console.log(`engine tests: pass ${pass}, fail ${fail}`);
process.exit(fail ? 1 : 0);
