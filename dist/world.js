import { createCreatures } from "./creatures.js?v=3";
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
  const baseFence = new THREE.Group();
  world.add(baseFence);
  // 외곽 울타리는 게임 경계를 표시한다.
  for (let x = -9.6; x <= 9.6; x += 1.6)
    for (const z of [-6.35, 6.35])
      block(baseFence, x, 0.38, z, 0.14, 0.8, 0.14, "#cead76");
  for (let z = -6.35; z <= 6.35; z += 1.58)
    for (const x of [-9.6, 9.6])
      block(baseFence, x, 0.38, z, 0.14, 0.8, 0.14, "#cead76");
  for (const z of [-6.35, 6.35])
    block(baseFence, 0, 0.4, z, 19.3, 0.11, 0.1, "#dfc08b");
  for (const x of [-9.6, 9.6])
    block(baseFence, x, 0.4, 0, 0.1, 0.11, 12.7, "#dfc08b");
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
  const expansionDecor = new THREE.Group();
  world.add(expansionDecor);
  const dynamicClouds = [];
  let farmStage = 0;
  const harvestPalette = ["#d8b86b", "#e3c581", "#c6a15a", "#b59050", "#cfb879", "#a89b64"];
  const orchardPalette = ["#a98255", "#b58b5e", "#8e7055", "#c09a69", "#78645d", "#9c7959"];
  function harvestColor(x,z) {
    const patch=noise(Math.floor(x/3),Math.floor(z/4));
    const palette = farmStage===2 ? orchardPalette : harvestPalette;
    return palette[(Math.floor(patch*4)+(Math.floor(z)%5===0?2:0))%palette.length];
  }

  function rebuildExpansionDecor(level = 0) {
    expansionDecor.clear();
    dynamicClouds.splice(0).forEach(cloud => scene.remove(cloud));
    const width = 25 + level * 8, depth = 17 + level * 6;
    const halfX = (width - 1) * .4, halfZ = (depth - 1) * .3875;
    for (let ix = 0; ix < width; ix++) for (let iz = 0; iz < depth; iz++) {
      const x = -halfX + ix * .8, z = -halfZ + iz * .775;
      if (Math.abs(x) <= 9.61 && Math.abs(z) <= 6.21) continue;
      block(expansionDecor, x, -.18, z, .8, .36, .775, farmStage ? harvestColor(Math.round((x+9.6)/.8),Math.round((z+6.2)/.775)) : (ix % 2 === iz % 2 ? "#7eac50" : "#75a64d"));
    }
    for (let ix = 0; ix < width; ix += 2) { const x = -halfX + ix * .8; block(expansionDecor,x,.38,-halfZ,.14,.8,.14,"#cead76"); block(expansionDecor,x,.38,halfZ,.14,.8,.14,"#cead76"); }
    for (let iz = 0; iz < depth; iz += 2) { const z = -halfZ + iz * .775; block(expansionDecor,-halfX,.38,z,.14,.8,.14,"#cead76"); block(expansionDecor,halfX,.38,z,.14,.8,.14,"#cead76"); }
    block(expansionDecor, 0, .4, -halfZ, width * .8, .11, .1, "#dfc08b");
    block(expansionDecor, 0, .4, halfZ, width * .8, .11, .1, "#dfc08b");
    block(expansionDecor, -halfX, .4, 0, .1, .11, depth * .775, "#dfc08b");
    block(expansionDecor, halfX, .4, 0, .1, .11, depth * .775, "#dfc08b");
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i], x = gameX(o.x), z = gameZ(o.y), r = o.r/50 * (farmStage===2 ? 2.35 : 1);
      const harvestType = ["cottage", "hay", "granary"][i%3];
      if (farmStage===2 && i%4===0) {
        block(expansionDecor,x,.8,z,r*1.8,.2,r*1.8,"#5c3b32");
        block(expansionDecor,x,.8,z,r*.5,1.6,r*.5,"#60412e");
        block(expansionDecor,x,1.55,z,r*2.1,.35,r*2.1,"#477443");
        continue;
      }
      if (farmStage===2 && i%4===1) {
        block(expansionDecor,x,.45,z,r*2.4,.9,r*1.9,"#70627c");
        block(expansionDecor,x,.98,z,r*2.0,.15,r*1.6,"#927fa3");
        continue;
      }
      if (farmStage && harvestType === "granary") {
        block(expansionDecor,x,.65,z,r*1.25,1.3,r*1.25,"#a64c38");
        for(const side of [-1,1]) block(expansionDecor,x+side*r*.5,.7,z+r*.64,.08,1.4,.06,"#f0d9a2");
        block(expansionDecor,x,1.42,z,r*1.4,.24,r*1.4,"#526469");
        block(expansionDecor,x,1.61,z,r*.85,.17,r*1.4,"#62777a");
        block(expansionDecor,x,.4,z+r*.65,r*.6,.8,.05,"#67452e");
        block(expansionDecor,x,.85,z+r*.69,r*.75,.07,.04,"#ecd2a1");
        continue;
      }
      if (farmStage && harvestType === "cottage") {
        const hut=new THREE.Group();
        hut.position.set(x,0,z); expansionDecor.add(hut);
        const size=r*1.25;
        block(hut,0,.04,0,size,.08,size,"#77634d");
        block(hut,0,.56,0,size,1.04,size,"#ab7948");
        // 목조 벽의 판재와 모서리 기둥.
        for(let row=0;row<5;row++) {
          block(hut,0,.2+row*.19,size/2+.01,size,.035,.025,"#785435");
          block(hut,size/2+.01,.2+row*.19,0,.025,.035,size,"#785435");
        }
        for(const a of [-1,1]) for(const b of [-1,1]) block(hut,a*(size/2-.05),.56,b*(size/2-.05),.09,1.1,.09,"#67482e");
        block(hut,-size*.2,.37,size/2+.025,size*.28,.68,.04,"#513d2c");
        block(hut,-size*.13,.4,size/2+.053,.035,.035,.025,"#edbd63");
        block(hut,size*.22,.69,size/2+.03,size*.28,.32,.05,"#f6d88a");
        block(hut,size*.22,.69,size/2+.06,.035,.33,.02,"#705337");
        for(let row=0;row<5;row++) block(hut,0,1.12+row*.09,0,size+ .12-row*.1,.12,size+.12,["#884e36","#a5603f","#bb7950"][row%3]);
        block(hut,size*.27,1.53,-size*.2,.16,.42,.18,"#8b8172");
        continue;
      }
      if (farmStage) {
        block(expansionDecor,x,.45,z,r*1.65,.9,r*1.45,"#d5a345");
        block(expansionDecor,x,.94,z,r*1.5,.1,r*1.3,"#edcd78");
        for (const offset of [-.45,.45]) block(expansionDecor,x+offset*r,.47,z,.08,.96,r*1.47,"#8b6736");
        for(let j=0;j<5;j++) block(expansionDecor,x,.14+j*.15,z+r*.73,r*1.6,.025,.025,"#b98737");
        continue;
      }
      if (i % 2 === 0) {
        block(expansionDecor, x, .8, z, .42, 1.6, .42, "#765333");
        block(expansionDecor, x - .12, 1.7, z, r * 1.7, 1, r * 1.6, "#3f773e");
        block(expansionDecor, x + .1, 2.4, z - .08, r * 1.4, .7, r * 1.3, "#579444");
        block(expansionDecor, x, .08, z, r * 1.6, .16, r * 1.6, "#557d40");
      } else {
        block(expansionDecor, x, .28, z, r * 1.6, .56, r * 1.35, "#909b91");
        block(expansionDecor, x - .2, .72, z - .13, r * 1.1, .4, r * .95, "#b1bbb0");
        block(expansionDecor, x + .45, .17, z + .4, .55, .34, .5, "#748579");
      }
    }
    if (farmStage) {
      for (let x=-halfX+.4;x<halfX;x+=.48) for(let z=-halfZ+.4;z<halfZ;z+=.8) {
        block(expansionDecor,x,.08,z,.035,.16,.04,"#e9cb7a");
      }
    }
    for (let i = 0; i < level * 28; i++) {
      const x = (noise(i + 80, level * 17) - .5) * (18 + level * 7), z = (noise(i + 80, level * 29) - .5) * (12 + level * 5);
      block(expansionDecor, x, .09, z, .05, .18, .06, i % 7 === 0 ? "#e8cf73" : "#528139");
    }
    for (let i = 0; i < level * 2; i++) {
      const cloud = new THREE.Group();
      cloud.position.set(-18 + Math.random() * 32, 4.5 + Math.random() * 2.5, -14 + Math.random() * 24);
      block(cloud, 0, 0, 0, 4.5, .8, 1.5, "#f1fbf8");
      block(cloud, -.7, .6, 0, 2.4, .6, 1.4, "#f1fbf8");
      cloud.traverse(o => { o.castShadow = false; }); scene.add(cloud); dynamicClouds.push(cloud);
    }
  }
  rebuildExpansionDecor(0);
  const extraFlies = [];
  let activeStyle="default", trackedIndex=0, flockSize=1;
  const creatures = createCreatures();
  const fly = creatures.root;
  scene.add(fly);
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
  let foodTier=1;
  const foodMeshes = new Map();
  function createFood(food) {
    const mesh = new THREE.Group();
    block(mesh, 0, 0, 0, 0.25, 0.28, 0.25, "#ffae46");
    block(mesh, -0.09, -0.04, 0, 0.1, 0.15, 0.18, "#f28432");
    block(mesh, 0, 0.19, 0, 0.035, 0.12, 0.035, "#695531");
    const leaf = block(mesh, 0.06, 0.21, 0, 0.14, 0.04, 0.07, "#629a3f");
    leaf.rotation.z = 0.3;
    if(foodTier>=2) {
      mesh.clear();
      // 잘 익은 붉은 열매, 3단계는 황금 열매 묶음.
      const color=foodTier===2?"#dc5145":"#f5c542";
      const count=foodTier===2?1:3;
      for(let i=0;i<count;i++) {
        const x=count===1?0:(i-1)*.22, y=i===1?.18:0;
        block(mesh,x,y,0,.3,.28,.3,color);
        block(mesh,x-.05,y+.15,0,.15,.08,.2,foodTier===2?"#f78469":"#ffe791");
        block(mesh,x,y+.23,0,.04,.12,.04,"#795430");
        block(mesh,x+.07,y+.25,0,.17,.04,.08,"#649542");
      }
    }
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
    setFoodTier(tier) {
      foodTier=tier;
      for(const mesh of foodMeshes.values()) scene.remove(mesh);
      foodMeshes.clear();
    },
    setFarm(stage, level) {
      farmStage=stage;
      for(let i=0;i<25*17;i++) terrain.setColorAt(i*3,new THREE.Color(stage ? harvestColor(Math.floor(i/17),i%17) : grassColors[i%5]));
      terrain.instanceColor.needsUpdate=true;
      scene.background.set(stage===2 ? "#8b6871" : stage ? "#e6d5ac" : "#a6d7e2");
      scene.fog.color.copy(scene.background);
      rebuildExpansionDecor(level);
    },
    customize(style = "default") {
      activeStyle=style;
      creatures.setStyle(style);
      extraFlies.forEach(c=>c.setStyle(style));
    },
    setExpansion(level = 0) {
      // 실제 타일 좌표를 그대로 유지한다. 확장 레벨은 월드 크기와 카메라 거리만 바꾼다.
      expansionScale = 1;
      baseFence.visible = level === 0;
      world.scale.set(1, 1, 1);
      camera.position.setLength(31 + Math.min(3, level) * 3.5);
      controls.maxDistance = 58 + Math.min(3, level) * 12;
      // 확장 후에도 농장 전체가 한 화면에 남도록 카메라를 한 단계씩 물린다.
      // 카메라 거리를 바꾸지 않아 확장된 농장 외곽이 화면에서 실제로 커진다.
      rebuildExpansionDecor(level);
      controls.target.y = -0.5;
    },
    home,
    firstPerson() {
      trackedIndex = firstPerson ? (trackedIndex+1)%flockSize : 0;
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
      const next = following ? (trackedIndex+1)%flockSize : 0;
      if (firstPerson) home();
      cameraAnimation?.cancel();
      targetAnimation?.cancel();
      trackedIndex=next;
      following=true;
      document.getElementById("follow").setAttribute("aria-pressed","true");
      return true;
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
    render(bot, foods, trail, time, playing, companions = []) {
      while(extraFlies.length < companions.length) { const c=createCreatures();c.setStyle(activeStyle);scene.add(c.root);extraFlies.push(c); }
      extraFlies.forEach((c,i)=>{
        c.root.visible=i<companions.length;
        if(!c.root.visible)return;
        const f=companions[i]; c.root.position.set(gameX(f.x),.025,gameZ(f.y)); c.root.rotation.y=-f.a;c.animate(time+i,playing);
      });
      flockSize=companions.length+1;
      trackedIndex=Math.min(trackedIndex,flockSize-1);
      const tracked = trackedIndex===0 ? bot : companions[trackedIndex-1];
      document.getElementById("first-person").textContent=firstPerson ? `3인칭 · ${trackedIndex+1}번 / ${flockSize}` : "3인칭";
      document.getElementById("follow").textContent=following ? `따라가기 · ${trackedIndex+1}번 / ${flockSize}` : "초파리 따라가기";
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
      creatures.animate(time, playing);
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
        const direction = new THREE.Vector3(Math.cos(tracked.a), 0, Math.sin(tracked.a));
        // 배틀로얄식 어깨 너머 카메라: 캐릭터 뒤쪽 위에서 진행 방향을 바라본다.
        const anchor = new THREE.Vector3(gameX(tracked.x), 0, gameZ(tracked.y));
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
          new THREE.Vector3(gameX(tracked.x), 0, gameZ(tracked.y)),
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
