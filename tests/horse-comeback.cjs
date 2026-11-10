'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../public/horse-race-motion');
const app=fs.readFileSync('public/app.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),css=fs.readFileSync('public/grand-race-v5.css','utf8');
const order=Array.from({length:7},(_,i)=>({id:i+1,name:'HORSE'+(i+1)}));
let normal=[],comeback=[];
for(let i=0;i<600;i++){
 const id='ROUND-'+i;(M.isComeback(id)?comeback:normal).push(id);
 for(let rank=0;rank<7;rank++){
  let previous=-1;
  for(let p=0;p<=100;p++){
   const t=p/100,val=M.progress(id,rank,t);
   assert.ok(val>=0&&val<=1,'progress bounds '+id+'/'+rank);
   assert.ok(val+0.00001>=previous,'no backward jumps '+id+'/'+rank+'/'+p);
   previous=val;
  }
 }
 const result=M.standings(id,order,1);
 assert.deepEqual(result.map(x=>x.id),order.map(x=>x.id),'finish ranks are server authoritative');
 assert.ok(M.progress(id,0,1)-M.progress(id,1,1)>.07,'winner clearly out front at finish');
 assert.ok(M.progress(id,1,1)-M.progress(id,2,1)>.06,'podium finish spacing');
}
assert.ok(comeback.length>60&&comeback.length<200,'comebacks should be occasional, not every round');
for(const id of comeback.slice(0,20)){
 const earlier=M.standings(id,order,.6),later=M.standings(id,order,.93);
 assert.notEqual(earlier[0].id,order[0].id,'eventual winner should trail at mid race');
 assert.equal(later[0].id,order[0].id,'winner must overtake before the finish');
}
for(const id of normal.slice(0,15))assert.equal(M.standings(id,order,.7)[0].id,1,'normal favorite leader already established');
const a=M.standings(comeback[0],order,.7),b=M.standings(comeback[0],order,.7);assert.deepEqual(a,b,'same race and time => shared visuals');
assert.ok(html.includes('/horse-race-motion.js?v='),'motion helper script loaded before app');
assert.ok(html.indexOf('/horse-race-motion.js')<html.indexOf('/app.js'),'client loads profile before animations');
assert.ok(html.includes('id="horseRaceStandings"'),'new live leaderboard');
assert.ok(app.includes('horsePaintStandings(r,positions,false)'),'live rank list updated by current positions');
assert.ok(app.includes("horsePaintStandings(r,(r.order||[]).map"),'official podium shown after finish');
assert.ok(app.includes('⚡ 막판 대역전!'),'dramatic comeback message');
assert.ok(app.includes('M.progress(r.id,i,1)'),'final positions must preserve rank gaps');
assert.ok(css.includes('@media(max-width:820px)'),'small screen fit');
console.log('HORSE_COMEBACK_OK: 600 seeds, real overtakes, deterministic shared rank, spaced finishes, live top three');
