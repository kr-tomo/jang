/* 게임 진행 (규칙 옵션, 종료 판정, 무르기) — UMD */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.JanggiGame = factory(root.Janggi);
})(typeof self !== 'undefined' ? self : this, function (J) {
  'use strict';
  const { CHO, HAN } = J;

  const DEFAULT_RULES = { bikjang: true, pass: true, score: false, repeat: true };

  function pack(b) { let s = ''; for (let i = 0; i < 90; i++) s += String.fromCharCode(48 + b[i] + 7); return s; }
  function unpack(s) { const b = new Int8Array(90); for (let i = 0; i < 90; i++) b[i] = s.charCodeAt(i) - 48 - 7; return b; }

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.rules = Object.assign({}, DEFAULT_RULES, opts.rules || {});
      this.setup = { cho: (opts.setup && opts.setup.cho) || 'NEEN', han: (opts.setup && opts.setup.han) || 'NEEN' };
      this.hintInit = Object.assign({ cho: 0, han: 0 }, opts.hints || {}); // 진영별 훈수 가능 횟수 (첫 수 전에 정함)
      this.hint = null;                                                    // 현재 보여 준 훈수 {key, move}
      this.reset();
    }

    reset() {
      const board = J.initialBoard(this.setup.cho, this.setup.han);
      this.states = [{ board, turn: CHO, passStreak: 0, last: null, over: null, check: false, passed: false, key: J.keyOf(board, CHO), hints: Object.assign({}, this.hintInit) }];
      this.hint = null;
      this.epoch = this.rules.repeat ? 0 : -1; // 반복 집계 시작 지점 (-1 = 집계 안 함)
    }

    get cur() { return this.states[this.states.length - 1]; }
    get ply() { return this.states.length - 1; }
    get started() { return this.ply > 0; }

    setSetup(side, id) {
      if (this.started) return false;
      this.setup[side] = id;
      this.reset();
      return true;
    }

    /* 규칙 변경은 앞으로 두는 수부터 적용된다. 반복 집계만 현재 국면부터 새로 시작. */
    /* ---------- 훈수 ---------- */
    setHints(side, n) { // 첫 수 전에만
      if (this.started) return false;
      n = Math.max(0, Math.min(5, n | 0));
      this.hintInit[side] = n;
      this.states[0].hints[side] = n;
      return true;
    }
    hintsLeft(color) { return this.cur.hints[color === CHO ? 'cho' : 'han']; }
    canHint() { return !this.cur.over && this.hintsLeft(this.cur.turn) > 0; }
    setHint(move) { this.hint = { key: this.cur.key, move }; }
    clearHint() { this.hint = null; }
    currentHint() { return this.hint && this.hint.key === this.cur.key ? this.hint : null; }

    setRule(name, value) {
      const prev = this.rules[name];
      this.hint = null;
      this.rules[name] = value;
      if (name === 'repeat' && prev !== value) this.epoch = value ? this.states.length - 1 : -1;
    }

    pos() { return J.Position.fromArray(this.cur.board, this.cur.turn); }
    legal() { return J.legalMoves(this.pos(), this.rules); }
    legalFrom(sq) { return this.legal().filter((m) => J.mvFrom(m) === sq).map((m) => J.mvTo(m)); }
    inCheck() { return this.pos().inCheck(); }

    repCounts() {
      const out = {};
      if (this.epoch < 0) return out;
      for (let i = this.epoch; i < this.states.length; i++) out[this.states[i].key] = (out[this.states[i].key] || 0) + 1;
      return out;
    }

    canPass() {
      const c = this.cur;
      return !c.over && this.rules.pass && !this.inCheck();
    }

    /* 결과 객체 생성 */
    _scoreResult(type) {
      const p = J.materialPoints(this.cur.board);
      const winner = p.cho > p.han ? CHO : HAN;
      return { type, winner, scoreCho: p.cho, scoreHan: p.han };
    }

    /* 수 두기. 반환: {ok, captured, check, over, forcedPass} */
    move(from, to) {
      const c = this.cur;
      if (c.over) return { ok: false };
      const m = J.mv(from, to);
      if (!this.legal().includes(m)) return { ok: false };
      return this._apply(m);
    }

    pass(forced) {
      const c = this.cur;
      if (c.over) return { ok: false };
      if (!forced && !this.canPass()) return { ok: false };
      return this._apply(J.PASS, forced);
    }

    _apply(m, forced) {
      const c = this.cur;
      const pos = this.pos();
      const mover = c.turn;
      const isPass = m === J.PASS;
      const captured = isPass ? 0 : c.board[J.mvTo(m)];
      // 훈수를 따라 둔 경우에만 횟수 차감
      const sk = mover === CHO ? 'cho' : 'han';
      const hintUsed = !isPass && !!this.hint && this.hint.key === c.key && this.hint.move === m && (c.hints ? c.hints[sk] : 0) > 0;
      const hints = Object.assign({ cho: 0, han: 0 }, c.hints);
      if (hintUsed) hints[sk]--;
      this.hint = null;
      pos.make(m);
      const board = new Int8Array(pos.b);
      const next = {
        board, turn: pos.turn, passStreak: isPass ? c.passStreak + 1 : 0,
        last: isPass ? null : [J.mvFrom(m), J.mvTo(m)], over: null, check: false, passed: isPass,
        key: J.keyOf(board, pos.turn), hints,
      };
      this.states.push(next);
      let needPass = false;
      if (!isPass && pos.facing()) { // 빅장 (규칙이 켜진 경우에만 둘 수 있었음)
        next.over = this.rules.score ? this._scoreResult('bikjang-score') : { type: 'bikjang', winner: 0 };
      } else if (isPass && next.passStreak >= 2) {
        next.over = this.rules.score ? this._scoreResult('pass-score') : { type: 'pass-draw', winner: 0 };
      } else {
        const chk = pos.inCheck();
        next.check = chk;
        const legal = J.legalMoves(pos, this.rules);
        if (!legal.length) {
          if (chk) next.over = { type: 'checkmate', winner: mover };
          else needPass = true;
        } else if (this.epoch >= 0) {
          let n = 0;
          for (let i = this.epoch; i < this.states.length; i++) if (this.states[i].key === next.key) n++;
          if (n >= 3 && this.rules.repeat) next.over = { type: 'repeat', winner: 0 };
        }
      }
      return { ok: true, mover, captured, check: next.check, over: next.over, needPass, pass: isPass, forced: !!forced, hintUsed };
    }

    /* 편집 모드 확정: 편집한 판을 새 국면으로 이어 붙인다 (무르기로 편집 전으로 돌아갈 수 있다).
     * 반환: {ok, unchanged} 또는 {ok:false, reason}. 성공 시 _apply 와 같은 필드(check/over/needPass)를 돌려준다. */
    commitEdit(board, turn) {
      const c = this.cur;
      let same = turn === c.turn;
      for (let i = 0; same && i < 90; i++) if (board[i] !== c.board[i]) same = false;
      if (same) return { ok: true, unchanged: true };
      const b = new Int8Array(board);
      const pos = J.Position.fromArray(b, turn);
      if (pos.kc < 0 || pos.kh < 0) return { ok: false, reason: 'king' };
      // 차례가 아닌 쪽의 장이 이미 공격받고 있으면 장을 잡을 수 있는 불가능한 국면
      if (J.attacked(b, pos.kingSq(-turn), turn)) return { ok: false, reason: 'enemyCheck' };
      const next = {
        board: b, turn, passStreak: 0, last: null, over: null, check: false, passed: false,
        key: J.keyOf(b, turn), hints: Object.assign({ cho: 0, han: 0 }, c.hints),
      };
      this.states.push(next);
      this.hint = null;
      if (this.epoch >= 0) this.epoch = this.states.length - 1; // 반복 집계는 편집한 국면부터 다시
      let needPass = false;
      if (pos.facing() && this.rules.bikjang) {
        next.over = this.rules.score ? this._scoreResult('bikjang-score') : { type: 'bikjang', winner: 0 };
      } else {
        const chk = pos.inCheck();
        next.check = chk;
        if (!J.legalMoves(pos, this.rules).length) {
          if (chk) next.over = { type: 'checkmate', winner: -turn };
          else needPass = true;
        }
      }
      return { ok: true, mover: -turn, check: next.check, over: next.over, needPass, pass: false, forced: false, hintUsed: false, edited: true };
    }

    resign(color) {
      const c = this.cur;
      if (c.over) return false;
      c.over = { type: 'resign', winner: -color };
      return true;
    }

    undo(n) {
      n = n || 1;
      this.hint = null;
      let k = 0;
      while (k < n && this.states.length > 1) { this.states.pop(); k++; }
      if (this.epoch >= this.states.length) this.epoch = this.rules.repeat ? this.states.length - 1 : -1;
      return k;
    }

    /* 말 잡힌 수 (표시용) */
    captured() {
      const init = J.initialBoard(this.setup.cho, this.setup.han);
      const cnt = (b) => { const m = {}; for (let i = 0; i < 90; i++) if (b[i]) m[b[i]] = (m[b[i]] || 0) + 1; return m; };
      const a = cnt(init), b = cnt(this.cur.board);
      const out = { cho: [], han: [] }; // cho: 초가 잡은 한 기물 / han: 한이 잡은 초 기물
      for (const k of Object.keys(a)) {
        const lost = a[k] - (b[k] || 0);
        for (let i = 0; i < lost; i++) (Number(k) > 0 ? out.han : out.cho).push(Number(k));
      }
      const order = (x, y) => J.SCORE_VALUE[Math.abs(y)] - J.SCORE_VALUE[Math.abs(x)];
      out.cho.sort(order); out.han.sort(order);
      return out;
    }

    serialize() {
      return {
        v: 1, rules: this.rules, setup: this.setup, epoch: this.epoch, hintInit: this.hintInit,
        states: this.states.map((s) => ({ b: pack(s.board), t: s.turn, ps: s.passStreak, l: s.last, o: s.over, c: s.check ? 1 : 0, p: s.passed ? 1 : 0, h: [s.hints.cho, s.hints.han] })),
      };
    }
    static deserialize(d) {
      const g = new Game({ rules: d.rules, setup: d.setup, hints: d.hintInit });
      g.epoch = d.epoch;
      g.states = d.states.map((s) => {
        const board = unpack(s.b);
        return { board, turn: s.t, passStreak: s.ps, last: s.l, over: s.o, check: !!s.c, passed: !!s.p, key: J.keyOf(board, s.t), hints: { cho: s.h ? s.h[0] : 0, han: s.h ? s.h[1] : 0 } };
      });
      return g;
    }
  }

  return { Game, DEFAULT_RULES };
});
