'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 푸드덕 병아리: 화면·입력·소리. 규칙은 logic.js
const L = LOGIC_CHICK;
const { W, H, GROUND, BX, R, PIPE_W } = L;
const $ = (id) => document.getElementById(id);
const INK = '#2b1d52';

// ---------- 캔버스 ----------
const canvas = $('game');
const ctx = canvas.getContext('2d');
function fit() {
  const hudH = 52;
  const scale = Math.min((innerWidth - 16) / W, (innerHeight - 16 - hudH) / H, 1.5);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  $('col').style.width = cssW + 'px';
}
addEventListener('resize', fit);

// ---------- 저장소 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let best = Number(store.get('chickBest')) || 0;

// ---------- 소리 ----------
let audio = null;
let muted = store.get('chickMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.09, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  flap: () => tone(420, 0.08, 'triangle', 0.07, 260),
  score: () => seq([784, 1047], 60, 'triangle', 0.09),
  die: () => { tone(300, 0.25, 'sawtooth', 0.08, -220); },
  medal: () => seq([523, 659, 784, 1047], 90, 'triangle', 0.1),
};
function toggleMute() { muted = !muted; store.set('chickMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 상태 ----------
let st = L.newGame(20241019);
let mode = 'title';                  // title | play(ready 포함) | paused | over
let overAt = 0;                      // 끝난 시각: 직후의 연타로 바로 다시 시작되지 않게
let particles = [];
let shake = 0, flash = 0, uiT = 0, wing = 0, tilt = 0, groundX = 0, newBest = false;
const clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 90, y: 40 + (i * 53) % 190, s: 0.7 + (i % 3) * 0.35 }));

function updateHud() { $('score').textContent = st.score; $('best').textContent = best; }

function burst(x, y, color, n, sp = 120) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, v = sp * (0.3 + Math.random());
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.5 + Math.random() * 0.4, t: 0, r: 2 + Math.random() * 3, color });
  }
}

function startGame() {
  st = L.newGame((Math.random() * 2 ** 31) | 0);
  holds.clear();
  mode = 'play'; newBest = false; particles = []; tilt = 0;
  $('overlay').classList.add('hidden');
  updateHud();
}

// ---------- 입력: 누르고 있으면 올라가고, 떼면 떨어진다 ----------
const holds = new Set();             // 지금 누르고 있는 것들 (손가락 번호·키). 하나라도 있으면 올라간다
let flapAcc = 0, holdSignaled = false;
function syncHold() {
  const want = holds.size > 0 && mode === 'play';
  if (want && !st.hold) {
    if (L.press(st)) { holdSignaled = false; flapAcc = 0; wing = 1; sfx.flap(); burst(BX - 8, st.y + 8, 'rgba(255,255,255,.9)', 3, 60); }
  } else if (!want && st.hold) {
    L.release(st);
    if (holdSignaled) tutorialSignal('release');                 // 꾹 눌렀다가 뗐다
  }
}
function clearHolds() { holds.clear(); syncHold(); }
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  holds.add('p' + e.pointerId); syncHold();
});
const pointerUp = (e) => { holds.delete('p' + e.pointerId); syncHold(); };
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);
canvas.addEventListener('lostpointercapture', pointerUp);
const isFlapKey = (code) => code === 'Space' || code === 'ArrowUp' || code === 'KeyW';
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (isFlapKey(e.code)) {
    e.preventDefault();
    if (mode === 'over') { if (performance.now() - overAt > 600 && !$('overlay').classList.contains('hidden')) startGame(); return; }
    if (mode === 'title') { startGame(); return; }
    holds.add(e.code); syncHold();
  } else if (e.code === 'KeyP' || e.code === 'Escape') { mode === 'paused' ? resume() : pause(); }
  else if (e.code === 'KeyM') toggleMute();
});
addEventListener('keyup', (e) => { if (isFlapKey(e.code)) { holds.delete(e.code); syncHold(); } });

// ---------- 일시정지 ----------
let prevMode = 'play';
function pause() {
  if (mode !== 'play' || st.state !== 'play') return;
  clearHolds();
  mode = 'paused'; prevMode = 'play';
  $('overlay').innerHTML = `<h2>일시정지</h2><div class="col"><button id="resumeBtn">계속하기</button></div>`;
  $('overlay').classList.remove('hidden');
  $('resumeBtn').onclick = resume;
  $('pauseBtn').textContent = '▶';
}
function resume() {
  if (mode !== 'paused') return;
  mode = 'play'; $('overlay').classList.add('hidden'); $('pauseBtn').textContent = '⏸';
}
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); mode === 'paused' ? resume() : pause(); };
addEventListener('blur', () => { clearHolds(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearHolds(); pause(); } });

