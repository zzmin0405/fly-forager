import { createWorld } from "./world.js";
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
  outputs = [0, 0, 0, 0],
  groups = [],
  last = 0,
  stepAt = 0,
  worker;
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
  if (foods.length >= 24) return;
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
function move(dt) {
  const [fl, fr, dl, dr] = outputs;
  let turn = (fr - fl) * 6 + (dl - dr) * 5 + 0.32 * Math.max(0, 1 - fl - fr);
  bot.a += Math.max(-2.8, Math.min(2.8, turn)) * dt;
  const speed = 40 + Math.min(45, (fl + fr) * 30),
    nx = bot.x + Math.cos(bot.a) * speed * dt,
    ny = bot.y + Math.sin(bot.a) * speed * dt;
  if (free(nx, ny)) {
    bot.x = nx;
    bot.y = ny;
  } else {
    energy -= dt * 4;
    bot.a += dt * 2.8;
  }
  energy -= dt * 0.55;
  elapsed += dt;
  for (let i = foods.length - 1; i >= 0; i--)
    if (Math.hypot(foods[i].x - bot.x, foods[i].y - bot.y) < 21) {
      view?.collect(foods[i]);
      foods.splice(i, 1);
      score++;
      energy = Math.min(100, energy + 15);
      addFood();
    }
  trail.push({ x: bot.x, y: bot.y });
  if (trail.length > 600) trail.shift();
  if (energy <= 0 || score >= 12) {
    paused = true;
    $("status").textContent =
      score >= 12 ? "목표 달성 · 12개 수집!" : "게임 종료 · 에너지 소진";
    $("pause").disabled = true;
  }
  $("score").innerHTML =
    `${String(score).padStart(2, "0")} <small>/ 12</small>`;
  $("energy").value = Math.max(0, energy);
  $("energy-text").textContent = Math.max(0, Math.round(energy)) + "%";
  $("time").textContent =
    `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;
}
function frame(t) {
  const dt = Math.min(0.04, (t - last) / 1000 || 0);
  last = t;
  if (ready && !paused) {
    move(dt);
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
  $("status").textContent = paused ? "일시 정지" : "신경망이 플레이 중";
};
$("reset").onclick = () => {
  bot = { x: 130, y: 330, a: 0 };
  foods = [];
  for (let i = 0; i < 9; i++) addFood();
  trail = [];
  score = 0;
  energy = 100;
  elapsed = 0;
  outputs = [0, 0, 0, 0];
  paused = false;
  worker.postMessage({ type: "reset" });
  $("pause").disabled = false;
  $("pause").textContent = "일시 정지";
  $("status").textContent = "신경망이 플레이 중";
};
$("loading").hidden = true;
$("status").textContent = "연결망 다운로드 중 · 12.4 MB";
async function boot() {
  try {
    const response = await fetch("connectome.bin.gz");
    if (!response.ok) throw new Error("연결망 다운로드 실패");
    const buffer = await response.arrayBuffer();
    worker = new Worker("brain.js", { type: "module" });
    worker.onerror = (e) => fail(e.message);
    worker.onmessage = ({ data: d }) => {
      if (d.type === "ready") {
        ready = true;
        $("nodes").textContent = d.nodes.toLocaleString();
        $("edges").textContent = d.edges.toLocaleString();
        $("status").textContent = "신경망이 플레이 중";
        for (const id of ["food", "pause", "reset"]) $(id).disabled = false;
      } else if (d.type === "step") {
        busy = false;
        outputs = d.output;
        groups = d.groups;
        $("latency").textContent = d.ms.toFixed(1) + " ms";
      } else if (d.type === "progress") $("status").textContent = d.message;
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
  for (const id of ["food", "pause", "reset"]) $(id).disabled = true;
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
