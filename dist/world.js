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
  controls.enablePan = true;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
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
  let expansionScale = 1;
  const gameX = value => (value - 500) / 50 * expansionScale;
  const gameZ = value => (value - 330) / 50 * expansionScale;
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
  const flyBody = [
    block(fly, 0, 0.29, 0, 0.45, 0.32, 0.3, "#413a29"),
    block(fly, -0.2, 0.28, 0, 0.3, 0.26, 0.27, "#a78342"),
    block(fly, -0.29, 0.28, 0, 0.06, 0.27, 0.28, "#3b3628"),
    block(fly, 0.24, 0.33, 0, 0.22, 0.27, 0.32, "#595343"),
  ];
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
  const birdParts = new THREE.Group();
  birdParts.visible = false;
  fly.add(birdParts);
  block(birdParts, 0.48, 0.34, 0, 0.22, 0.12, 0.13, "#f1b83b");
  block(birdParts, -0.5, 0.34, 0, 0.32, 0.11, 0.12, "#4e9b57");
  const jetParts = new THREE.Group();
  jetParts.visible = false;
  fly.add(jetParts);
  block(jetParts, 0.5, 0.3, 0, 0.38, 0.1, 0.12, "#c7d1d8");
  block(jetParts, -0.38, 0.48, 0, 0.18, 0.3, 0.08, "#596975");
  const beeParts = new THREE.Group();
  beeParts.visible = false;
  fly.add(beeParts);
  block(beeParts, -0.28, 0.3, 0, 0.28, 0.3, 0.34, "#f4c430");
  block(beeParts, -0.08, 0.3, 0, 0.13, 0.32, 0.35, "#24211d");
  block(beeParts, 0.12, 0.31, 0, 0.24, 0.34, 0.36, "#f4c430");
  block(beeParts, 0.31, 0.32, 0, 0.13, 0.35, 0.36, "#24211d");
  block(beeParts, 0.48, 0.34, 0, 0.22, 0.37, 0.38, "#f4c430");
  block(beeParts, -0.57, 0.3, 0, 0.18, 0.08, 0.08, "#352d22");
  for (const side of [-1, 1]) {
    const antenna = block(beeParts, 0.61, 0.52, side * 0.14, 0.25, 0.035, 0.035, "#352d22");
    antenna.rotation.z = -0.45;
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
    firstPerson = false,
    cameraAnimation,
    targetAnimation;
  let cameraTime = performance.now();
  const chaseLook = new THREE.Vector3();
  let chaseEntering = false;
  let chaseDistance = 2.8;
  function home(top = false) {
    firstPerson = false;
    controls.enabled = true;
    document.getElementById("first-person").setAttribute("aria-pressed", "false");
    following = false;
    document.getElementById("follow").setAttribute("aria-pressed", "false");
    cameraAnimation?.cancel();
    targetAnimation?.cancel();
    camera.fov = 38;
    camera.updateProjectionMatrix();
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
      targetAnimation = animate(controls.target, {
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
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    document.dispatchEvent(
      new CustomEvent("world-error", {
        detail: "3D 그래픽 연결이 중단되었습니다. 페이지를 새로고침하세요.",
      }),
    );
  });
  canvas.addEventListener("wheel", (event) => {
    if (!firstPerson) return;
    event.preventDefault();
    chaseDistance = Math.max(1.4, Math.min(8, chaseDistance + event.deltaY * 0.006));
  }, { passive: false });
  return {
    customize(style = "default") {
      const palettes = {
        default:["#413a29","#a78342","#3b3628","#595343","#e7f9fa"], bee:["#f4c430","#24211d","#f4c430","#24211d","#d9fbff"],
        ladybug:["#e34234","#202020","#e34234","#202020","#ffe8ef"], firefly:["#263f30","#b7ff63","#eaff8f","#314b38","#c8ffd5"],
        parrot:["#3da85b","#e84b3c","#287d48","#46b86b","#4b78db"], sparrow:["#8b694d","#c5a982","#6a4c38","#9b795a","#d8c6a7"],
        jet:["#667986","#b6c3ca","#45545d","#8395a0","#9ec9dc"]
      };
      const palette = palettes[style] || palettes.default;
      fly.scale.setScalar(style === "default" ? 1 : 1.15);
      flyBody.forEach((part,index)=>{part.material=part.material.clone();part.material.color.set(palette[index]);part.material.emissive?.set(style==="firefly"&&index===2?"#78ff45":"#000000");part.material.emissiveIntensity=style==="firefly"&&index===2?1.4:0;});
      birdParts.visible = style === "parrot" || style === "sparrow";
      jetParts.visible = style === "jet";
      beeParts.visible = style === "bee";
      flyBody.forEach(part => { part.visible = style !== "bee"; });
      const wingColor = palette[4];
      wings.forEach(pivot => pivot.traverse(obj => { if (obj.material?.color) obj.material.color.set(wingColor); }));
    },
    setExpansion(level = 0) {
      const scale = 1 + Math.min(3, Math.max(0, level)) * 0.09;
      expansionScale = scale;
      world.scale.set(scale, 1, scale);
      controls.maxDistance = 58 + Math.min(3, level) * 7;
      controls.target.y = -0.5;
    },
    home,
    firstPerson() {
      if (firstPerson) { home(); return false; }
      cameraAnimation?.cancel();
      targetAnimation?.cancel();
      firstPerson = true;
      following = false;
      chaseEntering = true;
      controls.enabled = false;
      camera.fov = 55;
      camera.updateProjectionMatrix();
      document.getElementById("follow").setAttribute("aria-pressed", "false");
      document.getElementById("first-person").setAttribute("aria-pressed", "true");
      return true;
    },
    follow() {
      if (firstPerson) {
        home();
      }
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
      return { x: point.x / expansionScale * 50 + 500, y: point.z / expansionScale * 50 + 330 };
    },
    collect(food) {
      const origin = new THREE.Vector3(
        gameX(food.x),
        0.45,
        gameZ(food.y),
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
      const now = performance.now();
      const cameraDt = Math.min(0.1, (now - cameraTime) / 1000);
      cameraTime = now;
      fly.position.set(
        gameX(bot.x),
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
          gameX(food.x),
          0.4 + (reduced ? 0 : Math.sin(time * 2 + food.x) * 0.07),
          gameZ(food.y),
        );
        mesh.rotation.y = time * 0.45;
      }
      for (let i = 0; i < trail.length; i++) {
        pathPositions[i * 3] = gameX(trail[i].x);
        pathPositions[i * 3 + 1] = 0.025;
        pathPositions[i * 3 + 2] = gameZ(trail[i].y);
      }
      pathGeometry.attributes.position.needsUpdate = true;
      pathGeometry.setDrawRange(0, trail.length);
      if (firstPerson) {
        const direction = new THREE.Vector3(Math.cos(bot.a), 0, Math.sin(bot.a));
        // 배틀로얄식 어깨 너머 카메라: 캐릭터 뒤쪽 위에서 진행 방향을 바라본다.
        const anchor = new THREE.Vector3(fly.position.x, 0, fly.position.z);
        const shoulder = new THREE.Vector3(-direction.z, 0, direction.x);
        const eye = anchor.clone().addScaledVector(direction, -chaseDistance)
          .addScaledVector(shoulder, 0.5).add(new THREE.Vector3(0, 1.65, 0));
        const look = anchor.clone().add(new THREE.Vector3(0, 0.38, 0));
        const blend = reduced || chaseEntering ? 1 : 1 - Math.exp(-8 * cameraDt);
        camera.position.lerp(eye, blend);
        chaseLook.copy(look);
        camera.lookAt(chaseLook);
        controls.target.copy(chaseLook);
        chaseEntering = false;
      } else if (following) {
        const old = controls.target.clone();
        controls.target.lerp(
          new THREE.Vector3(fly.position.x, 0, fly.position.z),
          0.06,
        );
        camera.position.add(controls.target.clone().sub(old));
      }
      // enabled=false는 입력만 막는다. update()도 생략해야 추적 시선이 유지된다.
      if (!firstPerson) controls.update();
      renderer.render(scene, camera);
    },
  };
}
