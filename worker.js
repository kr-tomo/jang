/* 컴퓨터 상대 계산용 웹 워커 */
importScripts('engine.js', 'ai.js');
self.onmessage = function (e) {
  var d = e.data;
  var t0 = Date.now();
  var res = JanggiAI.chooseMove(d.board, d.turn, {
    level: d.level, rules: d.rules, repCounts: d.repCounts, repOn: d.repOn,
    timeMs: d.timeMs, maxDepth: d.maxDepth,
  });
  // 너무 빨리 두면 부자연스러우므로 최소 대기는 메인 쪽에서 처리
  self.postMessage({ id: d.id, move: res.move, depth: res.depth, ms: Date.now() - t0 });
};
