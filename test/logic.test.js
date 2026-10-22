'use strict';
// 푸드덕 병아리 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

const DT = 1 / 60;
const run = (st, sec) => { for (let t = 0; t < sec && !st.over; t += DT) L.step(st, DT); };

test('before the first flap the chick floats; flapping starts the game', () => {
  const st = L.newGame(1);
  run(st, 3);
  assert.strictEqual(st.state, 'ready');
  assert.ok(!st.over && Math.abs(st.y - 250) <= 8);
  assert.ok(L.flap(st));
  assert.strictEqual(st.state, 'play');
  assert.strictEqual(st.vy, L.FLAP);
});

test('falling hits the ground; the ceiling only stops you', () => {
  const st = L.newGame(2);
  L.flap(st);
  run(st, 5);
  assert.ok(st.over);
  assert.strictEqual(st.why, 'ground');
  const up = L.newGame(3);
  L.flap(up);
  for (let k = 0; k < 40 && !up.over; k++) { L.flap(up); L.step(up, DT); L.step(up, DT); }
  assert.ok(up.y >= L.R);
  assert.ok(!up.over || up.why === 'pipe', 'touching the top never ends the game by itself');
  assert.strictEqual(L.flap(st), false, 'no flapping after the game is over');
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

// 0.1초마다 "푸드덕 / 가만" 을 고르며 0.9초 앞까지 버틸 수 있는 쪽을 고르는 자동 조종
const clone = (st) => ({ ...st, rand: () => 0.5, pipes: st.pipes.map((p) => ({ ...p })), events: [] });
function survives(st, depth) {
  if (st.over) return false;
  if (depth === 0) return true;
  for (const f of [false, true]) {
    const s = clone(st);
    if (f) L.flap(s);
    for (let k = 0; k < 6 && !s.over; k++) L.step(s, DT);
    if (survives(s, depth - 1)) return true;
  }
  return false;
}
function autopilot(seed, goal) {
  const st = L.newGame(seed); L.flap(st);
  while (!st.over && st.score < goal) {
    const quiet = clone(st);
    for (let k = 0; k < 6 && !quiet.over; k++) L.step(quiet, DT);
    if (!survives(quiet, 8)) L.flap(st);
    for (let k = 0; k < 6 && !st.over; k++) L.step(st, DT);
  }
  return st;
}

test('every course is passable: a look-ahead autopilot gets far past the gold medal', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const st = autopilot(seed, 80);
    assert.ok(st.score >= 80, `seed ${seed} stopped at ${st.score} (${st.why})`);
  }
});

test('same seed, same flaps → same game', () => {
  const a = autopilot(5, 20), b = autopilot(5, 20);
  assert.strictEqual(a.flaps, b.flaps);
  assert.strictEqual(a.dist, b.dist);
});
