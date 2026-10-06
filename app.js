/* 장기 앱 — 화면/입력/컴퓨터 상대 연결 */
(function () {
  'use strict';
  const T = window.JANGGI_THEME, J = window.Janggi, { Game } = window.JanggiGame;
  const { CHO, HAN } = J;
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'janggi.save.v1', SET_KEY = 'janggi.settings.v1';

  const st = {
    mode: 'pvp',            // pvp | easy | hard
    human: CHO,             // 컴퓨터 대국에서 내 진영
    game: null,
    begun: false,           // 첫 수 전 상차림 단계가 끝났는지
    flip: false,            // 판 180° 회전 (한으로 둘 때 내가 아래)
    sel: null, targets: null,
    thinking: false, token: 0,
    rules: { bikjang: true, pass: true, score: false, repeat: true },
    display: { flipTop: false },
    setupPref: 'NEEN',
    worker: null, workerOk: true,
  };
  const els = new Array(90).fill(null);   // 칸 → 말 요소
  const NAME = { 1: '초', '-1': '한' };
  const HANJA = { 1: '楚', '-1': '漢' };

  /* ---------- 저장 ---------- */
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  function saveSettings() { lsSet(SET_KEY, { rules: st.rules, display: st.display, mode: st.mode, human: st.human, setupPref: st.setupPref }); }
  function saveGame() {
    if (!st.game) return;
    lsSet(SAVE_KEY, { mode: st.mode, human: st.human, begun: st.begun, game: st.game.serialize() });
  }

  /* ---------- 스프라이트 ---------- */
  function applySprite(el, atlas, key, sizeCells) {
    const f = atlas.frames[key], B = T.board;
    el.style.backgroundImage = 'url(' + atlas.image + ')';
    el.style.backgroundSize = (atlas.sheetW / f.w * 100) + '% ' + (atlas.sheetH / f.h * 100) + '%';
    const px = atlas.sheetW - f.w, py = atlas.sheetH - f.h;
    el.style.backgroundPosition = (px ? f.x / px * 100 : 0) + '% ' + (py ? f.y / py * 100 : 0) + '%';
    const w = B.cell * atlas.scale * (sizeCells || 1);
    el.style.width = (w / B.width * 100) + '%';
    el.style.height = (w * f.h / f.w / B.height * 100) + '%';
  }
  function dispRC(sq) {
    let r = J.rowOf(sq), c = J.colOf(sq);
    if (st.flip) { r = 9 - r; c = 8 - c; }
    return [r, c];
  }
  function placeAt(el, sq) {
    const B = T.board, [r, c] = dispRC(sq);
    el.style.left = ((B.originX + c * B.cell) / B.width * 100) + '%';
    el.style.top = ((B.originY + r * B.cell) / B.height * 100) + '%';
  }
  const pieceKey = (p) => (p > 0 ? 'cho.' : 'han.') + J.TYPE_NAME[Math.abs(p)];
  function sideAtTop() { return st.flip ? CHO : HAN; }

  /* ---------- 말 그리기 ---------- */
  function makePiece(p, sq) {
    const el = document.createElement('div');
    el.className = 'sp piece';
    applySprite(el, T.pieces, pieceKey(p));
    placeAt(el, sq);
    if (st.display.flipTop && (p > 0 ? CHO : HAN) === sideAtTop()) el.classList.add('flip');
    $('pieces').appendChild(el);
    return el;
  }
  function rebuildPieces() {
    $('pieces').innerHTML = '';
    els.fill(null);
    const b = st.game.cur.board;
    for (let s = 0; s < 90; s++) if (b[s]) els[s] = makePiece(b[s], s);
  }
  function animateMove(from, to) {
    const el = els[from], dead = els[to];
    if (!el) { rebuildPieces(); return; }
    if (dead) { dead.classList.add('dead'); setTimeout(() => dead.remove(), 260); }
    el.style.zIndex = 3;
    placeAt(el, to);
    els[to] = el; els[from] = null;
    setTimeout(() => { el.style.zIndex = ''; }, 260);
  }

  /* ---------- 표시 마커 ---------- */
  function addMarker(layer, key, sq, cls) {
    const el = document.createElement('div');
    el.className = 'sp mk' + (cls ? ' ' + cls : '');
    applySprite(el, T.markers, key);
    placeAt(el, sq);
    $(layer).appendChild(el);
  }
  function renderMarks() {
    $('marks').innerHTML = ''; $('over').innerHTML = '';
    const g = st.game, c = g.cur;
    if (c.last) { addMarker('marks', 'from', c.last[0]); addMarker('marks', 'to', c.last[1]); }
    if (c.check && !c.over) {
      const ks = J.Position.fromArray(c.board, c.turn).kingSq(c.turn);
      if (ks >= 0) addMarker('marks', 'check', ks, 'pulse');
    }
    if (st.sel != null) {
      addMarker('over', 'select', st.sel);
      for (const t of st.targets) addMarker('over', c.board[t] ? 'capture' : 'dot', t);
    }
  }

  /* ---------- 진영 정보 ---------- */
  function buildSide(color) {
    const root = $(color === CHO ? 'cho' : 'han');
    root.innerHTML =
      '<div class="head"><div class="badge">' + HANJA[color] + '</div>' +
      '<div class="who"><div class="name"></div><div class="sub"></div><div class="pts"></div></div></div>' +
      '<div class="right"><div class="caps"></div><div class="setup"></div></div>';
    const setup = root.querySelector('.setup');
    J.SETUPS.forEach((s) => {
      const b = document.createElement('button');
      b.textContent = s.label; b.dataset.id = s.id;
      b.addEventListener('click', () => chooseSetup(color, s.id));
      setup.appendChild(b);
    });
  }
  function isHumanSide(color) { return st.mode === 'pvp' || color === st.human; }
  function setupOpen() { return !st.game.started && !st.begun; }

  function renderInfo() {
    const g = st.game, c = g.cur, open = setupOpen();
    const caps = g.captured();
    const pts = J.materialPoints(c.board);
    for (const color of [CHO, HAN]) {
      const root = $(color === CHO ? 'cho' : 'han');
      root.classList.toggle('turn', !c.over && c.turn === color && !open);
      root.classList.toggle('setupOpen', open);
      const top = sideAtTop() === color;
      root.style.gridArea = top ? 'top' : 'bot';
      root.classList.toggle('atop', top); root.classList.toggle('abot', !top);
      const who = st.mode === 'pvp' ? '' : (color === st.human ? ' · 나' : ' · 컴퓨터');
      root.querySelector('.name').textContent = NAME[color] + who;
      const sub = root.querySelector('.sub');
      let txt = '', cls = 'sub';
      if (open) txt = '상차림';
      else if (!c.over && c.turn === color) {
        if (st.thinking && !isHumanSide(color)) txt = '생각 중…';
        else if (c.check) { txt = '장군!'; cls += ' check'; }
        else txt = '차례';
      }
      sub.textContent = txt; sub.className = cls;
      const p = color === CHO ? pts.cho : pts.han;
      root.querySelector('.pts').textContent = '기물 ' + (color === HAN && st.game.rules.score ? pts.hanRaw + '+1.5' : p) + '점';
      // 상차림 선택 / 잡은 말
      const setup = root.querySelector('.setup'), capsEl = root.querySelector('.caps');
      setup.style.display = open ? '' : 'none';
      capsEl.style.display = open ? 'none' : '';
      if (open) {
        const cur = g.setup[color === CHO ? 'cho' : 'han'];
        setup.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('on', b.dataset.id === cur);
          b.disabled = !isHumanSide(color);
        });
      } else {
        capsEl.innerHTML = '';
        for (const p of (color === CHO ? caps.cho : caps.han)) {
          const d = document.createElement('div');
          d.className = 'cap';
          const f = T.pieces.frames[pieceKey(p)], a = T.pieces;
          d.style.backgroundImage = 'url(' + a.image + ')';
          d.style.backgroundSize = (a.sheetW / f.w * 100) + '% ' + (a.sheetH / f.h * 100) + '%';
          d.style.backgroundPosition = ((a.sheetW - f.w) ? f.x / (a.sheetW - f.w) * 100 : 0) + '% ' + ((a.sheetH - f.h) ? f.y / (a.sheetH - f.h) * 100 : 0) + '%';
          capsEl.appendChild(d);
        }
      }
    }
  }

  function renderControls() {
    const g = st.game, c = g.cur;
    const humanTurn = isHumanSide(c.turn) && !st.thinking;
    $('btnUndo').disabled = g.ply === 0 && !c.over;
    $('btnPass').disabled = !(humanTurn && !c.over && g.started && g.canPass());
    $('btnPass').style.display = g.rules.pass ? '' : 'none';
    const aiFirst = st.mode !== 'pvp' && st.human === HAN;
    $('startBtn').hidden = !(aiFirst && setupOpen());
  }

  function renderAll(opts) {
    opts = opts || {};
    renderMarks(); renderInfo(); renderControls();
    saveGame();
  }

  /* ---------- 토스트 / 결과 ---------- */
  let toastT = null;
  function toast(msg, warn) {
    const t = $('toast');
    t.textContent = msg; t.className = 'show' + (warn ? ' warn' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 1150);
  }
  function showResult(o) {
    let title = '', text = '';
    const nm = (col) => NAME[col];
    const mine = st.mode !== 'pvp';
    const winTitle = (w) => (!mine ? nm(w) + ' 승리' : (w === st.human ? '승리했어요!' : '컴퓨터가 이겼어요'));
    const pts = (o.scoreCho != null) ? '\n초 ' + o.scoreCho + '점 : 한 ' + o.scoreHan + '점 (한 덤 1.5점 포함)' : '';
    switch (o.type) {
      case 'checkmate': title = winTitle(o.winner); text = nm(-o.winner) + '의 장이 외통에 몰렸습니다.'; break;
      case 'resign': title = winTitle(o.winner); text = nm(-o.winner) + ' 기권.'; break;
      case 'bikjang': title = '무승부'; text = '두 장이 마주 보았습니다 (빅장).'; break;
      case 'bikjang-score': title = winTitle(o.winner); text = '빅장 — 기물 점수로 승패를 가렸습니다.' + pts; break;
      case 'pass-score': title = winTitle(o.winner); text = '양쪽이 연달아 한수쉼 — 기물 점수로 승패를 가렸습니다.' + pts; break;
      case 'pass-draw': title = '무승부'; text = '양쪽이 연달아 한수쉼 했습니다.'; break;
      case 'repeat': title = '무승부'; text = '같은 국면이 세 번 반복되었습니다.'; break;
      default: title = '대국 종료';
    }
    $('resTitle').textContent = title; $('resText').textContent = text;
    openOverlay('resultSheet');
  }

  /* ---------- 오버레이 ---------- */
  function openOverlay(id) { $(id).classList.add('show'); }
  function closeOverlay(id) { $(id).classList.remove('show'); }

  /* ---------- 진행 ---------- */
  function afterMove(res) {
    renderAll();
    if (res.pass) toast(res.forced ? '둘 수 있는 수가 없어 한수쉼' : '한수쉼');
    else if (res.check && !res.over) toast('장군!', true);
    if (res.over) { st.thinking = false; renderAll(); setTimeout(() => showResult(res.over), 650); return; }
    if (res.needPass) {
      const t = ++st.token;
      setTimeout(() => {
        if (t !== st.token) return;
        const r = st.game.pass(true);
        afterMove(r);
      }, 900);
      return;
    }
    maybeAI();
  }

  function applyMove(from, to) {
    const g = st.game;
    const res = g.move(from, to);
    if (!res.ok) return false;
    st.begun = true;
    st.sel = null; st.targets = null;
    animateMove(from, to);
    afterMove(res);
    return true;
  }

  function maybeAI() {
    const g = st.game, c = g.cur;
    if (c.over || st.mode === 'pvp' || c.turn === st.human || !st.begun) { renderControls(); return; }
    requestAI();
  }

  function requestAI() {
    const g = st.game, c = g.cur;
    st.thinking = true; renderInfo(); renderControls();
    const id = ++st.token;
    const hard = st.mode === 'hard';
    const msg = {
      id, board: Array.from(c.board), turn: c.turn, level: st.mode, rules: Object.assign({}, g.rules),
      repCounts: g.repCounts(), repOn: g.rules.repeat && g.epoch >= 0,
      timeMs: hard ? 1800 : 80, maxDepth: hard ? 8 : 1,
    };
    const t0 = Date.now();
    const done = (move) => {
      if (id !== st.token) return;
      const wait = Math.max(0, 520 - (Date.now() - t0));
      setTimeout(() => {
        if (id !== st.token) return;
        st.thinking = false;
        const g2 = st.game;
        if (move === J.PASS) { afterMove(g2.pass(true)); return; }
        const from = J.mvFrom(move), to = J.mvTo(move);
        const res = g2.move(from, to);
        if (!res.ok) { st.thinking = false; renderAll(); return; }
        animateMove(from, to);
        afterMove(res);
      }, wait);
    };
    if (st.workerOk && window.Worker && location.protocol !== 'file:') {
      try {
        if (!st.worker) {
          st.worker = new Worker('worker.js');
          st.worker.onmessage = (e) => { if (st.pending) st.pending(e.data.move, e.data.id); };
          st.worker.onerror = () => { st.workerOk = false; st.worker = null; fallback(); };
        }
        st.pending = (move, rid) => { if (rid === id) done(move); };
        st.worker.postMessage(msg);
        return;
      } catch (e) { st.workerOk = false; }
    }
    fallback();
    function fallback() {
      if (id !== st.token) return;
      msg.timeMs = hard ? 900 : 60;
      setTimeout(() => {
        if (id !== st.token) return;
        const r = window.JanggiAI.chooseMove(c.board, c.turn, msg);
        done(r.move);
      }, 40);
    }
  }

  /* ---------- 입력 ---------- */
  function onBoardPointer(e) {
    if (!st.game || e.button > 0) return;
    const g = st.game, c = g.cur;
    if (c.over || st.thinking || !isHumanSide(c.turn)) return;
    if (st.mode !== 'pvp' && st.human === HAN && !st.begun) return;
    const rect = $('board').getBoundingClientRect(), B = T.board, k = rect.width / B.width;
    const x = (e.clientX - rect.left) / k, y = (e.clientY - rect.top) / k;
    let c0 = Math.round((x - B.originX) / B.cell), r0 = Math.round((y - B.originY) / B.cell);
    if (r0 < 0 || r0 > 9 || c0 < 0 || c0 > 8) return;
    let r = r0, col = c0;
    if (st.flip) { r = 9 - r; col = 8 - col; }
    const sq = J.sqOf(r, col);
    if (st.sel != null && st.targets.includes(sq)) { applyMove(st.sel, sq); return; }
    const p = c.board[sq];
    if (p && (p > 0 ? CHO : HAN) === c.turn && sq !== st.sel) {
      st.sel = sq; st.targets = g.legalFrom(sq);
    } else { st.sel = null; st.targets = null; }
    renderMarks();
  }

  function chooseSetup(color, id) {
    if (!setupOpen() || !isHumanSide(color)) return;
    st.game.setSetup(color === CHO ? 'cho' : 'han', id);
    if (st.mode === 'pvp' || color === st.human) { st.setupPref = id; saveSettings(); }
    rebuildPieces(); renderAll();
  }

  /* ---------- 새 게임 ---------- */
  function randomSetup() { return J.SETUPS[(Math.random() * 4) | 0].id; }
  function newGame() {
    st.token++; st.thinking = false; st.sel = null; st.targets = null;
    st.flip = st.mode !== 'pvp' && st.human === HAN;
    const setup = { cho: randomSetup(), han: randomSetup() };
    if (st.mode === 'pvp') { setup.cho = st.setupPref; setup.han = st.setupPref; }
    else setup[st.human === CHO ? 'cho' : 'han'] = st.setupPref;
    st.game = new Game({ rules: st.rules, setup });
    st.begun = false;
    st.game.rules = st.rules; // 같은 객체 공유 (옵션 변경 즉시 반영)
    rebuildPieces(); renderAll();
    closeOverlay('home'); closeOverlay('resultSheet');
  }
  function resume() {
    const d = lsGet(SAVE_KEY);
    if (!d || !d.game) return false;
    try {
      st.mode = d.mode; st.human = d.human;
      st.flip = st.mode !== 'pvp' && st.human === HAN;
      st.game = Game.deserialize(d.game);
      st.game.rules = st.rules; // 현재 규칙 옵션 사용
      st.begun = !!d.begun || st.game.started;
      st.token++; st.thinking = false; st.sel = null; st.targets = null;
      rebuildPieces(); renderAll();
      closeOverlay('home');
      if (st.game.cur.over) setTimeout(() => showResult(st.game.cur.over), 300);
      else maybeAI();
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 옵션 UI ---------- */
  const RULE_DEFS = [
    { key: 'bikjang', title: '빅장', desc: '켜면 두 장이 마주 보는 순간 대국이 끝납니다 (점수제를 켜면 점수 판정, 아니면 무승부). 끄면 두 장이 마주 보게 되는 수는 둘 수 없습니다.' },
    { key: 'pass', title: '한수쉼', desc: '켜면 장군 상태가 아닐 때 차례를 넘길 수 있습니다. (둘 수 있는 수가 전혀 없을 때는 자동으로 한수쉼)' },
    { key: 'score', title: '점수제', desc: '켜면 빅장이나 양쪽이 연달아 한수쉼 했을 때 남은 기물 점수로 승패를 가립니다. 차 13·포 7·마 5·상 3·사 3·졸 2, 한 덤 1.5점.' },
    { key: 'repeat', title: '3회 반복 무승부', desc: '켜면 같은 국면이 세 번 나왔을 때 무승부로 끝납니다. 켠 시점부터 세기 시작합니다.' },
  ];
  const DISPLAY_DEFS = [
    { key: 'flipTop', title: '위쪽 말 뒤집기', desc: '켜면 위쪽 진영의 말을 180° 돌려 마주 앉아 두기 편하게 합니다.' },
  ];
  function buildToggles(listId, defs, store, onChange) {
    const list = $(listId); list.innerHTML = '';
    defs.forEach((d) => {
      const row = document.createElement('div'); row.className = 'sw';
      row.innerHTML = '<div class="t"><b>' + d.title + '</b><span>' + d.desc + '</span></div>';
      const tg = document.createElement('button');
      tg.className = 'toggle'; tg.setAttribute('role', 'switch'); tg.setAttribute('aria-label', d.title);
      tg.setAttribute('aria-checked', store[d.key] ? 'true' : 'false');
      tg.addEventListener('click', () => {
        const v = tg.getAttribute('aria-checked') !== 'true';
        tg.setAttribute('aria-checked', v ? 'true' : 'false');
        onChange(d.key, v);
      });
      row.appendChild(tg); list.appendChild(row);
    });
  }
  function buildOptions() {
    buildToggles('rulesList', RULE_DEFS, st.rules, (k, v) => {
      if (st.game) st.game.setRule(k, v);
      st.rules[k] = v;
      if (st.game) st.game.rules = st.rules;
      saveSettings(); if (st.game) renderAll();
    });
    buildToggles('displayList', DISPLAY_DEFS, st.display, (k, v) => {
      st.display[k] = v; saveSettings();
      if (st.game) { rebuildPieces(); }
    });
  }

  /* ---------- 배치 ---------- */
  function layout() {
    const app = $('app'), cs = getComputedStyle(app);
    const vw = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const vh = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const r = window.JanggiLayout.compute(vw, vh, T.board.width / T.board.height);
    app.classList.toggle('port', r.mode === 'port'); app.classList.toggle('land', r.mode === 'land');
    const s = app.style;
    s.setProperty('--bw', r.bw + 'px'); s.setProperty('--bh', r.bh + 'px');
    s.setProperty('--pw', r.pw + 'px'); s.setProperty('--info-h', r.infoH + 'px'); s.setProperty('--ctl-h', r.ctlH + 'px');
  }

  /* ---------- 버튼 연결 ---------- */
  function wire() {
    $('board').style.backgroundImage = 'url(' + T.board.image + ')';
    buildSide(CHO); buildSide(HAN);
    $('board').addEventListener('pointerup', onBoardPointer);

    document.querySelectorAll('#home [data-mode]').forEach((b) => b.addEventListener('click', () => {
      st.mode = b.dataset.mode; saveSettings(); newGame();
    }));
    document.querySelectorAll('#sidePick .seg button').forEach((b) => b.addEventListener('click', () => {
      st.human = b.dataset.val === 'han' ? HAN : CHO;
      document.querySelectorAll('#sidePick .seg button').forEach((x) => x.classList.toggle('on', x === b));
      saveSettings();
    }));
    $('homeRules').addEventListener('click', () => { buildOptions(); openOverlay('rulesSheet'); });
    $('btnRules').addEventListener('click', () => { buildOptions(); openOverlay('rulesSheet'); });
    $('homeResume').addEventListener('click', () => { if (!resume()) newGame(); });
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('.overlay').classList.remove('show')));

    $('btnMenu').addEventListener('click', () => openOverlay('menuSheet'));
    $('mNew').addEventListener('click', () => { closeOverlay('menuSheet'); newGame(); });
    $('mHome').addEventListener('click', () => { closeOverlay('menuSheet'); st.token++; st.thinking = false; refreshHome(); openOverlay('home'); });
    $('mResign').addEventListener('click', () => {
      closeOverlay('menuSheet');
      const g = st.game;
      if (g.cur.over || !st.begun && !g.started) return;
      const who = st.mode === 'pvp' ? g.cur.turn : st.human;
      g.resign(who); st.token++; st.thinking = false; renderAll(); showResult(g.cur.over);
    });
    $('resNew').addEventListener('click', () => { closeOverlay('resultSheet'); newGame(); });
    $('resView').addEventListener('click', () => closeOverlay('resultSheet'));

    $('btnUndo').addEventListener('click', () => {
      const g = st.game;
      if (g.ply === 0) return;
      st.token++; st.thinking = false; st.sel = null; st.targets = null;
      g.cur.over = null;
      if (st.mode === 'pvp') g.undo(1);
      else { do { g.undo(1); } while (g.cur.turn !== st.human && g.ply > 0); }
      if (!g.started && !(st.mode === 'pvp')) st.begun = false;
      closeOverlay('resultSheet');
      rebuildPieces(); renderAll();
      if (g.cur.over == null) maybeAI();
    });
    $('btnPass').addEventListener('click', () => {
      const g = st.game;
      if (!g.canPass()) return;
      st.begun = true; st.sel = null; st.targets = null;
      afterMove(g.pass(false));
    });
    $('startBtn').addEventListener('click', () => { st.begun = true; renderAll(); maybeAI(); });

    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', () => setTimeout(layout, 120));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  function refreshHome() {
    const saved = lsGet(SAVE_KEY);
    $('homeResume').hidden = !(saved && saved.game && saved.game.states && saved.game.states.length > 1 && !(saved.game.states[saved.game.states.length - 1].o));
    document.querySelectorAll('#sidePick .seg button').forEach((x) => x.classList.toggle('on', (x.dataset.val === 'han') === (st.human === HAN)));
  }

  /* ---------- 시작 ---------- */
  function init() {
    const s = lsGet(SET_KEY);
    if (s) {
      Object.assign(st.rules, s.rules || {});
      Object.assign(st.display, s.display || {});
      if (s.human === HAN || s.human === CHO) st.human = s.human;
      if (s.mode) st.mode = s.mode;
      if (s.setupPref) st.setupPref = s.setupPref;
    }
    wire(); layout();
    st.game = new Game({ rules: st.rules, setup: { cho: st.setupPref, han: st.setupPref } });
    st.game.rules = st.rules;
    rebuildPieces(); renderAll();
    refreshHome();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    window.__janggi = { st, J, newGame }; // 디버그용
  }
  init();
})();
