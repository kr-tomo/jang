/* 테마(스프라이트) 설정
 *
 * 장기판·장기말·표시 마커는 모두 "스프라이트 시트 + 좌표표(atlas)"로 그려집니다.
 * 이미지를 바꾸려면:
 *   1) assets/ 의 파일을 같은 레이아웃의 다른 이미지(PNG/SVG/WebP)로 교체하거나
 *   2) 아래 image 경로와 frames 좌표를 새 시트에 맞게 고치면 됩니다.
 *
 * 좌표 단위는 이미지 원본 픽셀입니다.
 *  - board : 판 이미지 크기, 첫 교차점(왼쪽 위)의 위치(originX/Y), 한 칸 크기(cell)
 *  - pieces: 시트 크기와 frames["진영.종류"] = {x,y,w,h}
 *            진영: cho(초) / han(한), 종류: K 장, R 차, C 포, N 마, E 상, G 사, P 졸·병
 *            scale = 한 칸(cell) 대비 말 한 프레임을 그리는 크기 배율
 *  - markers: select(선택) from/to(직전 수) dot(이동 가능) capture(잡기) check(장군) hint(훈수)
 */
(function (root) {
  var PF = 192, MF = 128;
  var types = ['K', 'R', 'C', 'N', 'E', 'G', 'P'];
  var pf = {};
  ['cho', 'han'].forEach(function (side, row) {
    types.forEach(function (t, i) { pf[side + '.' + t] = { x: i * PF, y: row * PF, w: PF, h: PF }; });
  });
  var mf = {};
  ['select', 'from', 'to', 'dot', 'capture', 'check', 'hint'].forEach(function (n, i) {
    mf[n] = { x: i * MF, y: 0, w: MF, h: MF };
  });

  root.JANGGI_THEME = {
    name: '기본 (나무판)',
    board: { image: 'assets/board.svg', width: 920, height: 1020, originX: 60, originY: 60, cell: 100 },
    pieces: { image: 'assets/pieces.svg', sheetW: PF * 7, sheetH: PF * 2, scale: 1.0, frames: pf },
    markers: { image: 'assets/markers.svg', sheetW: MF * 7, sheetH: MF, scale: 1.0, frames: mf },
    colors: { cho: '#2a8a5a', han: '#d2473d' },
  };
})(typeof self !== 'undefined' ? self : this);
