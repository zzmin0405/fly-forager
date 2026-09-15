import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { animate } from "./vendor/anime.esm.js";

// 게임 좌표를 평면 XZ에 매핑한다. 높이는 표현용이며 충돌은 기존 게임 좌표를 따른다.
export function createWorld(canvas, obstacles) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#a6d7e2");
  scene.fog = new THREE.Fog("#a6d7e2", 40, 95);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 180);
  camera.position.set(19, 22, 25);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, -0.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 11;
  controls.maxDistance = 58;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.45;
  controls.enablePan = false;
  scene.add(new THREE.HemisphereLight("#e7fbff", "#718153", 2.5));
  const sun = new THREE.DirectionalLight("#fff2cf", 3.5);
  sun.position.set(-12, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -18,
    right: 18,
    top: 15,
    bottom: -15,
    near: 0.5,
    far: 65,
  });
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  function material(color) {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 1 }),
      );
    return materials.get(color);
  }
  function block(parent, x, y, z, sx, sy, sz, color) {
    const mesh = new THREE.Mesh(cube, material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const world = new THREE.Group();
  scene.add(world);
  const noise = (x, z) => {
    const t = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return t - Math.floor(t);
  };
  // 인스턴스 메시로 지형의 드로 콜을 줄인다.
  const grassColors = ["#6e9f47", "#7eac50", "#82b355", "#75a64d", "#8cb95c"];
  const terrain = new THREE.InstancedMesh(
    cube,
    new THREE.MeshStandardMaterial({ roughness: 1 }),
    25 * 17 * 3,
  );
  const matrix = new THREE.Matrix4();
  let instance = 0;
  for (let x = 0; x < 25; x++)
    for (let z = 0; z < 17; z++) {
      const px = -9.6 + x * 0.8,
        pz = -6.2 + z * 0.775;
      for (let level = 0; level < 3; level++) {
        matrix.compose(
          new THREE.Vector3(px, -0.18 - level * 0.58, pz),
          new THREE.Quaternion(),
          new THREE.Vector3(0.8, level ? 0.6 : 0.36, 0.775),
        );
        terrain.setMatrixAt(instance, matrix);
        terrain.setColorAt(
          instance++,
          new THREE.Color(
            level === 0
              ? grassColors[Math.floor(noise(x, z) * 5)]
              : level === 1
                ? "#805d3e"
                : "#655846",
          ),
        );
      }
    }
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  world.add(terrain);
  const soil = block(world, 0, -1.72, 0, 18.6, 0.8, 11.8, "#645641");
  soil.castShadow = false;
  // 외곽 울타리는 게임 경계를 표시한다.
  for (let x = -9.6; x <= 9.6; x += 1.6)
    for (const z of [-6.35, 6.35])
      block(world, x, 0.38, z, 0.14, 0.8, 0.14, "#cead76");
  for (let z = -6.35; z <= 6.35; z += 1.58)
    for (const x of [-9.6, 9.6])
      block(world, x, 0.38, z, 0.14, 0.8, 0.14, "#cead76");
  for (const z of [-6.35, 6.35])
    block(world, 0, 0.4, z, 19.3, 0.11, 0.1, "#dfc08b");
  for (const x of [-9.6, 9.6])
    block(world, x, 0.4, 0, 0.1, 0.11, 12.7, "#dfc08b");
  obstacles.forEach((o, i) => {
    const x = (o.x - 500) / 50,
      z = (o.y - 330) / 50,
      r = o.r / 50;
    if (i === 0 || i === 2) {
      block(world, x, 0.8, z, 0.42, 1.6, 0.42, "#765333");
      block(world, x - 0.12, 1.7, z, r * 1.7, 1.0, r * 1.6, "#3f773e");
      block(world, x + 0.1, 2.4, z - 0.08, r * 1.4, 0.7, r * 1.3, "#579444");
      block(world, x - 0.06, 2.88, z, r * 0.8, 0.3, r * 0.85, "#75ac4b");
      block(world, x, 0.08, z, r * 1.6, 0.16, r * 1.6, "#557d40");
    } else {
      block(world, x, 0.28, z, r * 1.6, 0.56, r * 1.35, "#909b91");
      block(world, x - 0.2, 0.72, z - 0.13, r * 1.1, 0.4, r * 0.95, "#b1bbb0");
      block(world, x + 0.45, 0.17, z + 0.4, 0.55, 0.34, 0.5, "#748579");
    }
  });
  // 풀은 통과 가능한 장식이다.
  for (let i = 0; i < 75; i++) {
    const x = (noise(i, 14) - 0.5) * 18,
      z = (noise(i, 25) - 0.5) * 12;
    if (
      obstacles.some(
        (o) =>
          Math.hypot(x - (o.x - 500) / 50, z - (o.y - 330) / 50) <
          o.r / 50 + 0.5,
      )
    )
      continue;
    block(
      world,
      x,
      0.09,
      z,
      0.05,
      0.18,
      0.06,
      i % 7 === 0 ? "#e8cf73" : "#528139",
    );
    if (i % 7 === 0) block(world, x, 0.21, z, 0.14, 0.1, 0.14, "#fff0a8");
  }
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Group();
    cloud.position.set(-22 + i * 9, 7 + (i % 3) * 1.8, -17 - (i % 2) * 8);
    block(cloud, 0, 0, 0, 4.5, 0.8, 1.5, "#f1fbf8");
    block(cloud, -0.7, 0.6, 0, 2.4, 0.6, 1.4, "#f1fbf8");
    cloud.traverse((o) => {
      o.castShadow = false;
    });
    scene.add(cloud);
    clouds.push(cloud);
  }
  // 다리 6개와 날개를 가진 복셀 초파리. 몸의 앞쪽은 게임의 +X 방향이다.
  const fly = new THREE.Group();
  scene.add(fly);
  block(fly, 0, 0.29, 0, 0.45, 0.32, 0.3, "#413a29");
  block(fly, -0.2, 0.28, 0, 0.3, 0.26, 0.27, "#a78342");
  block(fly, -0.29, 0.28, 0, 0.06, 0.27, 0.28, "#3b3628");
  block(fly, 0.24, 0.33, 0, 0.22, 0.27, 0.32, "#595343");
  for (const z of [-0.17, 0.17])
    block(fly, 0.28, 0.38, z, 0.14, 0.15, 0.1, "#e75a41");
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.06, 0.47, side * 0.1);
    fly.add(pivot);
    const wing = block(
      pivot,
      -0.06,
      0.02,
      side * 0.25,
      0.5,
      0.025,
      0.45,
      "#dcecf0",
    );
    wing.material = new THREE.MeshStandardMaterial({
      color: "#e7f9fa",
      transparent: true,
      opacity: 0.78,
      roughness: 0.3,
    });
    wing.castShadow = false;
    wings.push(pivot);
    for (let i = 0; i < 3; i++) {
      const leg = block(
        fly,
        -0.17 + i * 0.17,
        0.14,
        side * 0.23,
        0.035,
        0.22,
        0.035,
        "#342e24",
      );
      leg.rotation.x = side * 0.5;
    }
  }
  const markerGeometry = new THREE.RingGeometry(0.38, 0.42, 32);
  const marker = new THREE.Mesh(
    markerGeometry,
    new THREE.MeshBasicMaterial({
      color: "#efffa0",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.02;
  scene.add(marker);
  const foodMeshes = new Map();
  function createFood(food) {
    const mesh = new THREE.Group();
    block(mesh, 0, 0, 0, 0.25, 0.28, 0.25, "#ffae46");
    block(mesh, -0.09, -0.04, 0, 0.1, 0.15, 0.18, "#f28432");
    block(mesh, 0, 0.19, 0, 0.035, 0.12, 0.035, "#695531");
    const leaf = block(mesh, 0.06, 0.21, 0, 0.14, 0.04, 0.07, "#629a3f");
    leaf.rotation.z = 0.3;
    scene.add(mesh);
    foodMeshes.set(food, mesh);
    if (!reduced) {
      mesh.scale.setScalar(0.01);
      animate(mesh.scale, { x: 1, y: 1, z: 1, duration: 450, ease: "outBack" });
    }
    return mesh;
  }
  const pathGeometry = new THREE.BufferGeometry();
  const pathPositions = new Float32Array(600 * 3);
  pathGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(pathPositions, 3),
  );
  const path = new THREE.Line(
    pathGeometry,
    new THREE.LineBasicMaterial({
      color: "#f4ffc4",
      transparent: true,
      opacity: 0.55,
    }),
  );
  path.frustumCulled = false;
  scene.add(path);
  const raycaster = new THREE.Raycaster(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let following = false,
    cameraAnimation;
  function home(top = false) {
    following = false;
    document.getElementById("follow").setAttribute("aria-pressed", "false");
    cameraAnimation?.cancel();
    const target = top ? { x: 0, y: 34, z: 0.1 } : { x: 19, y: 22, z: 25 };
    if (reduced) {
      camera.position.set(target.x, target.y, target.z);
      controls.target.set(0, -0.5, 0);
    } else {
      cameraAnimation = animate(camera.position, {
        ...target,
        duration: 850,
        ease: "inOutCubic",
      });
      animate(controls.target, {
        x: 0,
        y: -0.5,
        z: 0,
        duration: 850,
        ease: "inOutCubic",
      });
    }
  }
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (width && height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    document.dispatchEvent(
      new CustomEvent("world-error", {
        detail: "3D 그래픽 연결이 중단되었습니다. 페이지를 새로고침하세요.",
      }),
    );
  });
  return {
    home,
    follow() {
      following = !following;
      document
        .getElementById("follow")
        .setAttribute("aria-pressed", String(following));
      return following;
    },
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((clientX - r.left) / r.width) * 2 - 1,
          (-(clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const point = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, point)) return null;
      return { x: point.x * 50 + 500, y: point.z * 50 + 330 };
    },
    collect(food) {
      const origin = new THREE.Vector3(
        (food.x - 500) / 50,
        0.45,
        (food.y - 330) / 50,
      );
      if (reduced) return;
      for (let i = 0; i < 8; i++) {
        const particle = block(
          scene,
          origin.x,
          origin.y,
          origin.z,
          0.09,
          0.09,
          0.09,
          i % 2 ? "#fff1b0" : "#ffb543",
        );
        const a = (i / 8) * Math.PI * 2;
        animate(particle.position, {
          x: origin.x + Math.cos(a) * 0.8,
          y: 0.2 + Math.random() * 0.8,
          z: origin.z + Math.sin(a) * 0.8,
          duration: 650,
          ease: "outCubic",
        });
        animate(particle.scale, {
          x: 0,
          y: 0,
          z: 0,
          duration: 650,
          ease: "inQuad",
          onComplete: () => scene.remove(particle),
        });
      }
      animate(document.getElementById("score"), {
        scale: [1.15, 1],
        duration: 500,
        ease: "outElastic(1, .5)",
      });
    },
    render(bot, foods, trail, time, playing) {
      fly.position.set(
        (bot.x - 500) / 50,
        0.025 + (playing ? Math.sin(time * 12) * 0.025 : 0),
        (bot.y - 330) / 50,
      );
      fly.rotation.y = -bot.a;
      marker.position.set(fly.position.x, 0.02, fly.position.z);
      wings.forEach((wing, i) => {
        wing.rotation.x =
          (i ? 1 : -1) * (0.15 + (playing ? Math.sin(time * 55) * 0.45 : 0));
      });
      for (const [food, mesh] of foodMeshes)
        if (!foods.includes(food)) {
          scene.remove(mesh);
          foodMeshes.delete(food);
        }
      for (const food of foods) {
        const mesh = foodMeshes.get(food) || createFood(food);
        mesh.position.set(
          (food.x - 500) / 50,
          0.4 + (reduced ? 0 : Math.sin(time * 2 + food.x) * 0.07),
          (food.y - 330) / 50,
        );
        mesh.rotation.y = time * 0.45;
      }
      for (let i = 0; i < trail.length; i++) {
        pathPositions[i * 3] = (trail[i].x - 500) / 50;
        pathPositions[i * 3 + 1] = 0.025;
        pathPositions[i * 3 + 2] = (trail[i].y - 330) / 50;
      }
      pathGeometry.attributes.position.needsUpdate = true;
      pathGeometry.setDrawRange(0, trail.length);
      if (following) {
        const old = controls.target.clone();
        controls.target.lerp(
          new THREE.Vector3(fly.position.x, 0, fly.position.z),
          0.06,
        );
        camera.position.add(controls.target.clone().sub(old));
      }
      controls.update();
      renderer.render(scene, camera);
    },
  };
}
