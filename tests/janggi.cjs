'use strict';
const assert=require('node:assert/strict');
const R=require('../public/janggi/engine.js');
const make=()=>Array.from({length:10},()=>Array(9).fill(null));
const p=(s,t)=>({s,t});
const has=(list,x,y,tx,ty)=>list.some(m=>m.x===x&&m.y===y&&m.tx===tx&&m.ty===ty);
const pieceCount=b=>b.flat().filter(Boolean).length;
function kings(b){b[1][4]=p('h','king');b[8][4]=p('c','king');}
function test(){
 const b=R.fresh();
 assert.equal(b.length,10);assert.equal(b[0].length,9);assert.equal(pieceCount(b),32,'each side must start with 16 pieces');
 assert.equal(b[8][4].t,'king');assert.equal(b[1][4].t,'king');
 assert.equal(b[6][0].t,'soldier');assert.equal(b[3][4].s,'h');
 assert.equal(b[9][1].t,'horse');assert.equal(b[9][2].t,'elephant');
 assert.ok(R.legal(b,'c').length>=10);
 assert.ok(has(R.legal(b,'c'),0,6,0,5),'cho soldier must advance');
 assert.ok(has(R.legal(b,'c'),0,6,1,6),'cho soldier must step sideways');
 assert.ok(!has(R.legal(b,'c'),0,6,0,7),'soldier must not go backward');
 assert.ok(has(R.legal(b,'c'),1,9,0,7),'horse first step unobstructed');
 assert.ok(!has(R.legal(b,'c'),1,9,3,8),'horse first step blocked by elephant');
 const moved=R.moved(b,{x:0,y:6,tx:0,ty:5});
 assert.equal(b[6][0].t,'soldier','moving must not mutate original');assert.equal(moved[5][0].t,'soldier');

 let board=make();kings(board);board[5][4]=p('c','horse');
 assert.ok(has(R.pseudo(board,'c'),4,5,6,6));
 board[5][5]=p('c','soldier');
 assert.ok(!has(R.pseudo(board,'c'),4,5,6,6),'horse is blocked by first adjacent square');

 board=make();kings(board);board[5][4]=p('c','elephant');
 assert.ok(has(R.pseudo(board,'c'),4,5,7,7));
 board[6][6]=p('h','soldier');
 assert.ok(!has(R.pseudo(board,'c'),4,5,7,7),'elephant blocked by its second leg');
 board=make();kings(board);board[5][4]=p('c','elephant');board[5][5]=p('c','soldier');
 assert.ok(!has(R.pseudo(board,'c'),4,5,7,7),'elephant blocked by its first leg');

 board=make();kings(board);board[5][0]=p('c','cannon');
 assert.ok(!has(R.pseudo(board,'c'),0,5,0,4),'cannon needs a screen');
 board[4][0]=p('c','soldier');board[2][0]=p('h','rook');
 assert.ok(has(R.pseudo(board,'c'),0,5,0,2),'cannon can jump its own soldier to capture');
 board[2][0]=p('h','cannon');
 assert.ok(!has(R.pseudo(board,'c'),0,5,0,2),'cannon cannot capture another cannon');
 board[4][0]=p('h','cannon');
 assert.ok(!has(R.pseudo(board,'c'),0,5,0,3),'cannon cannot use cannon as screen');

 board=make();kings(board);board[2][3]=p('h','rook');board[1][4]=null;board[0][5]=p('h','king');
 assert.ok(has(R.pseudo(board,'h'),3,2,4,1),'rook moves diagonally into palace center');
 assert.ok(!has(R.pseudo(board,'h'),3,2,5,0),'rook cannot pass own king');

 board=make();kings(board);board[6][3]=p('h','soldier');
 assert.ok(has(R.pseudo(board,'h'),3,6,3,7));
 board[0][4]=null;board[2][3]=p('h','soldier');
 assert.ok(has(R.pseudo(board,'h'),3,2,4,3)===false,'no invalid diagonal outside palace');

 board=make();kings(board);board[5][4]=p('h','rook');
 assert.equal(R.checked(board,'c'),true,'attacked king is in check');
 assert.equal(R.isLegal(board,'c',{x:4,y:8,tx:4,ty:7}),false,'king cannot step into rook check');
 assert.equal(R.isLegal(board,'c',{x:4,y:8,tx:3,ty:8}),true,'king can evade check sideways');

 board=R.fresh({cSwap:true,hSwap:true});
 assert.equal(b[9][1].t,'horse');assert.equal(board[9][1].t,'elephant');
 assert.equal(board[0][2].t,'horse');
 console.log('JANGGI_RULES_OK: initial pieces, 9x10 board, horse/elephant blockers, cannon screens, palace diagonal, king check, soldier direction, setup switch');
}
test();
