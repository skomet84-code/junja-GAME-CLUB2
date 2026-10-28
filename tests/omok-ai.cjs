'use strict';
const assert=require('node:assert/strict');
const {selectMove}=require('../omok-ai');
const rules=require('../omok-engine');
const board=(moves)=>{const b=rules.fresh();for(const [x,y,c] of moves)b[y][x]=c;return b;};
function checked(b,c,description){
 const start=Date.now(),move=selectMove(b,c,{timeMs:240});
 assert.ok(move,description+' returns a move');
 assert.ok(rules.inside(move.x,move.y),description+' within board');
 const playable=b.map(row=>row.slice());
 assert.equal(rules.place(playable,move.x,move.y,c).ok,true,description+' obeys Renju');
 assert.ok(Date.now()-start<6000,description+' is bounded');
 return {move,board:playable};
}
const opener=checked(board([]),1,'black opener');
assert.deepEqual([opener.move.x,opener.move.y],[7,7],'open at center');
const finish=checked(board([[3,7,2],[4,7,2],[5,7,2],[6,7,2]]),2,'finish open white four');
assert.equal(rules.winningLine(finish.board,finish.move.x,finish.move.y,2)?.length>=5,true,'AI takes instant win');
const blocked=checked(board([[3,7,2],[4,7,2],[5,7,2],[6,7,2]]),1,'defend white four');
assert.ok([2,7].every((v,i)=>[blocked.move.x,blocked.move.y][i]===v)||
          [7,7].every((v,i)=>[blocked.move.x,blocked.move.y][i]===v),'AI blocks opponent immediate win');
const forbidden=board([[6,7,1],[8,7,1],[7,6,1],[7,8,1],[4,4,2]]);
const m=checked(forbidden,1,'black double-three avoidance').move;
assert.notDeepEqual([m.x,m.y],[7,7],'AI does not attempt forbidden 3-3');
const whiteForbidden=forbidden.map(row=>row.map(v=>v===0?0:3-v));
const wm=checked(whiteForbidden,2,'white double-three avoidance').move;
assert.notDeepEqual([wm.x,wm.y],[7,7],'white AI does not attempt forbidden 3-3');
const forkBoard=board([[4,7,2],[5,7,2],[6,7,2]]);
const forkStart=Date.now();
const forkMove=selectMove(forkBoard,2,{timeMs:900});
assert.ok(forkMove,'AI finds a forced attack');
assert.ok([[3,7],[7,7]].some(([x,y])=>forkMove.x===x&&forkMove.y===y),'AI converts open three to double-ended four');
assert.ok(Date.now()-forkStart<3300,'forcing tactic is time bounded');
console.log('OMOK_EXTREME_AI_TEST_OK: center, instant win, threat block, legal Renju, time bound');

// Tactical regression: force a double-ended / crossing four instead of playing randomly.
const complex=board([[4,7,2],[5,7,2],[6,7,2],[7,4,2],[7,5,2],[7,6,2]]);
const copy=JSON.stringify(complex);
const tactical=selectMove(complex,2,{timeMs:800});
assert.deepEqual([tactical.x,tactical.y],[7,7],'AI creates a double forcing threat at the crossing');
assert.equal(JSON.stringify(complex),copy,'AI must not mutate the original board');
assert.equal(tactical.reason,'vcf','AI proves the immediate forced tactical continuation');
const middle=board([[7,7,1],[8,8,2],[8,7,1],[6,7,2],[5,5,1],[6,5,2],[9,9,1],[5,8,2],[9,7,1],[10,6,2],[7,6,1],[4,4,2]]);
const middleCopy=JSON.stringify(middle),middleMove=selectMove(middle,1,{timeMs:600});
assert.ok(middleMove,'AI completes bounded middlegame analysis');
assert.equal(rules.place(middle,middleMove.x,middleMove.y,1).ok,true,'AI middlegame move is legal');
assert.notEqual(JSON.stringify(middle),middleCopy,'chosen move can be played');
console.log('OMOK_TACTICAL_SEARCH_OK: crossing-four, forced-VCF, board isolation, middlegame');
