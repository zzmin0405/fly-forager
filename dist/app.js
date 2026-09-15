import { createWorld } from "./world.js?v=chase-fix-2";
import { createNeuronView } from "./neuron-view.js?v=2";
const $ = (id) => document.getElementById(id),
  canvas = $("game"),
  neuro = $("neural").getContext("2d");
const W = 1000,
  H = 660,
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
  escapeTimer = 0;
let flyStyle = 0;
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
function free(x, y) {
  return (
    x > 25 &&
    x < W - 25 &&
    y > 25 &&
    y < H - 25 &&
    obstacles.every((o) => Math.hypot(x - o.x, y - o.y) > o.r + 22)
  );
}
function addFood(x, y) {
  if (foods.length >= 100) return;
  if (x === undefined) {
    for (let i = 0; i < 100; i++) {
      x = 35 + Math.random() * (W - 70);
      y = 35 + Math.random() * (H - 70);
      if (free(x, y)) break;
    }
  }
  if (free(x, y)) foods.push({ x, y });
}
for (let i = 0; i < 9; i++) addFood();
setInterval(() => {
  if (ready && !paused && foods.length < 100) addFood();
}, 10000);
let view;
try {
  view = createWorld(canvas, obstacles);
} catch (e) {
  queueMicrotask(() => fail("WebGL 3D 초기화 실패: " + e.message));
}
function draw() {
  view?.render(bot, foods, trail, elapsed, ready && !paused);
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
function move(dt) {
  const [fl, fr, dl, dr] = outputs;
  const beforeX = bot.x, beforeY = bot.y;
  // 초파리처럼 계속 직선으로 달리지 않고, 짧은 배회 구간과 방향 전환을 섞습니다.
  // 감각 입력은 주행 방향을 편향시키고, 무작위성은 완만하게 변해 자연스러운 탐색을 만듭니다.
  wander += (Math.random() - 0.5) * dt * 1.8;
  wander = Math.max(-0.8, Math.min(0.8, wander));
  let turn = (fr - fl) * 3.4 + (dl - dr) * 3.8 + wander * 0.45;
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
    if (feedingApproach) turn = delta * 0.82;
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
  bot.a += Math.max(-1.25, Math.min(1.25, turn)) * dt;
  const speed = 34 + Math.min(42, (fl + fr) * 28),
    nx = bot.x + Math.cos(bot.a) * speed * dt,
    ny = bot.y + Math.sin(bot.a) * speed * dt;
  if (free(nx, ny)) {
    bot.x = nx;
    bot.y = ny;
    const moved = Math.hypot(bot.x - previousPosition.x, bot.y - previousPosition.y);
    stuckTime = moved < 0.08 ? stuckTime + dt : 0;
    previousPosition = { x: bot.x, y: bot.y };
  } else {
    energy -= dt * 4;
    // 경계에 비스듬히 붙으면 같은 벽을 계속 향할 수 있으므로 안쪽 법선으로 유도합니다.
    let escapeAngle;
    if (bot.x < 42) escapeAngle = 0;
    else if (bot.x > W - 42) escapeAngle = Math.PI;
    else if (bot.y < 42) escapeAngle = Math.PI / 2;
    else if (bot.y > H - 42) escapeAngle = -Math.PI / 2;
    else {
      const hit = obstacles.reduce((best, o) => {
        const distance = Math.hypot(bot.x - o.x, bot.y - o.y);
        return !best || distance < best.distance ? { o, distance } : best;
      }, null);
      escapeAngle = hit ? Math.atan2(bot.y - hit.o.y, bot.x - hit.o.x) : bot.a + (dl > dr ? -1 : 1) * 0.5;
    }
    // 각도 래핑을 고려한 최소 회전으로 충돌면에서 부드럽게 빠져나갑니다.
    turnToward(escapeAngle, Math.min(1.1, dt * 4.2));
    // 경계 접촉 시 아주 조금씩 안쪽으로 밀어 다음 충돌 판정을 탈출시킵니다.
    if (bot.x < 30) bot.x = 30;
    if (bot.x > W - 30) bot.x = W - 30;
    if (bot.y < 30) bot.y = 30;
    if (bot.y > H - 30) bot.y = H - 30;
    stuckTime += dt;
  }
  if (stuckTime > 1.2) {
    bot.a += (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.2);
    stuckTime = 0;
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
      const nextLevel = Math.min(3, Math.floor(score / 100));
      if (nextLevel !== worldLevel) {
        worldLevel = nextLevel;
        view?.setExpansion(worldLevel);
      }
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
function frame(t) {
  const dt = Math.min(0.04, (t - last) / 1000 || 0);
  last = t;
  if (ready && !paused) {
    move(dt * simSpeed);
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
  if (score < 100) return;
  score -= 100;
  flyStyle = Math.min(3, flyStyle + 1);
  view?.customize(flyStyle);
  $("customize").textContent = flyStyle >= 3 ? "외형 최대 단계" : `외형 변경 (${100})`;
};
$("expand-farm").onclick = () => {
  if (score < 100 || worldLevel >= 3) return;
  score -= 100;
  worldLevel += 1;
  view?.setExpansion(worldLevel);
  $("expand-farm").textContent = worldLevel >= 3 ? "농장 최대 단계" : "농장 확장 (100)";
};
$("reset").onclick = () => {
  bot = { x: 130, y: 330, a: 0 };
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
  flyStyle = 0;
  view?.setExpansion(0);
  view?.customize(0);
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
        for (const id of ["food", "pause", "reset", "speed", "customize", "expand-farm"]) $(id).disabled = false;
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
  for (const id of ["food", "pause", "reset", "speed", "customize", "expand-farm"]) $(id).disabled = true;
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
        if (foods.length >= 24) throw new Error("먹이는 최대 24개입니다");
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
