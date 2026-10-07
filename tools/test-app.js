// app.js 스모크 테스트 (가짜 DOM): node tools/test-app.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

class ClassList {
  constructor() { this.s = new Set(); }
  add(...a) { a.forEach((x) => this.s.add(x)); } remove(...a) { a.forEach((x) => this.s.delete(x)); }
  contains(x) { return this.s.has(x); }
  toggle(x, f) { const on = f === undefined ? !this.s.has(x) : !!f; on ? this.s.add(x) : this.s.delete(x); return on; }
  set(str) { this.s = new Set(String(str).split(/\s+/).filter(Boolean)); }
}
class El {
  constructor(tag) {
    this.tag = tag; this.children = []; this.parent = null; this.handlers = {}; this.attrs = {}; this.dataset = {};
    this.classList = new ClassList(); this.hidden = false; this.disabled = false; this._text = '';
    const props = {};
    this.style = new Proxy(props, { get: (t, k) => (k === 'setProperty' ? (n, v) => { props[n] = v; } : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
    this._styleProps = props;
  }
  set className(v) { this.classList.set(v); } get className() { return [...this.classList.s].join(' '); }
  set textContent(v) { this._text = String(v); } get textContent() { return this._text; }
  set innerHTML(h) {
    this.children = []; this._html = h;
    const re = /class="([^"]+)"/g; let m;
    while ((m = re.exec(h))) { const c = new El('div'); c.className = m[1]; c.parent = this; this.children.push(c); }
  }
  get innerHTML() { return this._html || ''; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); }
  setAttributeNS(ns, k, v) { this.attrs[k] = v; }
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); }
  fire(t, ev) { (this.handlers[t] || []).forEach((f) => f(Object.assign({ button: 0, target: this }, ev))); }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelector(sel) { const cls = sel.replace('.', ''); return this.all().find((c) => c.classList.contains(cls)) || null; }
  querySelectorAll(sel) {
    if (sel === 'button') return this.all().filter((c) => c.tag === 'button');
    const cls = sel.replace('.', ''); return this.all().filter((c) => c.classList.contains(cls));
  }
  closest() { return this._closest || new El('div'); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 460, height: 510 }; }
  get clientWidth() { return this._cw || 390; } get clientHeight() { return this._ch || 844; }
}

const registry = {};
for (const m of html.matchAll(/id="([^"]+)"/g)) registry[m[1]] = new El('div');
registry.app._cw = 390; registry.app._ch = 844;
const modeBtns = [...html.matchAll(/data-mode="(\w+)"/g)].map((m) => { const e = new El('button'); e.dataset.mode = m[1]; return e; });
const sideBtns = [...html.matchAll(/data-val="(\w+)"/g)].map((m) => { const e = new El('button'); e.dataset.val = m[1]; return e; });
const closeBtns = [...html.matchAll(/data-close/g)].map(() => { const e = new El('button'); e._closest = new El('div'); return e; });

