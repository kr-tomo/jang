/* 화면 배치 계산 — 어떤 화면 비율에서도 스크롤 없이, 장기판이 가장 크게 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JanggiLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* vw, vh: 안전 영역을 뺀 사용 가능 크기(px), ratio: 판 가로/세로 */
  function compute(vw, vh, ratio) {
    const GAP = 8, SIDE_PAD = 6;
    // 세로 배치: [상대 정보][판][내 정보][버튼]
    const infoH = Math.round(clamp(vh * 0.085, 56, 78));
    const ctlH = Math.round(clamp(vh * 0.07, 48, 60));
    const reserve = infoH * 2 + ctlH + GAP * 3;
    const bwP = Math.floor(Math.min(vw - SIDE_PAD * 2, (vh - reserve) * ratio));
    // 가로 배치: [패널][판][패널]
    const pw = Math.round(clamp(vw * 0.19, 140, 230));
    const COLGAP = 12;
    const bwL = Math.floor(Math.min(vw - pw * 2 - COLGAP * 2, (vh - 8) * ratio));
    const land = bwL > bwP;
    const bw = Math.max(120, land ? bwL : bwP);
    return { mode: land ? 'land' : 'port', bw, bh: Math.floor(bw / ratio), pw, infoH, ctlH };
  }
  return { compute };
});
