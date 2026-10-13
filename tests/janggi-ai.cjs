'use strict';
const assert=require('node:assert/strict');
const R=require('../public/janggi/engine.js');
const {choose}=require('../public/janggi/ai-worker.js');
const b=Array.from({length:10},()=>Array(9).fill(null));
b[1][4]={s:'h',t:'king'};b[8][4]={s:'c',t:'king'};
b[5][4]={s:'c',t:'soldier'};
b[5][0]={s:'c',t:'rook'};b[3][0]={s:'h',t:'rook'};
const decision=choose(b,'c','hard',{timeMs:280});
assert.ok(decision&&R.isLegal(b,'c',decision),'master engine respects legal moves');
assert.deepEqual([decision.x,decision.y,decision.tx,decision.ty],[0,5,0,3],'master captures undefended rook');
for(const level of ['normal','hard']){
 const start=Date.now();const position=R.fresh();
 const next=choose(position,'c',level,{timeMs:100});
 assert.ok(next&&R.isLegal(position,'c',next),'search returns legal move: '+level);
 assert.ok(Date.now()-start<2100,'search timeout respected: '+level);
}
console.log('JANGGI_MASTER_AI_OK: capture tactics, legality, bounded search');
