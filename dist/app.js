import { createWorld } from "./world.js?v=flock-separation-1";
import { createNeuronView } from "./neuron-view.js?v=2";
const $ = (id) => document.getElementById(id),
  canvas = $("game"),
  neuro = $("neural").getContext("2d");
const BASE_W = 1000,
  BASE_H = 660,
  obstacles = [
    { x: 330, y: 230, r: 48 },
    { x: 630, y: 400, r: 62 },
    { x: 790, y: 175, r: 40 },
    { x: 240, y: 510, r: 38 },
  ];
let bot = { x: 130, y: 330, a: 0 },
  foods = [],
  trail = [],
  ready = false,
  paused = false,
  busy = false,
  score = 0,
  energy = 100,
  elapsed = 0,
  simSpeed = 1,
  outputs = [0, 0, 0, 0],
  groups = [],
  last = 0,
  stepAt = 0,
  worker,
  wander = 0,
  stuckTime = 0,
  previousPosition = { x: 130, y: 330 },
  worldLevel = 0,
  targetStall = 0,
  lastTargetDistance = Infinity,
  escapeTimer = 0,
  saccadeTimer = 0,
  saccadeTurn = 0;
let companions = [], farmStage = 0;
let flyStyle = "default";
let ownedSkins;
try { ownedSkins = new Set(JSON.parse(localStorage.getItem("flycraft-owned-skins") || '["default"]')); }
catch { ownedSkins = new Set(["default"]); }
const neuronView = createNeuronView(index => worker?.postMessage({type:"inspect",index}));
$("sensors").innerHTML = [
  "먹이 · 왼쪽",
  "먹이 · 오른쪽",
  "위험 · 왼쪽",
  "위험 · 오른쪽",
]
  .map(
    (s, i) =>
      `<div class="sensor"><span>${s}</span><div class="track"><i id="bar${i}"></i></div><b id="val${i}">0</b></div>`,
  )
  .join("");