// ---------- 화면 ----------
const MEDALS = [null, ['동메달', '#d98a4a'], ['은메달', '#c5ccd6'], ['금메달', '#ffd23f']];
function showTitle() {
  mode = 'title';
  $('overlay').innerHTML = `
    <h1>푸드덕<br>병아리</h1>
    <p>화면을 <b>꾹 누르고</b> 있으면 위로 올라가고<br><b>떼면</b> 내려가요<br>사탕 기둥 사이 <b>틈</b>으로 쏙 지나가요</p>
    <div class="col"><button id="startBtn">시작하기</button></div>
    <p style="font-size:12px;opacity:.85">PC: 스페이스 · ↑ &nbsp; P 일시정지 · M 소리</p>`;
  $('overlay').classList.remove('hidden');
  $('startBtn').onclick = (e) => { e.currentTarget.blur(); startGame(); };
}
function showOver() {
  const med = L.medalOf(st.score);
  const rec = st.score > best;
  if (rec) { best = st.score; store.set('chickBest', String(best)); newBest = true; }
  updateHud();
  const m = MEDALS[med];
  $('overlay').innerHTML = `
    <h2>앗, 부딪혔어요!</h2>
    <div class="big">${st.score}</div>
    ${rec && st.score > 0 ? '<span class="tag">최고 기록!</span>' : ''}
    ${m ? `<p><span class="tag" style="background:${m[1]};color:${INK}">🏅 ${m[0]}</span></p>` : '<p>10점을 넘으면 메달을 받아요</p>'}
    <p>최고 <b>${best}</b></p>
    <div class="col"><button id="againBtn">다시 하기</button></div>`;
  $('overlay').classList.remove('hidden');
  $('againBtn').onclick = (e) => { e.currentTarget.blur(); startGame(); };
  if (med) setTimeout(sfx.medal, 250);
}

// ---------- 그리기 ----------
const SKY = ['#8fd3ff', '#cdeeff'];
function drawBackground(dt, moving, spd) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, SKY[0]); g.addColorStop(1, SKY[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 먼 언덕
  ctx.fillStyle = '#ffd6ea';
  ctx.beginPath(); ctx.moveTo(0, GROUND);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, GROUND - 46 - 22 * Math.sin((x + groundX * 0.2) / 55));
  ctx.lineTo(W, GROUND); ctx.closePath(); ctx.fill();
  for (const c of clouds) {
    if (moving) { c.x -= spd * 0.12 * dt; if (c.x < -80) c.x = W + 60; }
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(c.x, c.y, 20 * c.s, 0, 7); ctx.arc(c.x + 22 * c.s, c.y + 4, 16 * c.s, 0, 7); ctx.arc(c.x - 22 * c.s, c.y + 5, 15 * c.s, 0, 7); ctx.fill();
  }
}
function drawGround() {
  ctx.fillStyle = '#e0a45a'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#c98a3e'; for (let i = 0; i < 12; i++) { const x = ((i * 53 - groundX) % (W + 60) + W + 60) % (W + 60) - 20; ctx.fillRect(x, GROUND + 38 + (i % 3) * 14, 6, 4); }
  ctx.fillStyle = '#fff'; ctx.fillRect(0, GROUND, W, 10);           // 크림 윗면
  ctx.fillStyle = '#ffb3d9';
  for (let x = -((groundX) % 36); x < W; x += 36) { ctx.beginPath(); ctx.arc(x + 18, GROUND + 10, 9, 0, Math.PI); ctx.fill(); }
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
}
function drawPipe(x, c, gap) {
  const top = c - gap / 2, bot = c + gap / 2;
  const body = (y0, y1) => {
    const g = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
    g.addColorStop(0, '#ff8fbd'); g.addColorStop(0.45, '#fff'); g.addColorStop(1, '#ff6fa8');
    ctx.fillStyle = g; ctx.fillRect(x + 4, y0, PIPE_W - 8, y1 - y0);
    ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.strokeRect(x + 4, y0, PIPE_W - 8, y1 - y0);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y0, PIPE_W - 8, y1 - y0); ctx.clip();       // 사탕 줄무늬
    ctx.strokeStyle = 'rgba(255,95,162,.55)'; ctx.lineWidth = 9;
    for (let k = -200; k < 700; k += 34) { ctx.beginPath(); ctx.moveTo(x - 10, k); ctx.lineTo(x + PIPE_W + 10, k + 40); ctx.stroke(); }
    ctx.restore();
  };
  body(-10, top - 20); body(bot + 20, GROUND + 4);
  const cap = (y) => {
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.roundRect(x - 2, y, PIPE_W + 4, 20, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(x + 6, y + 4, 8, 11);
  };
  cap(top - 20); cap(bot);
}
function drawChick(x, y, dt) {
  wing = Math.max(0, wing - dt * 5);
  const target = Math.max(-0.5, Math.min(1.1, st.vy / 520));
  tilt += (target - tilt) * Math.min(1, dt * 10);
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt * 0.8);
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fillStyle = '#ffe14d'; ctx.fill(); ctx.stroke();       // 몸
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-6, -8, 4, 6, 0.6, 0, 7); ctx.fill();
  // 부리
  ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(13, -2); ctx.lineTo(25, 2); ctx.lineTo(13, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  // 눈
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -6, 5.5, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(8, -6, 2.4, 0, 7); ctx.fill();
  // 볼
  ctx.fillStyle = 'rgba(255,95,162,.5)'; ctx.beginPath(); ctx.arc(4, 6, 4, 0, 7); ctx.fill();
  // 날개: 푸드덕할 때 위로 올라간다
  ctx.save(); ctx.translate(-6, 3); ctx.rotate(-0.2 - wing * 1.1 + Math.sin(uiT * 14) * 0.08);
  ctx.fillStyle = '#ffc928'; ctx.beginPath(); ctx.ellipse(-4, 0, 11, 6.5, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
  // 머리 깃
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2, -16); ctx.quadraticCurveTo(-4, -26, 3, -24); ctx.moveTo(2, -16); ctx.quadraticCurveTo(6, -24, 11, -20); ctx.stroke();
  ctx.restore();
}
function drawParticles(dt) {
  for (const p of particles) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt;
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  particles = particles.filter((p) => p.t < p.life);
}
function drawScoreBig() {
  if (mode === 'title') return;
  ctx.font = '56px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.strokeText(st.score, W / 2, 96);
  ctx.fillStyle = '#fff'; ctx.fillText(st.score, W / 2, 96);
}
function drawReady() {
  if (st.state !== 'ready' || mode !== 'play') return;
  const a = 0.75 + 0.25 * Math.sin(uiT * 5);
  ctx.globalAlpha = a; ctx.font = '26px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  ctx.strokeText('꾹 눌러서 시작!', W / 2, 360); ctx.fillStyle = '#fff'; ctx.fillText('꾹 눌러서 시작!', W / 2, 360);
  ctx.globalAlpha = 1;
}

