import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements=new Map();const el=id=>elements.get(id)||elements.set(id,{disabled:true,style:{},getContext:()=>({}),addEventListener(){},querySelector:()=>({})}).get(id);
const view={setFarm(){},setExpansion(){},collect(){}};
const context=vm.createContext({document:{getElementById:el,addEventListener(){}},localStorage:{getItem:()=>null},createNeuronView:()=>({reset(){}}),createWorld:()=>view,setInterval(){},requestAnimationFrame(){},fetch:()=>new Promise(()=>{}),console,Math});
vm.runInContext(fs.readFileSync('dist/app.js','utf8').replace(/^import .*;$/gm,''),context);
const run=s=>vm.runInContext(s,context);
run('ready=true; score=499; $("buy-fly").onclick()');assert.equal(run('companions.length'),0);
run('score=5500; $("buy-fly").onclick()');assert.equal(run('score'),5000);assert.equal(run('companions.length'),1);assert.equal(run('free(companions[0].x,companions[0].y)'),true);
run('$("next-farm").onclick()');assert.equal(run('score'),0);assert.equal(run('farmStage'),1);assert.equal(run('companions.length'),1);
run('score=6000; $("next-farm").onclick()');assert.equal(run('score'),6000);
run('foods=[{x:companions[0].x,y:companions[0].y}];moveCompanions(0)');assert.equal(run('score'),6001);
console.log('구매 잔액, 안전 생성, 밀밭 전환, 중복 결제 방지, 공동 수집 검증 통과');

run('score=10000; for(let i=0;i<10;i++) $("buy-fly").onclick()');
assert.equal(run('companions.length'),4);
assert.equal(run('score'),8500);
console.log('최대 5마리 제한 및 초과 구매 시 잔액 보존 검증 통과');
