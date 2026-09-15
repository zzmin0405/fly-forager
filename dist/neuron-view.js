import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

export function createNeuronView(onSelect) {
  const $ = id => document.getElementById(id);
  const canvas = $('brain-canvas'), panel = $('brain-panel');
  const names = ['먹이 · 왼쪽', '먹이 · 오른쪽', '위험 · 왼쪽', '위험 · 오른쪽'];
  let meta, ids, positions, points, activity, latest, shown, selected = -1;
  let frozen = false, visible = true, dirty = true, lines, renderer, controls, camera, scene;
  const status = text => $('brain-live-status').textContent = text;
  const rows = Array.from({length:8}, () => {
    const button = document.createElement('button');
    button.disabled = true;
    button.textContent = '계산 대기 중';
    button.onclick = () => select(Number(button.dataset.index));
    $('brain-top').append(button);
    return button;
  });
  function details() {
    if (selected < 0 || !ids || !meta) return;
    $('brain-selected').textContent = ids[selected];
    $('brain-value').textContent = shown ? shown[selected].toFixed(6) : '—';
    $('brain-group').textContent = `집단 ${meta.neuronGroups[selected]}`;
    $('brain-channel').textContent = names[meta.channels[selected]] || '직접 입력 없음';
  }
  function select(index) {
    if (!positions || !meta || !Number.isInteger(index) || index < 0 || index >= ids.length) return;
    selected = index;
    points.material.uniforms.selected.value = index;
    if (lines) { scene.remove(lines); lines.geometry.dispose(); lines.material.dispose(); lines = null; }
    $('brain-links').textContent = '연결 조회 중';
    details(); onSelect(index); dirty = true;
  }
  function paint() {
    if (!latest || !activity || !meta || frozen) return;
    shown = latest;
    activity.array.set(shown); activity.needsUpdate = true;
    const top = [];
    for (let i=0; i<shown.length; i++) {
      if (meta.channels[i] >= 0 || Math.abs(shown[i]) < .000001) continue;
      const magnitude = Math.abs(shown[i]);
      if (top.length === 8 && magnitude <= Math.abs(shown[top[7]])) continue;
      let j = 0;
      while (j < top.length && Math.abs(shown[top[j]]) >= magnitude) j++;
      top.splice(j,0,i); if (top.length > 8) top.pop();
    }
    rows.forEach((button,j) => {
      const i = top[j]; button.disabled = i === undefined;
      button.dataset.index = i ?? '';
      button.textContent = i === undefined ? '반응 없음' : `${j+1}. 집단 ${meta.neuronGroups[i]} · ${shown[i].toFixed(5)}`;
      button.title = i === undefined ? '' : ids[i];
      button.style.setProperty('--activity-color', shown[i] < 0 ? '#ffaf60' : '#49dbea');
    });
    status('LIVE · 139,255 뉴런'); details(); dirty = true;
  }
  async function init() {
    try {
      const responses = await Promise.all([fetch('./neuron-positions.bin'),fetch('./neuron-ids.json')]);
      if (responses.some(r => !r.ok)) throw new Error('좌표 파일을 불러오지 못했습니다');
      const raw = new Float32Array(await responses[0].arrayBuffer()); ids = await responses[1].json();
      if (ids.length !== 139255 || raw.length !== ids.length*3 || !raw.every(Number.isFinite)) throw new Error('좌표 데이터가 맞지 않습니다');
      const bounds = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(raw,3));
      const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
      const scale = 10/Math.max(size.x,size.y,size.z);
      positions = new Float32Array(raw.length);
      for(let i=0;i<ids.length;i++) {
        positions[i*3]=(raw[i*3]-center.x)*scale;
        positions[i*3+1]=-(raw[i*3+1]-center.y)*scale;
        positions[i*3+2]=-(raw[i*3+2]-center.z)*scale;
      }
      renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.setClearColor('#08121f');
      scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(42,1,.01,100);
      camera.position.set(0,0,16);
      controls = new OrbitControls(camera,canvas); controls.minDistance=3; controls.maxDistance=28;
      controls.addEventListener('change',() => dirty=true);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      activity = new THREE.BufferAttribute(new Float32Array(ids.length),1).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('activity',activity);
      geometry.setAttribute('inputChannel',new THREE.BufferAttribute(new Float32Array(ids.length).fill(-1),1));
      geometry.setAttribute('neuronIndex',new THREE.BufferAttribute(Float32Array.from({length:ids.length},(_,i)=>i),1));
      const material = new THREE.ShaderMaterial({
        transparent:true,depthWrite:false,blending:THREE.NormalBlending,
        uniforms:{gain:{value:12},activeOnly:{value:false},selected:{value:-1}},
        vertexShader:`attribute float activity; attribute float inputChannel; attribute float neuronIndex;
          uniform float gain; uniform float selected; varying float value; varying float inputFlag; varying float chosen;
          void main(){ value=activity; inputFlag=inputChannel; chosen=abs(neuronIndex-selected)<.1?1.:0.;
          vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp((1.2+min(abs(value)*gain,1.)*3.5+chosen*6.)*16./max(3.,-mv.z),1.,15.); }`,
        fragmentShader:`uniform float gain; uniform bool activeOnly; varying float value; varying float inputFlag; varying float chosen;
          void main(){float r=length(gl_PointCoord-.5); if(r>.5) discard;
          if(activeOnly && abs(value)<.001 && chosen<.5) discard;
          float strength=clamp(abs(value)*gain,0.,1.);
          vec3 color=value<0.?vec3(1.,.56,.24):vec3(.20,.83,.94);
          if(inputFlag>=0.) color=vec3(.90,.40,.96);
          color=mix(vec3(.22,.34,.47),color,sqrt(strength));
          color=mix(color,vec3(1.),chosen);
          gl_FragColor=vec4(color,(.055+strength*.75+chosen)*(1.-smoothstep(.12,.5,r))); }`
      });
      points = new THREE.Points(geometry,material); scene.add(points);
      if(meta) geometry.attributes.inputChannel.array.set(meta.channels);
      const resize = () => {const box=canvas.parentElement.getBoundingClientRect(); renderer.setSize(box.width,box.height,false); camera.aspect=box.width/box.height; camera.updateProjectionMatrix(); dirty=true;};
      new ResizeObserver(resize).observe(canvas.parentElement); resize();
      new IntersectionObserver(entries => {visible=entries[0].isIntersecting; dirty=true;}).observe(canvas);
      const ray = new THREE.Raycaster(); ray.params.Points.threshold=.035;
      let start;
      canvas.addEventListener('pointerdown',e => start=[e.clientX,e.clientY]);
      canvas.addEventListener('pointerup',e => {
        if(!start || Math.hypot(e.clientX-start[0],e.clientY-start[1])>5) return;
        const rect=canvas.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
        const hit=ray.intersectObject(points).find(h => !material.uniforms.activeOnly.value || Math.abs(shown?.[h.index]||0)>=.001);
        if(hit) select(hit.index);
      });
      $('brain-gain').oninput=e => {material.uniforms.gain.value=Number(e.target.value); $('brain-gain-value').textContent=e.target.value+'×'; dirty=true;};
      $('brain-active').onchange=e => {material.uniforms.activeOnly.value=e.target.checked; dirty=true;};
      $('brain-home').onclick=()=>{camera.position.set(0,0,16);controls.target.set(0,0,0);controls.update();dirty=true;};
      function frame(){requestAnimationFrame(frame);if(visible && dirty){renderer.render(scene,camera);dirty=false;}}
      frame(); status('좌표 준비됨 · 계산 대기'); paint();
    } catch(e) {status('3D 관찰실 오류: '+e.message);console.error(e);}
  }
  $('brain-freeze').onclick=()=>{frozen=!frozen;$('brain-freeze').textContent=frozen?'실시간 표시':'표시 정지';$('brain-freeze').setAttribute('aria-pressed',String(frozen));if(frozen)status('표시 정지 · 게임은 계속 진행');else paint();};
  let oldOverflow='';
  function expand(force) {
    const expanded=force ?? !panel.classList.contains('is-expanded');
    panel.classList.toggle('is-expanded',expanded);
    $('brain-expand').textContent=expanded?'작게 보기':'크게 보기';
    $('brain-expand').setAttribute('aria-expanded',String(expanded));
    if(expanded){oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
    else {document.body.style.overflow=oldOverflow;$('brain-expand').focus();}
  }
  $('brain-expand').onclick=()=>expand();
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && panel.classList.contains('is-expanded'))expand(false);});
  init();
  return {
    setMeta(value){meta=value;if(points){points.geometry.attributes.inputChannel.array.set(meta.channels);points.geometry.attributes.inputChannel.needsUpdate=true;}paint();},
    update(value){if(value?.length===139255){latest=value;paint();}},
    reset(){latest=new Float32Array(139255);frozen=false;$('brain-freeze').textContent='표시 정지';$('brain-freeze').setAttribute('aria-pressed','false');paint();},
    showLinks(data){
      if(data.index!==selected || !scene)return;
      if(lines){scene.remove(lines);lines.geometry.dispose();lines.material.dispose();}
      const vertices=[];
      for(const link of data.links) vertices.push(...positions.subarray(selected*3,selected*3+3),...positions.subarray(link.target*3,link.target*3+3));
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#f4e6a4',transparent:true,opacity:.32,depthWrite:false}));scene.add(lines);
      $('brain-links').textContent=`${data.count.toLocaleString()}개 중 ${data.links.length}개 표시`;dirty=true;
    }
  };
}
