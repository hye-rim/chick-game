'use strict';

// 푸드덕 병아리: 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 병아리는 일정한 속도로 오른쪽으로 날아가고(세상이 왼쪽으로 흐른다), 누르고 있으면 위로 올라가고 떼면 떨어진다
// - 사탕 기둥의 틈으로 지나가면 1점. 기둥·땅에 닿으면 끝 (천장은 닿아도 튕겨 내려올 뿐)
// - 점수가 오를수록: 틈이 좁아지고, 조금씩 빨라지고, 12점부터는 위아래로 움직이는 기둥이 섞여 나온다
const LOGIC_CHICK = (() => {
const W = 360, H = 560, GROUND = 500;
const BX = 96, R = 13;                       // 병아리 x 위치와 몸 반지름(충돌)
const GRAV = 1500, LIFT = 3400;              // px/s²: 떨어지는 힘 · 누르고 있을 때 위로 당기는 힘 (둘의 차이만큼 올라간다)
const VUP = 380, VMAX = 520;                 // 올라가는 속도 한계 · 떨어지는 속도 한계 (px/s)
const PIPE_W = 62;
const MARGIN = 54;                           // 틈의 위·아래 끝이 천장·땅에서 최소한 떨어지는 거리
const MOVE_FROM = 12;                        // 움직이는 기둥이 나오기 시작하는 점수

const speedFor = (score) => Math.min(215, 140 + score * 2.4);
const gapFor = (score) => Math.max(124, 174 - score * 1.7);
const spacingFor = (score) => 196 + Math.min(40, score * 1.0);      // 기둥 사이 거리: 빨라지는 만큼 조금 넓어진다

function rng(seed) {                         // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newGame(seed = (Math.random() * 2 ** 31) | 0) {
  return {
    seed, rand: rng(seed), state: 'ready', t: 0, y: 250, vy: 0, score: 0, dist: 0,
    pipes: [], nextX: W + 120, lastGap: 250, hold: false, held: 0, flaps: 0, over: false, events: [],
  };
}

// 다음 기둥 하나: 앞 기둥과 높이가 너무 크게 다르지 않게 (한 번 푸드덕으로 닿을 수 있는 만큼만)
function addPipe(st) {
  const gap = gapFor(st.score);
  const lo = MARGIN + gap / 2, hi = GROUND - MARGIN - gap / 2;
  const maxD = 120 + Math.min(30, st.score);
  let c = lo + st.rand() * (hi - lo);
  c = Math.max(st.lastGap - maxD, Math.min(st.lastGap + maxD, c));
  c = Math.max(lo, Math.min(hi, c));
  let amp = 0, ph = 0, om = 0;
  if (st.score >= MOVE_FROM && st.rand() < Math.min(0.6, 0.25 + (st.score - MOVE_FROM) * 0.02)) {
    amp = Math.min(42, 14 + (st.score - MOVE_FROM) * 1.6);
    amp = Math.min(amp, c - lo, hi - c);                      // 움직이는 범위가 천장·땅을 넘지 않게
    ph = st.rand() * 6.28; om = 1.6 + st.rand() * 0.8;
  }
  st.pipes.push({ x: st.nextX, c, gap, amp, ph, om, passed: false });
  st.lastGap = c;
  st.nextX += spacingFor(st.score) + PIPE_W;
}
const centerOf = (st, p) => p.c + (p.amp ? p.amp * Math.sin(p.ph + st.t * p.om) : 0);

// 누르기 시작: 첫 번째면 게임이 시작된다. 누르고 있는 동안 위로 올라간다
function press(st) {
  if (st.over) return false;
  if (st.state === 'ready') st.state = 'play';
  if (!st.hold) { st.hold = true; st.held = 0; st.flaps++; st.events.push('flap'); }
  return true;
}
// 뗌: 그때부터 떨어진다. 실제로 누르고 있었으면 true
function release(st) {
  if (!st.hold) return false;
  st.hold = false;
  st.events.push('release');
  return true;
}

// 원(병아리)과 사각형 충돌
function circleRect(cx, cy, r, x0, y0, x1, y1) {
  const nx = Math.max(x0, Math.min(cx, x1)), ny = Math.max(y0, Math.min(cy, y1));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

function step(st, dt) {
  if (st.over) return;
  st.t += dt;
  if (st.state === 'ready') { st.y = 250 + Math.sin(st.t * 4) * 8; return; }   // 시작 전에는 둥실둥실
  const spd = speedFor(st.score);
  st.dist += spd * dt;
  if (st.hold) st.held += dt;
  st.vy = Math.max(-VUP, Math.min(VMAX, st.vy + (GRAV - (st.hold ? LIFT : 0)) * dt));
  st.y += st.vy * dt;
  if (st.y - R < 0) { st.y = R; if (st.vy < 0) st.vy = 0; }
  for (const p of st.pipes) p.x -= spd * dt;
  st.nextX -= spd * dt;
  while (st.nextX < W + 80) addPipe(st);
  st.pipes = st.pipes.filter((p) => p.x + PIPE_W > -20);
  for (const p of st.pipes) {
    if (!p.passed && p.x + PIPE_W < BX - R) { p.passed = true; st.score++; st.events.push('score'); }
    if (p.x > BX + R + 4 || p.x + PIPE_W < BX - R - 4) continue;
    const c = centerOf(st, p), top = c - p.gap / 2, bot = c + p.gap / 2;
    if (circleRect(BX, st.y, R, p.x, -50, p.x + PIPE_W, top) || circleRect(BX, st.y, R, p.x, bot, p.x + PIPE_W, GROUND + 50)) return die(st, 'pipe');
  }
  if (st.y + R >= GROUND) { st.y = GROUND - R; return die(st, 'ground'); }
}
function die(st, why) { st.over = true; st.state = 'over'; st.why = why; st.events.push('die'); }

const medalOf = (score) => (score >= 40 ? 3 : score >= 25 ? 2 : score >= 10 ? 1 : 0);   // 0 없음 · 1 동 · 2 은 · 3 금

const LOGIC = { W, H, GROUND, BX, R, PIPE_W, GRAV, LIFT, VUP, VMAX, MARGIN, MOVE_FROM, speedFor, gapFor, spacingFor, newGame, press, release, step, centerOf, medalOf, addPipe };
return LOGIC;
})();
if (typeof module !== 'undefined') module.exports = LOGIC_CHICK;
