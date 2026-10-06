// AI 검증: node tools/test-ai.js
const J = require('../engine.js');
const AI = require('../ai.js');
const { CHO, HAN, K, R, C, N, E, G, P } = J;
const sq = J.sqOf;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL:', m); } else console.log('ok:', m); };

// 1. 한 수 외통 찾기: 한 장(0,4), 초 차(5,3)로 (0,3) 쪽? 단순 구성
{
  const b = new Int8Array(90);
  b[sq(0, 4)] = HAN * K; b[sq(9, 4)] = CHO * K; // 마주보면 안 되므로 한 졸을 사이에
  b[sq(5, 4)] = HAN * P;
  b[sq(1, 3)] = HAN * G; // 사
  b[sq(5, 0)] = CHO * R; b[sq(6, 8)] = CHO * R;
  // 초 차 두 대로 외통: 차(6,8)->(0,8)? 장 (0,4) 가로 공격 → 한 장 도망 가능한지에 따라 다름. 우선 AI가 어떤 수든 반환하는지만.
  const r = AI.chooseMove(b, CHO, { level: 'hard', rules: { bikjang: true }, timeMs: 500 });
  ok(r.move > 0, '어려움 AI가 수를 반환 depth=' + r.depth);
}
// 2. 공짜 차 잡기
{
  const b = new Int8Array(90);
  b[sq(1, 4)] = HAN * K; b[sq(9, 3)] = CHO * K;
  b[sq(5, 0)] = CHO * R; b[sq(5, 7)] = HAN * R; // 같은 줄, 서로 공격 가능; 초 차례
  const r = AI.chooseMove(b, CHO, { level: 'hard', rules: { bikjang: true }, timeMs: 400 });
  ok(J.mvTo(r.move) === sq(5, 7), '어려움: 차를 잡는다');
  const r2 = AI.chooseMove(b, CHO, { level: 'easy', rules: { bikjang: true } });
  console.log('쉬움 선택:', J.mvTo(r2.move));
}
// 3. 속도/깊이
{
  const b = J.initialBoard('NEEN', 'NEEN');
  const t = Date.now();
  const r = AI.chooseMove(b, CHO, { level: 'hard', rules: { bikjang: true }, timeMs: 2000 });
  console.log('시작 국면: depth', r.depth, 'nodes', r.nodes, 'ms', Date.now() - t, 'nps', Math.round(r.nodes / ((Date.now() - t) / 1000)));
}
// 4. 어려움 vs 무작위 / 쉬움 vs 무작위 / 어려움 vs 쉬움
function play(whiteLevel, blackLevel, maxPly, timeMs) {
  const pos = J.Position.fromArray(J.initialBoard('NEEN', 'ENNE'), CHO);
  const rules = { bikjang: true, repeat: true, score: false };
  const seen = {};
  for (let ply = 0; ply < maxPly; ply++) {
    const lvl = pos.turn === CHO ? whiteLevel : blackLevel;
    const legal = J.legalMoves(pos, rules);
    if (!legal.length) return pos.inCheck(pos.turn) ? { winner: -pos.turn, ply } : { winner: 0, ply, why: 'stalemate' };
    let m;
    if (lvl === 'random') m = legal[(Math.random() * legal.length) | 0];
    else m = AI.chooseMove(pos.b, pos.turn, { level: lvl, rules, timeMs, maxDepth: 5, repOn: true, repCounts: seen }).move;
    pos.make(m);
    const k = J.keyOf(pos.b, pos.turn);
    seen[k] = (seen[k] || 0) + 1;
    if (pos.facing()) return { winner: 0, ply, why: 'bikjang' };
    if (seen[k] >= 3) return { winner: 0, ply, why: 'repeat' };
  }
  const pts = J.materialPoints(pos.b);
  return { winner: pts.cho > pts.han ? CHO : pts.cho < pts.han ? HAN : 0, ply: maxPly, why: 'maxply', pts };
}
function tally(a, b, games, ply, ms) {
  let wa = 0, wb = 0, d = 0;
  for (let g = 0; g < games; g++) {
    const aIsCho = g % 2 === 0;
    const r = aIsCho ? play(a, b, ply, ms) : play(b, a, ply, ms);
    const aw = (r.winner === CHO) === aIsCho && r.winner !== 0;
    const bw = r.winner !== 0 && !aw;
    if (aw) wa++; else if (bw) wb++; else d++;
  }
  console.log(`${a} vs ${b}: ${a} ${wa}승 / ${b} ${wb}승 / 무·점수 ${d}`);
  return { wa, wb, d };
}
const t1 = tally('hard', 'random', 4, 160, 120);
ok(t1.wa >= 3, '어려움은 무작위를 이긴다');
const t2 = tally('easy', 'random', 6, 160, 50);
ok(t2.wa >= t2.wb, '쉬움은 무작위보다 낫다');
const t3 = tally('hard', 'easy', 4, 160, 120);
ok(t3.wa >= t3.wb, '어려움은 쉬움보다 낫다');
process.exit(fail ? 1 : 0);
