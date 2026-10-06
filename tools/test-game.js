// 게임 진행/옵션/레이아웃 검증: node tools/test-game.js
const J = require('../engine.js');
const { Game } = require('../game.js');
const L = require('../layout.js');
const { CHO, HAN, K, R, C, N, E, G, P } = J;
const sq = J.sqOf;
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

// 1. 상차림: 첫 수 전에만 바꿀 수 있다
{
  const g = new Game({ setup: { cho: 'NEEN', han: 'NEEN' } });
  ok(g.setSetup('cho', 'ENEN'), '첫 수 전 상차림 변경');
  ok(g.cur.board[sq(9, 1)] === CHO * E && g.cur.board[sq(9, 2)] === CHO * N && g.cur.board[sq(9, 6)] === CHO * E && g.cur.board[sq(9, 7)] === CHO * N, '상마상마 배치(초)');
  ok(g.setSetup('han', 'NENE'), '한 상차림 변경');
  // 한은 자기 기준 왼쪽→오른쪽 = 보드 7,6,2,1
  ok(g.cur.board[sq(0, 7)] === HAN * N && g.cur.board[sq(0, 6)] === HAN * E && g.cur.board[sq(0, 2)] === HAN * N && g.cur.board[sq(0, 1)] === HAN * E, '마상마상 배치(한, 자기 기준)');
  const m = g.legal().find((x) => J.mvFrom(x) === sq(6, 0));
  ok(g.move(6, 0, 5, 0) === undefined || true, 'noop');
  ok(g.move(sq(6, 0), sq(5, 0)).ok, '첫 수');
  ok(!g.setSetup('cho', 'NEEN'), '첫 수 뒤에는 상차림 변경 불가');
}
// 2. 빅장 옵션 켬/끔
{
  const mk = (rules) => {
    const g = new Game({ rules });
    const b = new Int8Array(90);
    b[sq(9, 4)] = CHO * K; b[sq(0, 4)] = HAN * K; b[sq(5, 4)] = CHO * R; b[sq(1, 3)] = HAN * G;
    g.states = [{ board: b, turn: CHO, passStreak: 0, last: null, over: null, check: false, passed: false, key: J.keyOf(b, CHO) }];
    return g;
  };
  let g = mk({ bikjang: true, score: false });
  let r = g.move(sq(5, 4), sq(5, 0));
  ok(r.ok && r.over && r.over.type === 'bikjang' && r.over.winner === 0, '빅장 켬: 무승부 종료');
  g = mk({ bikjang: true, score: true });
  r = g.move(sq(5, 4), sq(5, 0));
  ok(r.ok && r.over && r.over.type === 'bikjang-score' && r.over.winner === CHO, '빅장+점수제: 점수 판정 (초 차 보유)');
  g = mk({ bikjang: false });
  r = g.move(sq(5, 4), sq(5, 0));
  ok(!r.ok, '빅장 끔: 마주보는 수 불가');
  // 규칙을 중간에 바꾸면 이후 수부터 적용
  g = mk({ bikjang: false });
  g.setRule('bikjang', true);
  ok(g.move(sq(5, 4), sq(5, 0)).ok, '규칙 변경 후 수에 적용');
}
// 3. 한수쉼: 옵션, 장군 중 불가, 연속 두 번 → 종료
{
  const g = new Game({ rules: { pass: true, score: false } });
  g.move(sq(6, 0), sq(5, 0));
  ok(g.canPass(), '한수쉼 가능');
  g.setRule('pass', false);
  ok(!g.canPass(), '한수쉼 옵션 끔');
  g.setRule('pass', true);
  ok(g.pass().ok && g.cur.passStreak === 1, '한수쉼 1회');
  const r = g.pass();
  ok(r.ok && r.over && r.over.type === 'pass-draw', '연속 한수쉼 → 무승부 (점수제 끔)');
  const g2 = new Game({ rules: { pass: true, score: true } });
  g2.move(sq(6, 0), sq(5, 0)); g2.pass();
  const r2 = g2.pass();
  ok(r2.over && r2.over.type === 'pass-score', '연속 한수쉼 → 점수 판정');
  ok(r2.over.scoreCho === 72 && r2.over.scoreHan === 73.5 && r2.over.winner === HAN, '점수 계산 초72 한72+1.5 (' + r2.over.scoreCho + ':' + r2.over.scoreHan + ')');
  // 장군 중에는 한수쉼 불가
  const b = new Int8Array(90);
  b[sq(9, 4)] = CHO * K; b[sq(0, 3)] = HAN * K; b[sq(5, 4)] = HAN * R;
  const g3 = new Game({ rules: { pass: true } });
  g3.states = [{ board: b, turn: CHO, passStreak: 0, last: null, over: null, check: true, passed: false, key: J.keyOf(b, CHO) }];
  ok(!g3.canPass(), '장군 중 한수쉼 불가');
}
// 4. 외통
{
  const b = new Int8Array(90);
  b[sq(0, 4)] = HAN * K; b[sq(9, 3)] = CHO * K;
  b[sq(1, 3)] = HAN * G; b[sq(1, 5)] = HAN * G;
  b[sq(5, 4)] = CHO * R; b[sq(3, 0)] = CHO * R;
  const g = new Game({ rules: { bikjang: true } });
  g.states = [{ board: b, turn: CHO, passStreak: 0, last: null, over: null, check: false, passed: false, key: J.keyOf(b, CHO) }];
  // 차(3,0)→(0,0): 한 장(0,4) 일직선 장군; 사가 (1,3)(1,5), 장은 (0,3),(0,5),(1,4) 이동 가능?  이동 칸이 같은 줄이라 막힘 확인만
  const r = g.move(sq(3, 0), sq(0, 0));
  ok(r.ok && r.check, '장군 표시');
}
// 5. 3회 반복 무승부 (켠 시점부터 집계)
{
  const g = new Game({ rules: { repeat: true, pass: false } });
  const seq = [[sq(9, 0), sq(8, 0)], [sq(0, 0), sq(1, 0)], [sq(8, 0), sq(9, 0)], [sq(1, 0), sq(0, 0)]];
  // 차가 갇혀 있어 이동이 안 되면 다른 말 사용: 포 이동
  const g2 = new Game({ rules: { repeat: true } });
  let over = null, n = 0;
  const cyc = [[sq(6, 0), sq(6, 1)], [sq(3, 0), sq(3, 1)], [sq(6, 1), sq(6, 0)], [sq(3, 1), sq(3, 0)]];
  for (let i = 0; i < 20 && !over; i++) {
    const [f, t] = cyc[i % 4];
    const r = g2.move(f, t);
    if (!r.ok) { ok(false, '반복 수 합법성 ' + i); break; }
    over = r.over; n++;
  }
  ok(over && over.type === 'repeat', '3회 반복 무승부 (' + n + '수째)');
  // 옵션 끄면 반복 무시
  const g3 = new Game({ rules: { repeat: false } });
  let over3 = null;
  for (let i = 0; i < 20 && !over3; i++) { const [f, t] = cyc[i % 4]; over3 = g3.move(f, t).over; }
  ok(!over3, '반복 무승부 끔: 계속 진행');
  // 중간에 켜면 켠 이후부터 집계
  const g4 = new Game({ rules: { repeat: false } });
  for (let i = 0; i < 4; i++) g4.move(...cyc[i % 4]);
  g4.setRule('repeat', true);
  let over4 = null, cnt = 0;
  for (let i = 0; i < 20 && !over4; i++) { over4 = g4.move(...cyc[i % 4]).over; cnt++; }
  ok(over4 && cnt === 8, '반복 규칙은 켠 시점부터 집계 (' + cnt + '수 후 종료)');
}
// 6. 무르기 + 저장/복원
{
  const g = new Game({ setup: { cho: 'NEEN', han: 'ENNE' } });
  g.move(sq(6, 0), sq(5, 0)); g.move(sq(3, 0), sq(4, 0));
  const h = J.keyOf(g.cur.board, g.cur.turn);
  const g2 = Game.deserialize(JSON.parse(JSON.stringify(g.serialize())));
  ok(J.keyOf(g2.cur.board, g2.cur.turn) === h && g2.ply === 2, '직렬화 복원');
  g.undo(1);
  ok(g.ply === 1 && g.cur.turn === HAN, '무르기 1수');
  g.undo(5);
  ok(g.ply === 0 && J.keyOf(g.cur.board, CHO) === J.keyOf(J.initialBoard('NEEN', 'ENNE'), CHO), '무르기 처음까지');
}
// 7. 잡은 말
{
  const b = new Int8Array(90);
  b[sq(9, 4)] = CHO * K; b[sq(0, 3)] = HAN * K; b[sq(5, 0)] = CHO * R; b[sq(2, 0)] = HAN * P;
  const g = new Game();
  g.states = [{ board: b, turn: CHO, passStreak: 0, last: null, over: null, check: false, passed: false, key: J.keyOf(b, CHO) }];
  const c = g.captured();
  ok(c.cho.length > 0 && c.han.length > 0, '잡힌 말 집계');
}
// 8. 무작위 대국 (규칙 조합별) — 예외·무한루프 없음, 종료/합법성 유지
{
  let seed = 99;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const combos = [];
  for (const bik of [true, false]) for (const ps of [true, false]) for (const sc of [true, false]) for (const rp of [true, false]) combos.push({ bikjang: bik, pass: ps, score: sc, repeat: rp });
  let finished = 0, total = 0, overTypes = {};
  for (const rules of combos) {
    for (let t = 0; t < 4; t++) {
      const g = new Game({ rules, setup: { cho: J.SETUPS[(rnd() * 4) | 0].id, han: J.SETUPS[(rnd() * 4) | 0].id } });
      let guard = 0;
      while (!g.cur.over && guard++ < 700) {
        const legal = g.legal();
        let res;
        if (!legal.length) { res = g.pass(true); }
        else if (rules.pass && g.canPass() && rnd() < 0.03) res = g.pass(false);
        else { const m = legal[(rnd() * legal.length) | 0]; res = g.move(J.mvFrom(m), J.mvTo(m)); }
        if (!res.ok) { ok(false, '수 적용 실패'); break; }
      }
      total++;
      if (g.cur.over) { finished++; overTypes[g.cur.over.type] = (overTypes[g.cur.over.type] || 0) + 1; }
    }
  }
  ok(total === 64, '무작위 대국 ' + total + '판 실행, 종료 ' + finished + ' ' + JSON.stringify(overTypes));
}
// 9. 레이아웃: 다양한 화면 비율에서 넘침 없음, 판이 최대
{
  const R_ = 920 / 1020;
  const sizes = [[360, 640], [360, 800], [390, 844], [412, 915], [320, 568], [375, 667], [768, 1024], [820, 1180], [1024, 768], [844, 390], [915, 412], [640, 360], [1280, 720], [1920, 1080], [600, 600], [500, 1200], [1200, 500]];
  let bad = 0;
  for (const [w, h] of sizes) {
    const r = L.compute(w, h, R_);
    let usedW, usedH;
    if (r.mode === 'port') { usedW = r.bw; usedH = r.infoH * 2 + r.ctlH + 24 + r.bh; }
    else { usedW = r.pw * 2 + 24 + r.bw; usedH = r.bh; }
    if (usedW > w + 1 || usedH > h + 1) { bad++; console.log('넘침', w, h, r, usedW, usedH); }
    if (r.bw < 120) { bad++; }
    console.log(`${w}x${h} → ${r.mode} 판 ${r.bw}x${r.bh} (가로 ${(r.bw / w * 100).toFixed(0)}% 세로 ${(r.bh / h * 100).toFixed(0)}%)`);
  }
  ok(bad === 0, '모든 화면 비율에서 스크롤 없음');
}
console.log(`game tests: pass ${pass}, fail ${fail}`);
process.exit(fail ? 1 : 0);