const store = {};
const sandbox = {
  console, setTimeout, clearTimeout, JSON, Math, Date, Array, Object, Int8Array, Number, String, Set, parseFloat,
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  location: { protocol: 'file:' },
  document: {
    getElementById: (id) => registry[id] || null,
    createElement: (t) => new El(t),
    createElementNS: (ns, t) => new El(t),
    querySelectorAll: (sel) => (sel.includes('data-mode') ? modeBtns : sel.includes('.seg') ? sideBtns : sel.includes('data-close') ? closeBtns : []),
    addEventListener() {},
  },
  getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0' }),
  navigator: {},
};
sandbox.self = sandbox.window = sandbox;
sandbox.addEventListener = () => {};
sandbox.visualViewport = null;
vm.createContext(sandbox);
for (const f of ['theme.js', 'layout.js', 'engine.js', 'ai.js', 'game.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const dbg = sandbox.__janggi;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL:', m); } else console.log('ok:', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = (r, c, flip) => {
  const rr = flip ? 9 - r : r, cc = flip ? 8 - c : c;
  registry.board.fire('pointerup', { clientX: (60 + cc * 100) * 0.5, clientY: (60 + rr * 100) * 0.5 });
};

(async () => {
  ok(!!dbg, '초기화 성공');
  ok(registry.app._styleProps['--bw'] && registry.app.classList.contains('port'), '레이아웃 변수 설정 (' + registry.app._styleProps['--bw'] + ', 세로 배치)');
  ok(registry.pieces.children.length === 32, '말 32개 렌더 (' + registry.pieces.children.length + ')');
  ok(registry.cho.querySelector('.setup').children.length === 5, '상차림 선택 4개 + 훈수 토글');

  // 훈수 토글: 누를 때마다 +1, 5 다음은 0
  const hintTog = (side) => registry[side].querySelector('.setup').children.find((c) => c.classList.contains('hintTog'));
  ok(!!hintTog('cho') && !!hintTog('han'), '훈수 토글 버튼 존재');
  const seen = [];
  for (let i = 0; i < 7; i++) { hintTog('cho').fire('click'); seen.push(dbg.st.game.hintsLeft(1)); }
  ok(JSON.stringify(seen) === JSON.stringify([1, 2, 3, 4, 5, 0, 1]), '훈수 횟수 순환 ' + seen);
  ok(registry.btnHint.style.display === '', '훈수 횟수가 있으면 훈수 버튼 표시');
  // 컴퓨터(쉬움), 내가 초
  modeBtns.find((b) => b.dataset.mode === 'easy').fire('click');
  ok(dbg.st.mode === 'easy' && dbg.st.game.ply === 0, '쉬움 모드 시작');
  // 상차림 변경
  registry.cho.querySelector('.setup').children[2].fire('click'); // 상마마상? (buildSide buttons are created via createElement)
  tap(6, 0); tap(5, 0);
  ok(dbg.st.game.ply === 1, '내 첫 수 (졸 전진)');
  await sleep(1300);
  ok(dbg.st.game.ply === 2, '컴퓨터 응수 (ply=' + dbg.st.game.ply + ')');
  // 무르기: 2수 되돌림
  registry.btnUndo.fire('click');
  ok(dbg.st.game.ply === 0, '무르기: 내 차례로 복귀');

  // 어려움, 내가 한 → 시작 버튼 후 컴퓨터 선공
  dbg.st.human = -1; modeBtns.find((b) => b.dataset.mode === 'hard').fire('click');
  ok(dbg.st.flip === true && registry.startBtn.hidden === false, '한으로 두면 판 회전 + 시작 버튼 표시');
  registry.startBtn.fire('click');
  await sleep(1800);
  ok(dbg.st.game.ply === 1 && dbg.st.game.cur.turn === -1, '컴퓨터(초) 첫 수 (ply=' + dbg.st.game.ply + ')');
  // 내 수: 한 졸 (3,0)->(4,0) (회전된 판)
  tap(3, 0, true); tap(4, 0, true);
  ok(dbg.st.game.ply === 2, '회전된 판에서 내 수');
  await sleep(2300);
  ok(dbg.st.game.ply === 3, '컴퓨터 응수 (ply=' + dbg.st.game.ply + ')');
  // 훈수 (한으로 두는 판): 횟수 선택은 새 판 시작 전에 이미 정해 둠 → 새 판에서 확인
  dbg.st.hintPref = { cho: 0, han: 2 };
  dbg.st.human = -1; modeBtns.find((b) => b.dataset.mode === 'easy').fire('click');
  ok(dbg.st.game.hintsLeft(-1) === 2 && dbg.st.game.hintsLeft(1) === 0, '컴퓨터 대국: 내 진영만 훈수 횟수 적용');
  registry.startBtn.fire('click');
  await sleep(1300);
  ok(dbg.st.game.ply === 1 && !registry.btnHint.disabled, '내 차례에 훈수 버튼 활성');
  registry.btnHint.fire('click');
  await sleep(1500);
  const hh = dbg.st.hint;
  ok(!!hh && dbg.st.sel === hh.from && dbg.st.game.currentHint(), '훈수: 말 선택 + 도착 위치 표시');
  tap(Math.floor(hh.to / 9), hh.to % 9, true);   // 훈수 위치를 눌러도 이동은 선택된 말 기준
  ok(dbg.st.game.ply === 2 && dbg.st.game.hintsLeft(-1) === 1, '훈수대로 두면 횟수 차감 (남은 ' + dbg.st.game.hintsLeft(-1) + ')');
  await sleep(1300);
  // 다른 수 → 차감 없음
  registry.btnHint.fire('click');
  await sleep(1500);
  const h2 = dbg.st.hint;
  const other = dbg.st.game.legal().map((m) => [m & 127, m >> 7]).find(([f, t]) => !(f === h2.from && t === h2.to));
  tap(Math.floor(other[0] / 9), other[0] % 9, true); tap(Math.floor(other[1] / 9), other[1] % 9, true);
  ok(dbg.st.game.hintsLeft(-1) === 1, '다른 수를 두면 훈수 횟수 그대로');
  await sleep(1300);
  // 한수쉼
  await sleep(100);
  registry.btnPass.fire('click');
  ok(dbg.st.game.cur.passed === true, '한수쉼 버튼');
  await sleep(2300);
  // 기권
  registry.mResign.fire('click');
  ok(dbg.st.game.cur.over && dbg.st.game.cur.over.type === 'resign', '기권 → 결과');
  ok(registry.resultSheet.classList.contains('show'), '결과 창 표시');
  // 옵션 토글
  registry.btnRules.fire('click');
  const toggles = registry.rulesList.all().filter((c) => c.tag === 'button');
  ok(toggles.length === 4, '규칙 토글 4개');
  toggles[0].fire('click');
  ok(dbg.st.rules.bikjang === false, '빅장 옵션 끔 반영');
  toggles[0].fire('click');
  // 저장/이어하기
  ok(!!store['janggi.save.v1'], '게임 자동 저장');
  console.log(fail ? 'APP TESTS FAILED' : 'app tests passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('예외:', e); process.exit(1); });
