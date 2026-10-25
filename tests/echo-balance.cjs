'use strict';
const fs=require('fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('public/junja-survival-20261007.js','utf8');
const state=new Map(),nodes=new Map(),events={};
function node(id){if(!nodes.has(id)){const classes=new Set();const n={id,style:{},textContent:'',children:[],
  classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,v)=>{if(v)classes.add(x);else classes.delete(x)}},
  appendChild(n){this.children.push(n)},set innerHTML(v){this.children=[]},get innerHTML(){return ''},
  removeAttribute(){},addEventListener(){},setPointerCapture(){},
  getContext:()=>new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(a,k)=>a[k]||(()=>{})})};nodes.set(id,n)}return nodes.get(id)}
const m=Object.create(Math);m.random=()=>.5;
const context={Math:m,console,document:{getElementById:node,createElement:()=>node('elt'+nodes.size),addEventListener:()=>{}},
 localStorage:{getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v)},innerWidth:390,innerHeight:844,
 devicePixelRatio:2,addEventListener:(k,fn)=>events[k]=fn,requestAnimationFrame:()=>{},setTimeout:()=>{},
 performance:{now:()=>0}};
vm.createContext(context);vm.runInContext(code,context);
const run=s=>vm.runInContext(s,context);
assert.equal(run('ECHO_BALANCE.baseXp'),95);
assert.equal(run('ECHO_BALANCE.normalDrop'),.14);
assert.equal(run('ECHO_BALANCE.eliteDrop'),.45);
run('reset();gainXp(500)');
assert.equal(run('level'),4,'500 XP should award three early skill choices');
assert.equal(run('pendingLevels'),3);
while(run('pendingLevels'))nodes.get('choices').children[0].onclick();
assert.equal(run('run'),true);
run('reset();dropItem({x:110,y:190,boss:false,elite:false})');
assert.equal(run('items.length'),0,'non-boss drop remains rare');
run('dropItem({x:120,y:220,boss:true,elite:false})');
assert.equal(run('items.length'),1,'boss has reliable reward');
assert.equal(run('items[0].type'),'fever');
run('dropItem({x:120,y:220,boss:true,elite:false})');
assert.equal(run('items.length'),2);
run('profile.metaLevel=42;profile.totalKills=1;end(false)');
assert.equal(run('profile.metaLevel'),42,'existing earned record level must never reset');
assert.ok(state.has('junja_echo_profile_v1'),'unchanged save key');
run('reset();wave=12;enemy()');
assert.ok(run('enemies.length>0'));
run('updateHud();draw();drawItems()');
const lobby=fs.readFileSync('public/junja-echo-20261005-2122.html','utf8');
assert.ok(lobby.includes('/junja-survival-20261007.js?v=20261025-echo3'),'active route must use upgraded engine');
for(const id of ['bossStatus','bossHPBar','waveCountdown','pauseOverlay','score','playerNick'])assert.ok(lobby.includes('id="'+id+'"'),'HUD node '+id);
run("reset();currentPlayer={id:84,name:'햅피'};runPlayerName='햅피';score=15400;end(false)");
assert.equal(run('ranking[0].name'),'햅피','authenticated nickname is stored instead of static JUNJA');
assert.equal(run('ranking[0].userId'),84,'record has player id');
assert.ok(nodes.get('overText').textContent.includes('햅피님의 이번 기록'),'result shows player nickname');
assert.equal(nodes.get('score').textContent,run('score').toLocaleString('ko-KR'),'live score HUD follows result');
assert.ok(lobby.includes('href="/"'),'casino lobby return link visible');
run('backToLobbyEl.onclick()');
assert.equal(nodes.get('start').classList.contains('open'),true,'can leave finished game without reloading');
run('reset();wave=5;enemy();t=5*WAVE_SECONDS-.005;spawn=100;update(.035)');
assert.equal(run('wave'),5,'boss blocks next wave until defeated');
run('enemies.find(e=>e.boss).hp=0;update(.035)');
assert.equal(run('wave'),6,'next wave unlocks after boss kill');
console.log('ECHO_BALANCE_OK: boosted skill progression, boss wave gate, player-name score records, live HUD, lobby exit, preserved profile');