function arenaBounds(inset = 25) {
  const halfW = 475 + worldLevel * 160, halfH = 305 + worldLevel * 116;
  return { minX: BASE_W / 2 - halfW + inset, maxX: BASE_W / 2 + halfW - inset, minY: BASE_H / 2 - halfH + inset, maxY: BASE_H / 2 + halfH - inset };
}
function free(x, y) {
  const { minX, maxX, minY, maxY } = arenaBounds();
  return (
    x > minX && x < maxX && y > minY && y < maxY &&
    obstacles.every((o) => Math.hypot(x - o.x, y - o.y) > o.r + 38)
  );
}
function pathFree(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
  return obstacles.every(o => {
    const t = len2 ? Math.max(0, Math.min(1, ((o.x - x1) * dx + (o.y - y1) * dy) / len2)) : 0;
    return Math.hypot(x1 + dx * t - o.x, y1 + dy * t - o.y) > o.r + 38;
  });
}
function randomObstacle() {
  const r = 30 + Math.random() * 24;
  // 충돌 반경 38을 양쪽에 적용해도 통과할 수 있는 통로를 남긴다.
  const b = arenaBounds(r + 120);
  for (let i = 0; i < 1000; i++) {
    const x = b.minX + Math.random() * (b.maxX - b.minX);
    const y = b.minY + Math.random() * (b.maxY - b.minY);
    if ([bot,...companions].every(f=>Math.hypot(x-f.x,y-f.y)>r+110) &&
        obstacles.every(o=>Math.hypot(x-o.x,y-o.y)>o.r+r+116))
      return {x,y,r};
  }
  return null;
}
function addObstacle() {
  const o=randomObstacle();
  if(o) obstacles.push(o);
}
function randomizeObstacles(count = 4) {
  obstacles.splice(0, obstacles.length);
  for (let i = 0; i < count; i++) addObstacle();
}
function addFood(x, y) {
  if (foods.length >= 100 + worldLevel * 50) return;
  if (x === undefined) {
    const bounds = arenaBounds(35);
    const minX = bounds.minX, maxX = bounds.maxX, minY = bounds.minY, maxY = bounds.maxY;
    for (let i = 0; i < 100; i++) {
      x = minX + Math.random() * (maxX - minX);
      y = minY + Math.random() * (maxY - minY);
      if (free(x, y)) break;
    }
  }
  if (free(x, y)) foods.push({ x, y });
}
randomizeObstacles();
for (let i = 0; i < 9; i++) addFood();
setInterval(() => {
  if (ready && !paused) for (let i = 0; i < 1 + worldLevel; i++) addFood();
}, 10000);
let view;
try {
  view = createWorld(canvas, obstacles);
} catch (e) {
  queueMicrotask(() => fail("WebGL 3D 초기화 실패: " + e.message));
}
function draw() {
  view?.render(bot, foods, trail, elapsed, ready && !paused, companions);
  $("buy-fly").disabled = !ready || score < 500 || companions.length >= 4;
  $("buy-fly").textContent = companions.length >= 4 ? "초파리 최대 5마리" : "초파리 추가 (500)";
  $("next-farm").disabled = !ready || score < 5000 || farmStage === 1;
  $("flock-count").textContent = `초파리 ${companions.length + 1}마리 · ${farmStage ? "수확한 밀밭" : "초록 농장"}`;
  neuro.clearRect(0, 0, 320, 180);
  for (let i = 0; i < 63; i++) {
    const x = 22 + (i % 9) * 34,
      y = 18 + Math.floor(i / 9) * 24,
      v = Math.min(1, (groups[i] || 0) * 25);
    neuro.fillStyle = `rgba(187,249,105,${0.12 + v * 0.88})`;
    neuro.beginPath();
    neuro.arc(x, y, 3 + v * 4, 0, Math.PI * 2);
    neuro.fill();
  }
}
function sense() {
  let s = [0, 0, 0, 0];
  for (const f of foods) {
    let d = Math.hypot(f.x - bot.x, f.y - bot.y),
      a = Math.atan2(f.y - bot.y, f.x - bot.x) - bot.a;
    const strength = Math.exp(-d / 190);
    s[0] += strength * (0.5 - 0.45 * Math.sin(a));
    s[1] += strength * (0.5 + 0.45 * Math.sin(a));
  }
  for (let side = 0; side < 2; side++) {
    let a = bot.a + (side ? 1 : -1) * 0.55;
    for (let d = 15; d <= 130; d += 10) {
      if (!free(bot.x + Math.cos(a) * d, bot.y + Math.sin(a) * d)) {
        s[2 + side] = 1 - d / 145;
        break;
      }
    }
  }
  return s.map((x) => Math.min(1, x));
}
function turnToward(target, maxStep) {
  const delta = Math.atan2(Math.sin(target - bot.a), Math.cos(target - bot.a));
  bot.a += Math.max(-maxStep, Math.min(maxStep, delta));
}
// 한 자리에서 회전하거나 왕복하면 먹이 추적을 잠시 중지하고 빈 방향으로 직진한다.
function recoverMovement(f, dt) {
  f.motion ??= {x:f.x,y:f.y,time:0,remaining:0};
  const m=f.motion;
  if(m.remaining>0) {
    const x=f.x+Math.cos(m.angle)*50*dt, y=f.y+Math.sin(m.angle)*50*dt;
    if(free(x,y)&&pathFree(f.x,f.y,x,y)) {f.x=x;f.y=y;f.a=m.angle;}
    else m.remaining=0;
    m.remaining=Math.max(0,m.remaining-dt);
    m.x=f.x;m.y=f.y;m.time=0;
    return true;
  }
  m.time+=dt;
  if(Math.hypot(f.x-m.x,f.y-m.y)>18) {m.x=f.x;m.y=f.y;m.time=0;}
  if(m.time<1.5) return false;
  let best=0, angle=f.a;
  for(let i=0;i<48;i++) {
    const a=i*Math.PI*2/48;
    let distance=0;
    for(let d=4;d<=120;d+=4) {
      const x=f.x+Math.cos(a)*d,y=f.y+Math.sin(a)*d;
      if(!free(x,y)||!pathFree(f.x,f.y,x,y)) break;
      distance=d;
    }
    if(distance>best) {best=distance;angle=a;}
  }
  if(best>=4) {m.angle=angle;m.remaining=Math.min(1.8,best/50);f.a=angle;}
  m.time=0;
  return m.remaining>0;
}
function move(dt) {
  if(recoverMovement(bot,dt)) { elapsed+=dt; return; }
  const [fl, fr, dl, dr] = outputs;
  const beforeX = bot.x, beforeY = bot.y;
  // 초파리처럼 계속 직선으로 달리지 않고, 짧은 배회 구간과 방향 전환을 섞습니다.
  // 감각 입력은 주행 방향을 편향시키고, 무작위성은 완만하게 변해 자연스러운 탐색을 만듭니다.
  wander += (Math.random() - 0.5) * dt * 1.25;
  wander *= Math.exp(-1.1 * dt);
  wander = Math.max(-0.55, Math.min(0.55, wander));
  let turn = (fr - fl) * 3.1 + (dl - dr) * 3.6 + wander * 0.3;
  const nearest = foods.reduce((best, f) => {
    const d = Math.hypot(f.x - bot.x, f.y - bot.y);
    return !best || d < best.d ? { f, d } : best;
  }, null);
  // 냄새가 충분히 강할 때만 먹이 쪽으로 고개를 돌립니다(약한 자극에는 배회).
  let feedingApproach = false;
  if (nearest && nearest.d < 250) {
    const target = Math.atan2(nearest.f.y - bot.y, nearest.f.x - bot.x);
    let delta = Math.atan2(Math.sin(target - bot.a), Math.cos(target - bot.a));
    // 먹이 반경에서는 좌우 센서의 진동보다 목표 방향을 우선해 원을 그리며 도는 현상을 막습니다.
    feedingApproach = nearest.d < 72;
    if (feedingApproach) turn = delta * 1.55;
    else turn += Math.max(-1.2, Math.min(1.2, delta)) * Math.exp(-nearest.d / 180) * 1.05;
    if (nearest.d < lastTargetDistance - 0.35) targetStall = 0;
    else targetStall += dt;
    lastTargetDistance = nearest.d;
    if (targetStall > 2.2) {
      // 이동은 하지만 목표 거리만 줄지 않는 공전 상태를 탈출합니다.
      escapeTimer = 1.8;
      targetStall = 0;
    }
  }
  if (escapeTimer > 0) {
    escapeTimer -= dt;
    turn = (dl - dr) * 2.2 + wander * 0.9 + (Math.random() - 0.5) * 0.7;
  }
  // 실제 파리처럼 긴 원호 대신 짧은 직진 사이에 작고 빠른 방향 전환을 넣습니다.
  saccadeTimer -= dt;
  if (!feedingApproach && escapeTimer <= 0 && saccadeTimer <= 0) {
    saccadeTurn = (Math.random() - 0.5) * 0.72;
    saccadeTimer = 0.38 + Math.random() * 0.72;
  }
  if (saccadeTurn) {
    const step = Math.sign(saccadeTurn) * Math.min(Math.abs(saccadeTurn), dt * 5.8);
    bot.a += step;
    saccadeTurn -= step;
  }
  bot.a += Math.max(-2.35, Math.min(2.35, turn)) * dt;
  const speed = 34 + Math.min(42, (fl + fr) * 28),
    nx = bot.x + Math.cos(bot.a) * speed * dt,
    ny = bot.y + Math.sin(bot.a) * speed * dt;
  if (free(nx, ny) && pathFree(bot.x, bot.y, nx, ny)) {
    bot.x = nx;
    bot.y = ny;
    const moved = Math.hypot(bot.x - previousPosition.x, bot.y - previousPosition.y);
    stuckTime = moved < 0.08 ? stuckTime + dt : 0;
    previousPosition = { x: bot.x, y: bot.y };
  } else {
    energy -= dt * 4;
    const bounds = arenaBounds(42);
    // 경계에 비스듬히 붙으면 같은 벽을 계속 향할 수 있으므로 안쪽 법선으로 유도합니다.
    let escapeAngle;
    if (bot.x < bounds.minX) escapeAngle = 0;
    else if (bot.x > bounds.maxX) escapeAngle = Math.PI;
    else if (bot.y < bounds.minY) escapeAngle = Math.PI / 2;
    else if (bot.y > bounds.maxY) escapeAngle = -Math.PI / 2;
    else {
      const hit = obstacles.reduce((best, o) => {
        const distance = Math.hypot(bot.x - o.x, bot.y - o.y);
        return !best || distance < best.distance ? { o, distance } : best;
      }, null);
      escapeAngle = hit ? Math.atan2(bot.y - hit.o.y, bot.x - hit.o.x) : bot.a + (dl > dr ? -1 : 1) * 0.5;
    }
    // 각도 래핑을 고려한 최소 회전으로 충돌면에서 부드럽게 빠져나갑니다.
    turnToward(escapeAngle, Math.min(0.85, dt * 6.2));
    // 경계 접촉 시 아주 조금씩 안쪽으로 밀어 다음 충돌 판정을 탈출시킵니다.
    const inner = arenaBounds(30);
    bot.x = Math.max(inner.minX, Math.min(inner.maxX, bot.x));
    bot.y = Math.max(inner.minY, Math.min(inner.maxY, bot.y));
    stuckTime += dt;
  }
  // 무한 탐험 모드: 에너지는 경고용으로 내려가지만 18% 아래로 떨어지지 않는다.
  energy = Math.max(18, energy - dt * 0.55);
  elapsed += dt;
  for (let i = foods.length - 1; i >= 0; i--) {
    const food = foods[i], vx = bot.x - beforeX, vy = bot.y - beforeY;
    const length2 = vx * vx + vy * vy;
    const t = length2 ? Math.max(0, Math.min(1, ((food.x - beforeX) * vx + (food.y - beforeY) * vy) / length2)) : 0;
    const nearX = beforeX + vx * t, nearY = beforeY + vy * t;
    if (Math.hypot(food.x - nearX, food.y - nearY) < 36) {
      view?.collect(foods[i]);
      foods.splice(i, 1);
  score++;
      energy = Math.min(100, energy + 15);
      addFood();
    }
  }
  trail.push({ x: bot.x, y: bot.y });
  if (trail.length > 600) trail.shift();
  $("score").innerHTML =
    `${String(score).padStart(2, "0")} <small>/ ∞</small>`;
  $("energy").value = Math.max(0, energy);
  $("energy-text").textContent = Math.round(energy) + "% · 무한 탐험";
  $("time").textContent =
    `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;
}
function separateFlies(dt) {
  const flies=[bot,...companions];
  for(let i=0;i<flies.length;i++) for(let j=i+1;j<flies.length;j++) {
    const a=flies[i],b=flies[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d>=65) continue;
    const angle=d>0.001 ? Math.atan2(dy,dx) : (i*2.4+j*1.7);
    const step=Math.min((65-d)/2,90*dt);
    for(const [f,sign] of [[a,-1],[b,1]]) {
      // 장애물과 울타리를 통과하지 않는 방향으로만 분리한다.
      for(const offset of [0,.65,-.65,1.3,-1.3]) {
        const x=f.x+Math.cos(angle+offset)*step*sign,y=f.y+Math.sin(angle+offset)*step*sign;
        if(free(x,y)&&pathFree(f.x,f.y,x,y)) {f.x=x;f.y=y;break;}
      }
    }
  }
}
function moveCompanions(dt) {
  const claimed=new Set();
  const mainTarget=foods.reduce((a,b)=>!a||Math.hypot(b.x-bot.x,b.y-bot.y)<Math.hypot(a.x-bot.x,a.y-bot.y)?b:a,null);
  if(mainTarget) claimed.add(mainTarget);
  for (const fly of companions) {
    if(recoverMovement(fly,dt)) continue;
    const target = foods.filter(f=>!claimed.has(f)).reduce((a, b) => !a || Math.hypot(b.x-fly.x,b.y-fly.y) < Math.hypot(a.x-fly.x,a.y-fly.y) ? b : a, null);
    if(target) claimed.add(target);
    fly.target=target;
    if(!target) fly.a+=Math.sin(elapsed*.8+companions.indexOf(fly)*2.4)*dt;
    if (target && fly.escape <= 0) {
      const angle = Math.atan2(target.y-fly.y,target.x-fly.x);
      fly.a += Math.max(-dt*3, Math.min(dt*3, Math.atan2(Math.sin(angle-fly.a),Math.cos(angle-fly.a))));
    }
    fly.escape -= dt;
    const x = fly.x + Math.cos(fly.a)*55*dt, y = fly.y + Math.sin(fly.a)*55*dt;
    if (free(x,y) && pathFree(fly.x,fly.y,x,y)) { fly.x=x; fly.y=y; }
    else { fly.a += 1.2; fly.escape=.7; }
    const i = foods.findIndex(f => Math.hypot(f.x-fly.x,f.y-fly.y)<36);
    if (i>=0) { view?.collect(foods[i]); foods.splice(i,1); score++; addFood(); }
  }
}
function emptySpawn() {
  const b=arenaBounds(60);
  for(let i=0;i<1000;i++) {
    const x=b.minX+Math.random()*(b.maxX-b.minX), y=b.minY+Math.random()*(b.maxY-b.minY);
    if(free(x,y) && [bot,...companions].every(f=>Math.hypot(f.x-x,f.y-y)>80)) return {x,y,a:Math.random()*Math.PI*2,escape:0};
  }
  return null;
}
$("buy-fly").onclick=()=>{
  if(!ready || score<500 || companions.length>=4) return;
  const fly=emptySpawn(); if(!fly) return;
  score-=500; companions.push(fly);
};
$("next-farm").onclick=()=>{
  if(!ready || farmStage || score<5000) return;
  score-=5000; farmStage=1; trail=[];
  view?.setFarm(1,worldLevel);
  $("next-farm").textContent="수확한 밀밭 도착";
};
function frame(t) {
  const dt = Math.min(0.04, (t - last) / 1000 || 0);
  last = t;
  if (ready && !paused) {
    move(dt * simSpeed);
    moveCompanions(dt * simSpeed);
    separateFlies(dt * simSpeed);
    if (!busy && t - stepAt > 100) {
      busy = true;
      stepAt = t;
      const s = sense();
      s.forEach((v, i) => {
        $("bar" + i).style.width = v * 100 + "%";
        $("val" + i).textContent = Math.round(v * 100);
      });
      worker.postMessage({ type: "step", input: s });
    }
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
let pointerStart = null;
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || !e.isPrimary) {
    pointerStart = null;
    return;
  }
  pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
canvas.addEventListener("pointerup", (e) => {
  if (!ready || !pointerStart || pointerStart.id !== e.pointerId) return;
  const distance = Math.hypot(
    e.clientX - pointerStart.x,
    e.clientY - pointerStart.y,
  );
  pointerStart = null;
  if (distance > 6) return;
  const point = view?.pick(e.clientX, e.clientY);
  if (point) addFood(point.x, point.y);
});
canvas.addEventListener("pointercancel", () => {
  pointerStart = null;
});
$("camera-home").onclick = () => view?.home();
$("camera-top").onclick = () => view?.home(true);
$("first-person").onclick = () => view?.firstPerson();
$("follow").onclick = () => view?.follow();
document.addEventListener("world-error", (e) => fail(e.detail));
canvas.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (ready) $("pause").click();
  }
});
$("food").onclick = () => addFood();
$("pause").onclick = () => {
  paused = !paused;
  $("pause").textContent = paused ? "계속하기" : "일시 정지";
    $("status").textContent = paused ? "일시 정지" : "신경망이 플레이 중 · 무한 탐험";
};
$("speed").onclick = () => {
  simSpeed = simSpeed === 1 ? 2 : simSpeed === 2 ? 4 : 1;
  $("speed").textContent = `속도 ${simSpeed}×`;
};
$("customize").onclick = () => {
  const selectedStyle = $("fly-skin").value;
  if (selectedStyle === flyStyle) return;
  if (!ownedSkins.has(selectedStyle)) {
    if (score < 100) return;
    score -= 100;
    ownedSkins.add(selectedStyle);
    localStorage.setItem("flycraft-owned-skins", JSON.stringify([...ownedSkins]));
  }
  flyStyle = selectedStyle;
  view?.customize(flyStyle);
  $("customize").textContent = "적용됨";
};
$("fly-skin").onchange = () => {
  const style = $("fly-skin").value;
  view?.customize(style);
  $("customize").textContent = style === flyStyle ? "적용됨" : ownedSkins.has(style) ? "무료로 적용" : "구매 (100)";
};
$("expand-farm").onclick = () => {
  if (score < 100 || worldLevel >= 3) return;
  score -= 100;
  worldLevel += 1;
  // 면적 증가에 맞춰 단계당 장애물을 5개 추가한다.
  for (let i = 0; i < 5; i++) addObstacle();
  view?.setExpansion(worldLevel);
  for (let i = 0; i < 15 * worldLevel; i++) addFood();
  $("expand-farm").textContent = worldLevel >= 3 ? "농장 최대 단계" : "농장 확장 (100)";
};
$("reset").onclick = () => {
  bot = { x: 130, y: 330, a: 0 };
  worldLevel = 0; companions = []; farmStage = 0;
  $("next-farm").textContent="다음 농장 · 수확한 밀밭 (5,000)";
  randomizeObstacles();
  view?.setFarm(0,0);
  foods = [];
  for (let i = 0; i < 9; i++) addFood();
  trail = [];
  score = 0;
  energy = 100;
  elapsed = 0;
  simSpeed = 1;
  outputs = [0, 0, 0, 0];
  wander = 0;
  stuckTime = 0;
  previousPosition = { x: 130, y: 330 };
  worldLevel = 0;
  targetStall = 0;
  lastTargetDistance = Infinity;
  escapeTimer = 0;
  saccadeTimer = 0;
  saccadeTurn = 0;
  view?.setExpansion(0);
  paused = false;
  worker.postMessage({ type: "reset" });
  neuronView.reset();
  $("pause").disabled = false;
  $("pause").textContent = "일시 정지";
  $("speed").textContent = "속도 1×";
  $("expand-farm").textContent = "농장 확장 (100)";
  $("status").textContent = "신경망이 플레이 중 · 무한 탐험";
};
$("loading").hidden = true;
$("status").textContent = "연결망 다운로드 중 · 12.4 MB";
async function boot() {
  try {
    const response = await fetch("connectome.bin.gz");
    if (!response.ok) throw new Error("연결망 다운로드 실패");
    const buffer = await response.arrayBuffer();
    worker = new Worker("brain.js?v=neuron-view-1", { type: "module" });
    worker.onerror = (e) => fail(e.message);
    worker.onmessage = ({ data: d }) => {
      if (d.type === "ready") {
        neuronView.setMeta(d);
        ready = true;
        $("nodes").textContent = d.nodes.toLocaleString();
        $("edges").textContent = d.edges.toLocaleString();
        $("status").textContent = "신경망이 플레이 중 · 무한 탐험";
        for (const id of ["food", "pause", "reset", "speed", "customize", "expand-farm", "fly-skin"]) $(id).disabled = false;
      } else if (d.type === "step") {
        neuronView.update(d.neuronState);
        busy = false;
        outputs = d.output;
        groups = d.groups;
        $("latency").textContent = d.ms.toFixed(1) + " ms";
      } else if (d.type === "inspect") neuronView.showLinks(d);
      else if (d.type === "progress") $("status").textContent = d.message;
      else if (d.type === "error") fail(d.message);
    };
    worker.postMessage({ type: "init", buffer }, [buffer]);
  } catch (e) {
    fail(e.message);
  }
}
function fail(message) {
  ready = false;
  paused = true;
  $("status").textContent = "연결망 실행 실패";
  $("loading").hidden = false;
  $("load-title").textContent = "연결망을 실행하지 못했습니다";
  $("load-note").textContent =
    message + " · 페이지를 새로고침해 다시 시도하세요.";
  $("loading").querySelector("progress").hidden = true;
  for (const id of ["food", "pause", "reset", "speed", "customize", "expand-farm", "fly-skin"]) $(id).disabled = true;
}
if (view) boot();
// 화면과 같은 상태를 사용하는 선택적 WebMCP 인터페이스.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  const tools = [
    {
      name: "read_game_state",
      title: "게임 상태 읽기",
      description: "현재 점수, 에너지, 봇 위치와 먹이 개수를 읽습니다.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute() {
        return {
          ready,
          paused,
          score,
          energy,
          elapsed,
          bot: { ...bot },
          foodCount: foods.length,
        };
      },
    },
    {
      name: "place_food",
      title: "먹이 놓기",
      description:
        "경기장 좌표에 먹이를 추가합니다. 벽이나 장애물 위는 실패합니다.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", minimum: 25, maximum: 975 },
          y: { type: "number", minimum: 25, maximum: 635 },
        },
        required: ["x", "y"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute(input) {
        if (!ready) throw new Error("연결망 준비 중");
        if (
          !input ||
          !Number.isFinite(input.x) ||
          !Number.isFinite(input.y) ||
          !free(input.x, input.y)
        )
          throw new Error("빈 경기장 좌표가 필요합니다");
        if (foods.length >= 100 + worldLevel * 50) throw new Error(`먹이는 현재 최대 ${100 + worldLevel * 50}개입니다`);
        addFood(input.x, input.y);
        draw();
        return { foodCount: foods.length };
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(
        document.modelContext.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* 미지원 브라우저에서는 게임만 제공한다. */
    }
  }
}
