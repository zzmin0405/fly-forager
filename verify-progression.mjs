import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements=new Map();const el=id=>elements.get(id)||elements.set(id,{disabled:true,style:{},getContext:()=>({}),addEventListener(){},querySelector:()=>({})}).get(id);
const view={setFoodTier(){},setFarm(){},setExpansion(){},collect(){}};
const context=vm.createContext({document:{getElementById:el,addEventListener(){}},localStorage:{getItem:()=>null},createNeuronView:()=>({reset(){}}),createWorld:()=>view,setInterval(){},requestAnimationFrame(){},fetch:()=>new Promise(()=>{}),console,Math});
vm.runInContext(fs.readFileSync('dist/app.js','utf8').replace(/^import .*;$/gm,''),context);
const run=s=>vm.runInContext(s,context);
run('ready=true; score=499; $("buy-fly").onclick()');assert.equal(run('companions.length'),0);
run('score=5500; $("buy-fly").onclick()');assert.equal(run('score'),5000);assert.equal(run('companions.length'),1);assert.equal(run('free(companions[0].x,companions[0].y)'),true);
run('$("next-farm").onclick()');assert.equal(run('score'),0);assert.equal(run('farmStage'),1);assert.equal(run('companions.length'),1);
run('score=6000; $("next-farm").onclick()');assert.equal(run('score'),6000);
run('foods=[{x:companions[0].x,y:companions[0].y}];moveCompanions(0)');assert.equal(run('score'),6001);
console.log('구매 잔액, 안전 생성, 밀밭 전환, 중복 결제 방지, 공동 수집 검증 통과');

run('farmStage=0;score=10000; for(let i=0;i<10;i++) $("buy-fly").onclick()');
assert.equal(run('companions.length'),4);
assert.equal(run('score'),8500);
console.log('최대 5마리 제한 및 초과 구매 시 잔액 보존 검증 통과');
// 울타리와 장애물 사이에서 위치는 그대로, 방향만 변하는 상황을 재현한다.
run('worldLevel=0; obstacles.splice(0,obstacles.length,{x:150,y:330,r:48}); bot={x:60,y:330,a:0};');
run('for(let i=0;i<100;i++){bot.a+=.2;recoverMovement(bot,.02)}');
assert.ok(run('Math.hypot(bot.x-60,bot.y-330)>10'));
assert.equal(run('free(bot.x,bot.y)'),true);
run('const trappedFriend={x:60,y:330,a:0}; companions=[trappedFriend]; for(let i=0;i<100;i++){trappedFriend.a+=.2;recoverMovement(trappedFriend,.02)}');
assert.ok(run('Math.hypot(companions[0].x-60,companions[0].y-330)>10'));
assert.equal(run('free(companions[0].x,companions[0].y)'),true);
run('worldLevel=3;randomizeObstacles(19)');
assert.equal(run('obstacles.every(o=>{const b=arenaBounds();return o.x-o.r-b.minX>=95 && b.maxX-o.x-o.r>=95 && o.y-o.r-b.minY>=95 && b.maxY-o.y-o.r>=95})'),true);
console.log('본체와 추가 초파리의 제자리 회전 탈출 검증 통과');
run('worldLevel=0;obstacles.splice(0);bot={x:500,y:330,a:0};companions=[{x:500,y:330,a:0,escape:0},{x:500,y:330,a:0,escape:0}];for(let i=0;i<150;i++)separateFlies(.02)');
assert.equal(run('[bot,...companions].every((f,i,all)=>all.every((g,j)=>i===j||Math.hypot(f.x-g.x,f.y-g.y)>60))'),true);
run('foods=[{x:100,y:100},{x:800,y:100},{x:800,y:550}];moveCompanions(0)');
assert.equal(run('companions[0].target !== companions[1].target'),true);
console.log('완전 겹침 분리 및 개체별 먹이 목표 분배 검증 통과');

run('score=999;$("upgrade-food").onclick()'); assert.equal(run('foodTier'),1);
run('score=4000;$("upgrade-food").onclick()'); assert.equal(run('foodTier'),2);assert.equal(run('score'),3000);
run('$("upgrade-food").onclick()');assert.equal(run('foodTier'),3);assert.equal(run('score'),0);
run('score=6000;$("upgrade-food").onclick()');assert.equal(run('score'),6000);
run('companions=[{x:500,y:330,a:0,escape:0}];foods=[{x:500,y:330}];moveCompanions(0)');assert.equal(run('score'),6003);
console.log('먹이 단계별 가격, 최대 단계, 가치 3 지급 검증 통과');

run('farmStage=1;worldLevel=3;obstacles.splice(0);companions=[];score=10000;for(let i=0;i<15;i++) $("buy-fly").onclick()');
assert.equal(run('companions.length'),9);
assert.equal(run('score'),5500);
console.log('밀밭 10마리 한도 및 초과 구매 차감 방지 검증 통과');

run('ready=true;paused=false;worldLevel=3;obstacles.splice(0);foodCapacity=100;foods=Array.from({length:100},()=>({x:500,y:330}));autoFeed()');
assert.equal(run('foodCapacity'),101);assert.equal(run('foods.length'),101);
run('foodCapacity=499;foods=Array.from({length:499},()=>({x:500,y:330}));autoFeed();autoFeed()');
assert.equal(run('foodCapacity'),500);assert.equal(run('foods.length'),500);
run('foods.pop();autoFeed()');assert.equal(run('foodCapacity'),500);assert.equal(run('foods.length'),500);
run('paused=true;foods.pop();autoFeed()');assert.equal(run('foods.length'),499);
console.log('자동 먹이 한도 증가·500개 상한·보충·일시정지 검증 통과');