function drawScene(dt) {
  const moving = mode === 'play' && st.state === 'play';
  const spd = L.speedFor(st.score);
  if (moving) groundX += spd * dt;
  ctx.save();
  if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake * 20, (Math.random() - 0.5) * shake * 20); shake = Math.max(0, shake - dt * 3); }
  drawBackground(dt, moving || mode === 'title', spd);
  for (const p of st.pipes) drawPipe(p.x, L.centerOf(st, p), p.gap);
  drawGround();
  drawChick(BX, st.y, dt);
  drawParticles(dt);
  drawScoreBig();
  drawReady();
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 3); }
  ctx.restore();
}

// ---------- 루프 ----------
let last = 0;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016); last = now; uiT += dt;
  if (mode === 'play') {
    // 고정 간격으로 나눠 갱신 (프레임이 느려도 충돌을 놓치지 않게)
    let left = dt;
    while (left > 0 && !st.over) { const d = Math.min(1 / 120, left); L.step(st, d); left -= d; }
    if (st.hold) {
      flapAcc += dt;
      if (flapAcc > 0.16) { flapAcc = 0; wing = 1; sfx.flap(); burst(BX - 8, st.y + 8, 'rgba(255,255,255,.9)', 2, 50); }   // 누르고 있는 동안 계속 푸드덕
      if (!holdSignaled && st.held >= 0.35) { holdSignaled = true; tutorialSignal('hold'); }                                 // 튜토리얼: 꾹 눌렀다
    }
    for (const e of st.events) {
      if (e === 'score') { sfx.score(); updateHud(); }
      else if (e === 'die') {
        sfx.die(); shake = 0.5; flash = 0.5; burst(BX, st.y, '#ffe14d', 16, 200);
        mode = 'over'; overAt = performance.now(); holds.clear();
        setTimeout(showOver, 500);
      }
    }
    st.events.length = 0;
  } else if (mode === 'title') { L.step(st, dt); }
  drawScene(dt);
  requestAnimationFrame(frame);
}

updateHud();
showTitle();
fit();
requestAnimationFrame(frame);
