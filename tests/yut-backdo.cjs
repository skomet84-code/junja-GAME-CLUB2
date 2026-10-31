'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('server.js','utf8');
const ctx={now:()=>1,clampInt:(n,a,b)=>Math.max(a,Math.min(b,n)),orderedPlayers:r=>r.players};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('const YUT_SIDE_COLORS='),source.indexOf('// ---------- Solo Hold'))+'\n'+source.slice(source.indexOf('function soloYutPhysicalPieces'),source.indexOf('function soloYutThrowFor')),ctx);
const fresh=()=>ctx.yutNewPiece(),piece=(node,prev)=>({node,route:'outer',path:[{node:prev,route:'outer'}]});
const back={move:-1,name:'빽도',backdo:true};
for(const [node,prev,target] of [['O1','READY','START'],['O3','O2','O2'],['A4','CA','CB'],['B4','CB','CA'],['O16','O15','O15']]){
 const own=[piece(node,prev),piece(node,prev),fresh(),fresh()],enemy=[piece(target,'O1'),piece(target,'O1'),fresh(),fresh()];
 const s={pending:[back],awaitingThrow:false,captureBonus:0,sides:{user:own,bot:enemy},turn:'user',replay:[]};
 ctx.soloYutMoveSide(s,'user',0);
 assert.equal(s.last.captured.length,2);assert.equal(s.turn,'user');assert.equal(s.awaitingThrow,true);
 assert.equal(s.sides.bot[0].node,'READY');assert.equal(s.sides.bot[1].node,'READY');
 const r={players:[{userId:1},{userId:2}],yut:{phase:'playing',turnIndex:0,pending:[back],awaitingThrow:false,captureBonus:0,sides:[{id:'a',playerIds:[1],pieces:[piece(node,prev),fresh(),fresh(),fresh()]},{id:'b',playerIds:[2],pieces:[piece(target,'O1'),piece(target,'O1'),fresh(),fresh()]}]}};
 ctx.yutMove(r,1,0);
 assert.equal(r.yut.last.captured.length,2);assert.equal(r.yut.turnIndex,0);assert.equal(r.yut.awaitingThrow,true);
}
const home=ctx.yutAdvance(piece('O1','READY'),-1).piece;
assert.equal(home.node,'START');assert.equal(ctx.yutAdvance(home,-1).piece.node,'O20');
assert.equal(ctx.yutAdvance(home,1).piece.node,'FINISH');
assert.equal(ctx.yutAdvance(fresh(),-1).legal,false);
console.log('YUT_BACKDO_OK: solo/multiplayer HOME, ordinary, center, stacks, extra throw, HOME exit');
