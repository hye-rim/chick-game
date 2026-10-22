'use strict';
// 푸드덕 병아리 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

const DT = 1 / 60;
const run = (st, sec) => { for (let t = 0; t < sec && !st.over; t += DT) L.step(st, DT); };

test('before the first press the chick floats; pressing starts the game', () => {
  const st = L.newGame(1);
  run(st, 3);
  assert.strictEqual(st.state, 'ready');
  assert.ok(!st.over && Math.abs(st.y - 250) <= 8);
  assert.ok(L.press(st));
  assert.strictEqual(st.state, 'play');
  assert.ok(st.hold);
});

test('holding rises (never faster than the limit), releasing falls (never faster than the limit)', () => {
  const st = L.newGame(7);
  L.press(st);
  const y0 = st.y;
  run(st, 0.5);
  assert.ok(st.y < y0 - 30, 'held: moved up');
  assert.ok(st.vy < 0 && st.vy >= -L.VUP - 1e-9, 'rise speed is capped');
  assert.ok(L.release(st));
  assert.ok(!L.release(st), 'releasing twice does nothing');
  const peak = st.y;
  run(st, 0.6);
  assert.ok(st.y > peak, 'released: moved down');
  assert.ok(st.vy > 0 && st.vy <= L.VMAX + 1e-9, 'fall speed is capped');
  // 누르고 있던 시간은 쌓이고, 떼면 다음 누름에서 0 부터 센다 (튜토리얼이 "꾹 눌렀다"를 알아채는 데 쓴다)
  L.press(st); run(st, 0.4);
  assert.ok(st.held >= 0.39);
  L.release(st); L.press(st);
  assert.strictEqual(st.held, 0);
});

test('events: one flap per press (holding does not repeat it) and one release', () => {
  const st = L.newGame(8);
  L.press(st); L.press(st); L.press(st);
  run(st, 0.2);
  L.release(st);
  assert.deepStrictEqual(st.events, ['flap', 'release']);
  assert.strictEqual(st.flaps, 1);
});

test('falling hits the ground; the ceiling only stops you', () => {
  const st = L.newGame(2);
  L.press(st); L.release(st);
  run(st, 5);
  assert.ok(st.over);
  assert.strictEqual(st.why, 'ground');
  const up = L.newGame(3);
  L.press(up);
  run(up, 1.2);
  assert.ok(up.y >= L.R);
  assert.ok(!up.over || up.why === 'pipe', 'touching the top never ends the game by itself');
  assert.strictEqual(L.press(st), false, 'no pressing after the game is over');
});

test('difficulty: faster, narrower gaps and moving pipes later, all within limits', () => {
  assert.ok(L.speedFor(0) < L.speedFor(30) && L.speedFor(1000) === 215);
  assert.ok(L.gapFor(0) > L.gapFor(20) && L.gapFor(1000) === 124);
  assert.ok(L.gapFor(1000) > L.R * 2 * 4, 'the narrowest gap is still four chicks tall');
  assert.deepStrictEqual([0, 9, 10, 24, 25, 39, 40].map(L.medalOf), [0, 0, 1, 1, 2, 2, 3]);
});

test('pipes: gaps stay inside the screen, never jump too far, and only move from score 12', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const st = L.newGame(seed);
    for (let k = 0; k < 200; k++) {
      st.score = k;
      const before = st.lastGap;
      L.addPipe(st);
      const p = st.pipes[st.pipes.length - 1];
      assert.ok(p.c - p.amp - p.gap / 2 >= L.MARGIN - 1e-9, 'top of the gap stays below the ceiling margin');
      assert.ok(p.c + p.amp + p.gap / 2 <= L.GROUND - L.MARGIN + 1e-9, 'bottom of the gap stays above the ground margin');
      assert.ok(Math.abs(p.c - before) <= 120 + Math.min(30, k) + 1e-9);
      if (k < L.MOVE_FROM) assert.strictEqual(p.amp, 0);
    }
  }
});

// 0.1초마다 "누른다 / 뗀다" 를 고르며 1.2초 앞까지 버틸 수 있는 쪽을 고르는 자동 조종 (사람이 판을 읽는 만큼)
const clone = (st) => ({ ...st, rand: () => 0.5, pipes: st.pipes.map((p) => ({ ...p })), events: [] });
const hold = (s, on) => { if (on) L.press(s); else L.release(s); s.events.length = 0; };
function survives(st, depth) {
  if (st.over) return false;
  if (depth === 0) return true;
  for (const on of [false, true]) {
    const s = clone(st);
    hold(s, on);
    for (let k = 0; k < 6 && !s.over; k++) L.step(s, DT);
    if (survives(s, depth - 1)) return true;
  }
  return false;
}
function autopilot(seed, goal) {
  const st = L.newGame(seed); L.press(st);
  while (!st.over && st.score < goal) {
    // 이번 0.1초를 누르고 있을지/뗄지: 뗐을 때 버틸 수 있으면 떼고, 아니면 누른다
    const quiet = clone(st); hold(quiet, false);
    for (let k = 0; k < 6 && !quiet.over; k++) L.step(quiet, DT);
    hold(st, !survives(quiet, 12));
    for (let k = 0; k < 6 && !st.over; k++) L.step(st, DT);
    st.events.length = 0;
  }
  return st;
}

test('every course is passable: a look-ahead autopilot gets far past the gold medal', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const st = autopilot(seed, 80);
    assert.ok(st.score >= 80, `seed ${seed} stopped at ${st.score} (${st.why})`);
  }
});

test('same seed and same presses give the same game', () => {
  const a = autopilot(5, 20), b = autopilot(5, 20);
  assert.strictEqual(a.flaps, b.flaps);
  assert.strictEqual(a.dist, b.dist);
});
