// FlyWire 그래프를 그대로 통과시키는 게임용 3단계 rate 모델.
// 감각 채널 배치와 반응 템플릿 디코더는 인공 매핑이며 생물학적 운동 회로가 아니다.
let n = 0,
  m = 0,
  pre,
  post,
  weight,
  region,
  group,
  channels,
  templates,
  inverse,
  sizes;
function forward(input) {
  let state = new Float32Array(n),
    next = new Float32Array(n),
    drive = new Float32Array(n);
  for (let i = 0; i < n; i++)
    if (channels[i] >= 0) drive[i] = 0.3 * input[channels[i]];
  state.set(drive);
  for (let k = 0; k < 3; k++) {
    next.set(drive);
    for (let e = 0; e < m; e++)
      next[post[e]] += 0.85 * weight[e] * state[pre[e]];
    for (let i = 0; i < n; i++) next[i] = Math.tanh(next[i]);
    [state, next] = [next, state];
  }
  return state;
}
function invert(a) {
  let rows = a.map((r, i) => [
    ...r,
    ...Array.from({ length: 4 }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let i = 0; i < 4; i++) {
    let best = i;
    for (let j = i + 1; j < 4; j++)
      if (Math.abs(rows[j][i]) > Math.abs(rows[best][i])) best = j;
    [rows[i], rows[best]] = [rows[best], rows[i]];
    const div = rows[i][i];
    if (Math.abs(div) < 1e-15) throw new Error("출력 보정 행렬이 특이합니다");
    for (let j = 0; j < 8; j++) rows[i][j] /= div;
    for (let k = 0; k < 4; k++)
      if (k !== i) {
        const v = rows[k][i];
        for (let j = 0; j < 8; j++) rows[k][j] -= v * rows[i][j];
      }
  }
  return rows.map((r) => r.slice(4));
}
async function initialize(buffer) {
  self.postMessage({ type: "progress", message: "연결망 압축 해제 중" });
  if (new Uint8Array(buffer)[0] === 31)
    buffer = await new Response(
      new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
  const v = new DataView(buffer);
  n = v.getUint32(0, true);
  m = v.getUint32(4, true);
  if (n !== 139255 || m !== 2698236 || buffer.byteLength !== 8 + m * 12 + n * 3)
    throw new Error("연결 데이터 형식 불일치");
  pre = new Uint32Array(m);
  post = new Uint32Array(m);
  weight = new Float32Array(m);
  region = new Uint8Array(n);
  group = new Uint16Array(n);
  channels = new Int8Array(n).fill(-1);
  sizes = new Uint32Array(63);
  let sums = new Float64Array(n);
  for (let e = 0; e < m; e++) {
    const b = 8 + e * 12;
    pre[e] = v.getUint32(b, true);
    post[e] = v.getUint32(b + 4, true);
    weight[e] = v.getFloat32(b + 8, true);
    if (pre[e] >= n || post[e] >= n || !Number.isFinite(weight[e]))
      throw new Error("잘못된 연결");
    sums[post[e]] += Math.abs(weight[e]);
  }
  for (let e = 0; e < m; e++) weight[e] /= Math.max(1, sums[post[e]]);
  const base = 8 + m * 12;
  let sensor = 0;
  for (let i = 0; i < n; i++) {
    region[i] = v.getUint8(base + i * 3);
    group[i] = v.getUint16(base + i * 3 + 1, true);
    if (group[i] >= 63) throw new Error("잘못된 집단");
    sizes[group[i]]++;
    if (region[i] === 0 && i % 13 === 0) channels[i] = sensor++ % 4;
  }
  self.postMessage({
    type: "progress",
    message: "실제 연결망의 감각 반응 보정 중",
  });
  templates = [];
  for (let c = 0; c < 4; c++) {
    const input = [0, 0, 0, 0];
    input[c] = 1;
    templates.push(forward(input));
  }
  const gram = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < n; i++)
    if (channels[i] < 0)
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 4; b++)
          gram[a][b] += templates[a][i] * templates[b][i];
  for (let a = 0; a < 4; a++) gram[a][a] += 1e-5;
  inverse = invert(gram);
  self.postMessage({ type: "ready", nodes: n, edges: m, neuronGroups: group, channels });
}
self.onmessage = async ({ data: d }) => {
  try {
    if (d.type === "init") {
      await initialize(d.buffer);
      return;
    }
    if (d.type === "reset") return;
    if (d.type === "inspect") {
      if (!Number.isInteger(d.index) || d.index < 0 || d.index >= n) throw new Error("잘못된 뉴런 인덱스");
      const links = [];
      let count = 0;
      for (let e = 0; e < m; e++) if (pre[e] === d.index) {
        count++;
        links.push({ target: post[e], weight: weight[e] });
      }
      links.sort((a,b)=>Math.abs(b.weight)-Math.abs(a.weight));
      self.postMessage({ type: "inspect", index: d.index, count, links: links.slice(0,80) });
      return;
    }
    if (d.type !== "step") return;
    if (!inverse) throw new Error("연결망 초기화 전입니다");
    if (
      !Array.isArray(d.input) ||
      d.input.length !== 4 ||
      d.input.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
    )
      throw new Error("잘못된 감각 입력");
    const start = performance.now(),
      state = forward(d.input),
      dots = [0, 0, 0, 0],
      activity = new Float32Array(63);
    for (let i = 0; i < n; i++) {
      activity[group[i]] += Math.abs(state[i]);
      if (channels[i] < 0)
        for (let c = 0; c < 4; c++) dots[c] += templates[c][i] * state[i];
    }
    for (let g = 0; g < 63; g++) activity[g] /= Math.max(1, sizes[g]);
    const output = inverse.map((row) =>
      Math.max(
        0,
        Math.min(
          1,
          row.reduce((s, v, j) => s + v * dots[j], 0),
        ),
      ),
    );
    self.postMessage({
      type: "step",
      output,
      groups: activity,
      neuronState: state,
      ms: performance.now() - start,
    }, [state.buffer]);
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
