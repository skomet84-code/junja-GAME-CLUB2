'use strict';
const assert=require('node:assert/strict');
const E=require('../public/sichuan/engine');
const board=(c,r,entries)=>{const b=Array(c*r).fill(0);for(const[i,v]of entries)b[i]=v;return b;};
assert.ok(E.path([1,1],2,1,0,1));
assert.equal(E.path([1,2],2,1,0,1),null);
assert.equal(E.path([1],1,1,0,0),null);
assert.ok(E.path([1,2,1],3,1,0,2),'outside-board two-turn path');
const blocked=Array(25).fill(2);blocked[6]=blocked[18]=1;assert.equal(E.path(blocked,5,5,6,18),null);
assert.ok(E.path(board(4,4,[[0,1],[10,1]]),4,4,0,10));
// Independent exhaustive direction-walk oracle for small boards.
function oracle(b,c,r,a,z){if(a===z||!b[a]||b[a]!==b[z])return false;const target=[z%c+1,Math.floor(z/c)+1];const walk=(x,y,dir,turns,visited)=>{if(x===target[0]&&y===target[1])return true;for(let d=0;d<4;d++){const t=turns+(dir>=0&&dir!==d?1:0);if(t>2)continue;const nx=x+[1,0,-1,0][d],ny=y+[0,1,0,-1][d];if(nx<0||ny<0||nx>c+1||ny>r+1)continue;const id=ny*(c+2)+nx;if(visited.has(id))continue;const end=nx===target[0]&&ny===target[1];if(!end&&nx>0&&nx<=c&&ny>0&&ny<=r&&b[(ny-1)*c+nx-1])continue;const next=new Set(visited);next.add(id);if(walk(nx,ny,d,t,next))return true;}return false;};const x=a%c+1,y=Math.floor(a/c)+1;return walk(x,y,-1,0,new Set([y*(c+2)+x]));}
for(let seed=1;seed<=80;seed++){const rand=E.rng(seed),b=Array.from({length:12},()=>Math.floor(rand()*3));for(let a=0;a<12;a++)for(let z=a+1;z<12;z++)assert.equal(!!E.path(b,4,3,a,z),oracle(b,4,3,a,z));}
for(let level=1;level<=24;level++)for(let seed=1;seed<=12;seed++){
 const g=E.create(level,seed),b=g.board.slice();assert.equal(b.filter(Boolean).length%2,0);for(const[a,z]of g.solution){assert.ok(E.path(b,g.cols,g.rows,a,z),`solution level ${level}`);b[a]=b[z]=0;}assert.ok(b.every(v=>!v));
 let live=g.board.slice(),turn=0;while(live.some(Boolean)){let m=E.moves(live,g.cols,g.rows,true)[0];if(!m){live=E.reshuffle(live,g.cols,g.rows,E.rng(seed+turn));m=E.moves(live,g.cols,g.rows,true)[0];}assert.ok(m);live[m.a]=live[m.b]=0;live=E.compact(live,g.cols,g.rows,g.gravity);assert.ok(++turn<=g.board.length/2);}
}
assert.deepEqual(E.create(9,123),E.create(9,123));
assert.deepEqual(E.compact([1,0,0,2,3,0],2,3,'down'),[0,0,1,0,3,2]);
assert.deepEqual(E.compact([1,0,0,2,3,0],2,3,'up'),[1,2,3,0,0,0]);
assert.equal(E.dateKey(new Date('2026-09-27T14:59:59Z')),'2026-09-27');assert.equal(E.dateKey(new Date('2026-09-27T15:00:00Z')),'2026-09-28');
console.log('SICHUAN_ENGINE_OK: oracle comparisons, 288 boards solved, gravity, deadlocks, deterministic daily and KST boundary');
