import * as THREE from 'three';

// 공통 1픽셀 격자. 색별 인스턴싱으로 작은 블록 수가 늘어도 드로콜을 제한한다.
export function createCreatures() {
  const root = new THREE.Group(), models = {}, animations = [];
  const unit = .055, geometry = new THREE.BoxGeometry(unit, unit, unit);
  const materials = new Map();
  function model(name) {
    const group = new THREE.Group(); root.add(group); models[name] = group;
    return group;
  }
  function pixels(parent, build) {
    const cells = new Map();
    const put = (x,y,z,color) => cells.set(`${x},${y},${z}`, {x,y,z,color});
    const box = (x,y,z,w,h,d,color) => {
      for(let a=0;a<w;a++) for(let b=0;b<h;b++) for(let c=0;c<d;c++)
        put(x+a,y+b,z+c,typeof color==='function'?color(a,b,c):color);
    };
    build(box,put);
    const buckets = new Map();
    for(const p of cells.values()) {
      if(!buckets.has(p.color)) buckets.set(p.color,[]);
      buckets.get(p.color).push(p);
    }
    for(const [color,points] of buckets) {
      if(!materials.has(color)) materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.88}));
      const mesh = new THREE.InstancedMesh(geometry,materials.get(color),points.length);
      const matrix = new THREE.Matrix4();
      points.forEach((p,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(p.x*unit,p.y*unit,p.z*unit)));
      mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh);
    }
  }
  function face(box,x,y,z) {
    box(x,y,z,1,3,3,'#fff5cf');
    box(x+1,y,z+1,1,2,2,'#20272b');
    box(x+1,y+2,z+1,1,1,1,'#ffffff');
  }
  function wings(parent,bird=false,colors=['#d1eced','#f3ffff']) {
    for(const side of [-1,1]) {
      const pivot=new THREE.Group(); pivot.position.set(-.11,.56,side*.18); parent.add(pivot);
      pixels(pivot,(box)=>{
        for(let z=0;z<(bird?10:7);z++) {
          const length=bird?Math.max(2,9-Math.floor(z*.6)):Math.max(2,7-Math.abs(z-3));
          box(-Math.floor(z*.3)-2,0,side*z,length,1,1,z%3===0?colors[1]:colors[0]);
        }
      });
      animations.push({pivot,side,bird});
    }
  }
  function legs(box,count=3) {
    for(const side of [-1,1]) for(let i=0;i<count;i++) {
      box(-5+i*4,2,side<0?-4:4,1,3,1,'#393329');
      box(-4+i*4,1,side<0?-5:4,2,1,2,'#393329');
    }
  }
  const bee=model('bee');
  pixels(bee,(box)=>{
    // 연속된 몸통에 직접 줄무늬를 새긴다. 공중에 떠 있는 장식은 없다.
    box(-8,4,-4,14,8,9,(x,y)=>[3,4,8,9].includes(x)?'#493322':y>5?'#ffdb52':'#e9ab28');
    box(-7,12,-3,12,1,7,(x)=>[2,3,7,8].includes(x)?'#493322':'#f8cf45');
    box(6,5,-4,4,7,9,'#ffd95d');
    face(box,10,7,-3); face(box,10,7,1);
    box(7,12,-3,1,3,1,'#493322'); box(7,12,3,1,3,1,'#493322');
    box(8,14,-3,2,1,1,'#493322'); box(8,14,3,2,1,1,'#493322');
    box(-10,7,0,2,1,1,'#493322'); legs(box);
  }); wings(bee);
  const fly=model('default');
  pixels(fly,(box)=>{
    box(-8,5,-3,8,5,7,(x,y)=>x%3===0?'#49392e':y>2?'#a98650':'#755638');
    box(-7,10,-2,6,1,5,'#9e7b4b');
    box(0,5,-3,5,7,7,'#645646'); box(5,6,-4,5,6,9,'#83755c');
    box(7,7,-5,3,4,2,'#c94531'); box(7,7,4,3,4,2,'#c94531');
    box(9,10,-5,1,1,1,'#ffb18a'); box(9,10,5,1,1,1,'#ffb18a'); legs(box);
  }); wings(fly);
  const bug=model('ladybug');
  pixels(bug,(box)=>{
    box(-7,4,-5,13,3,11,'#30302b');
    box(-8,7,-5,13,3,11,'#c93231'); box(-7,10,-4,11,2,9,'#ee5140');
    box(-5,12,-3,7,1,7,'#f96b4c'); box(-8,10,0,13,1,1,'#452e28');
    for(const x of [-5,0]) for(const z of [-3,3]) box(x,12,z,2,1,2,'#30272a');
    box(5,5,-3,4,5,7,'#323234'); face(box,9,7,-3);face(box,9,7,1); legs(box);
  });
  const fire=model('firefly');
  pixels(fire,(box)=>{
    box(-9,5,-3,6,5,7,'#d8f779'); box(-8,10,-2,4,1,5,'#f4ffc4');
    box(-3,5,-3,7,6,7,'#365449'); box(-2,11,-2,5,1,5,'#527563');
    box(4,6,-3,5,5,7,'#33433b');face(box,9,7,-3);face(box,9,7,1);legs(box);
  }); wings(fire);
  for(const [name,body,head,wing,accent] of [
    ['parrot','#dd5548','#ed6b51','#3c9fac','#ffc857'],
    ['sparrow','#937451','#795638','#75583f','#e7d5ab'],
  ]) {
    const bird=model(name);
    pixels(bird,(box)=>{
      box(-5,4,-3,10,8,7,body); box(-4,12,-2,8,2,5,body);
      box(2,12,-3,6,6,7,head); box(3,18,-2,4,1,5,head);
      box(5,7,-2,1,5,5,accent);
      box(7,14,-3,1,3,3,'#fff1ce');box(7,14,1,1,3,3,'#fff1ce');
      box(8,15,-2,1,2,1,'#252c30');box(8,15,2,1,2,1,'#252c30');
      box(8,12,-1,3,2,3,accent);box(10,11,-1,1,1,3,accent);
      for(let i=0;i<7;i++) box(-6-i,5-Math.floor(i/3),-2,1,1,5,i>3?wing:body);
      for(const side of [-1,1]) {box(1,1,side*2,1,3,1,'#b78642');box(1,1,side*2,3,1,1,'#b78642');}
    }); wings(bird,true,[wing,accent]);
  }
  const jet=model('jet');
  pixels(jet,(box)=>{
    box(-10,6,-2,20,3,5,'#8a9fae');box(-8,9,-1,15,1,3,'#c6d5de');
    box(10,6,-1,4,2,3,'#c6d5de');box(14,6,0,2,1,1,'#e4edef');
    box(1,10,-1,6,2,3,'#426783');box(2,12,0,4,1,1,'#8cdbef');
    for(const side of [-1,1]) for(let z=3;z<14;z++) {
      box(-Math.floor(z*.65),6,side*z,Math.max(2,10-Math.floor(z*.55)),1,1,z>11?'#e59a45':'#99adbb');
    }
    box(-9,9,0,5,5,1,'#637b90');box(-8,14,0,3,1,1,'#a8bccc');
    for(const side of [-1,1]) {box(-10,5,side*2,3,3,2,'#3b4857');box(-11,6,side*2,1,1,2,'#ffa35c');}
  });
  function setStyle(name) {for(const [key,group] of Object.entries(models)) group.visible=key===name;}
  setStyle('default');
  return {root,setStyle,animate(time,playing){
    for(const {pivot,side,bird} of animations) pivot.rotation.x=side*(bird?-.18:.14)+(playing?Math.sin(time*(bird?9:45))*side*(bird?.32:.24):0);
  }};
}
