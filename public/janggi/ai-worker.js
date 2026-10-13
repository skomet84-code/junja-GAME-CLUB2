/* JUNJA LAND Janggi AI - background worker, iterative alpha-beta search. */
'use strict';
importScripts('/janggi/engine.js');
const R=self.JanggiRules;
let start=0,deadline=0,nodes=0;
function evaluate(board,side){
 let score=0;
 for(let y=0;y<10;y++)for(let x=0;x<9;x++){
  const p=board[y][x];if(!p)continue;
  let v=R.VAL[p.t];
  if(p.t==='soldier')v+=p.s==='c'?(9-y)*11:y*11;
  if(p.t==='horse'||p.t==='cannon')v+=Math.max(0,4-Math.abs(4-x))*7;
  score+=(p.s===side?1:-1)*v;
 }
 return score;
}
function ordered(board,moves){
 return moves.sort((a,b)=>{
  const capture=m=>board[m.ty][m.tx]?.t;
  const av=capture(a),bv=capture(b);
  return (bv?R.VAL[bv]*10:0)-(av?R.VAL[av]*10:0)+(b.score||0)-(a.score||0);
 });
}
function visit(board,side,depth,alpha,beta,ply){
 if(++nodes%128===0&&Date.now()>deadline)throw Error('THINK_TIMEOUT');
 if(depth<=0)return evaluate(board,side);
 const moves=ordered(board,R.legal(board,side));
 if(!moves.length)return R.checked(board,side)?-50000+ply:0;
 let best=-Infinity;
 for(const move of moves){
  const val=-visit(R.moved(board,move),R.ENEMY(side),depth-1,-beta,-alpha,ply+1);
  if(val>best)best=val;
  if(best>alpha)alpha=best;
  if(alpha>=beta)break;
 }
 return best;
}
function choose(board,side,difficulty){
 const moves=ordered(board,R.legal(board,side));
 if(!moves.length)return null;
 if(difficulty==='easy')return moves[Math.floor(Math.random()*Math.min(8,moves.length))];
 const budget=difficulty==='hard'?1700:360;
 const maxDepth=difficulty==='hard'?4:2;
 start=Date.now();deadline=start+budget;nodes=0;
 let best=moves[0],bestScore=-Infinity;
 for(let depth=1;depth<=maxDepth;depth++){
  let candidate=best,top=-Infinity,alpha=-Infinity,completed=true;
  const priority=[best,...moves.filter(m=>m!==best)];
  try{
   for(const m of priority){
    if(Date.now()>deadline)throw Error('THINK_TIMEOUT');
    const val=-visit(R.moved(board,m),R.ENEMY(side),depth-1,-Infinity,-alpha,1);
    if(val>top){top=val;candidate=m;}
    if(val>alpha)alpha=val;
   }
  }catch(e){if(e.message!=='THINK_TIMEOUT')throw e;completed=false;}
  if(completed){best=candidate;bestScore=top;}
  else break;
  if(Math.abs(top)>48000)break;
 }
 return {...best,analysis:{depth:maxDepth,nodes,score:bestScore,time:Date.now()-start}};
}
self.onmessage=e=>{
 try{
  const {board,side,difficulty}=e.data;
  const move=choose(board,side,difficulty||'normal');
  self.postMessage({type:'done',move});
 }catch(error){self.postMessage({type:'error',message:String(error.message||error)});}
};
