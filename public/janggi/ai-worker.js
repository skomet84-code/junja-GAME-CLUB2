/* JUNJA LAND Royal Janggi master engine: iterative deepening, TT, quiescence and move ordering.
 * Handcrafted search engine, not an AlphaGo neural model. Safe to run in an isolated Web Worker.
 */
'use strict';
if(typeof importScripts==='function')importScripts('/janggi/engine.js');
const R=typeof module==='object'&&module.exports?require('./engine.js'):self.JanggiRules;
const MATE=10000000,MAX_TT=48000;
const TYPES={king:0,rook:1,cannon:2,horse:3,elephant:4,guard:5,soldier:6};
function moveId(m){return m.x+9*m.y+90*(m.tx+9*m.ty);}
function evaluate(board,side){
 let score=0,attackC=0,attackH=0;
 for(let y=0;y<10;y++)for(let x=0;x<9;x++){
  const p=board[y][x];if(!p)continue;
  let val=R.VAL[p.t],f=p.s==='c'?9-y:y;
  if(p.t==='soldier'){
   val+=f*12 + (4-Math.abs(4-x))*5;
   if(f>4)val+=50;
  }else if(p.t==='horse'){
   val+=(4-Math.abs(4-x))*15+Math.min(3,f)*10;
  }else if(p.t==='elephant'){
   val+= (4-Math.abs(4-x))*5+(p.s==='c'?y:9-y)*3;
  }else if(p.t==='cannon'){
   val+=(4-Math.abs(4-x))*10+Math.min(f,5)*8;
  }else if(p.t==='rook'){
   val+= (4-Math.abs(4-x))*8+Math.min(f,6)*9;
  }else if(p.t==='king'){
   // The king must remain in the palace and avoid exposed files.
   val-= (y===(p.s==='c'?8:1)?0:18);
  }else if(p.t==='guard')val+=p.s==='c'?y*2:(9-y)*2;
  score+=(p.s===side?val:-val);
  if(p.t==='rook'||p.t==='cannon')p.s==='c'?attackC++:attackH++;
 }
 const k=R.kingAt(board,side);
 if(k){
  let shield=0;const f=side==='c'?-1:1;
  for(let dx=-1;dx<=1;dx++){const guard=R.at(board,k[0]+dx,k[1]+f);
   if(guard&&guard.s===side)shield+=guard.t==='guard'?34:20;
  }score+=shield;
 }
 return score;
}
function choose(board,side,difficulty='hard',settings={}){
 const start=Date.now(),hard=difficulty==='hard';
 const budget=Math.max(60,Math.min(8000,Number(settings.timeMs)|| (hard?3900:difficulty==='normal'?1100:120)));
 const deadline=start+budget;
 const maxDepth=hard?9:difficulty==='normal'?5:2;
 const trans=new Map(),history=new Int32Array(8100),killers=Array.from({length:40},()=>[-1,-1]);
 let nodes=0,qnodes=0;
 function timeout(){if(Date.now()>=deadline)throw Error('THINK_TIMEOUT');}
 function order(list,b,ttmove,ply){
  let ordered=list.map(m=>{
   const victim=b[m.ty][m.tx],moving=b[m.y][m.x],k=moveId(m);
   let rank=ttmove===k?15000000:0;
   if(victim)rank+=200000+R.VAL[victim.t]*16-R.VAL[moving.t];
   else {
    rank+=killers[ply]?.[0]===k?85000:killers[ply]?.[1]===k?65000:0;
    rank+=history[k]||0;
   }
   return {m,k,rank,capture:!!victim};
  });
  ordered.sort((a,b)=>b.rank-a.rank);
  return ordered;
 }
 function qsearch(b,toMove,alpha,beta,ply,remaining){
  if((++qnodes&63)===0)timeout();
  const checked=R.checked(b,toMove);
  const stand=evaluate(b,toMove);
  if(!checked){if(stand>=beta)return stand;if(stand>alpha)alpha=stand;}
  if(remaining<=0)return checked?stand-180:stand;
  const all=R.legal(b,toMove);
  if(!all.length)return checked?-MATE+ply:0;
  const options=order(checked?all:all.filter(m=>!!b[m.ty][m.tx]),b,-1,ply);
  if(!options.length)return stand;
  for(const entry of options){
   const val=-qsearch(R.moved(b,entry.m),R.ENEMY(toMove),-beta,-alpha,ply+1,remaining-1);
   if(val>=beta)return val;
   if(val>alpha)alpha=val;
  }
  return alpha;
 }
 function search(b,toMove,depth,alpha,beta,ply,allowReduction=true){
  if((++nodes&63)===0)timeout();
  if(depth<=0)return qsearch(b,toMove,alpha,beta,ply,2);
  const originalAlpha=alpha,key=R.encode(b,toMove);
  const cached=trans.get(key);
  if(cached&&cached.depth>=depth){
   if(cached.flag===0)return cached.score;
   if(cached.flag===1&&cached.score>=beta)return cached.score;
   if(cached.flag===-1&&cached.score<=alpha)return cached.score;
  }
  const checked=R.checked(b,toMove),moves=R.legal(b,toMove);
  if(!moves.length)return checked?-MATE+ply:0;
  const list=order(moves,b,cached?.move??-1,Math.min(ply,39));
  let best=-Infinity,bestMove=-1;
  for(let i=0;i<list.length;i++){
   const entry=list[i],next=R.moved(b,entry.m),opponent=R.ENEMY(toMove);
   let score;
   const reduction=allowReduction&&depth>=4&&!checked&&!entry.capture&&i>=5?1:0;
   if(i===0)score=-search(next,opponent,depth-1,-beta,-alpha,ply+1);
   else{
    // Principal variation search, then full-window re-search only when needed.
    score=-search(next,opponent,depth-1-reduction,-alpha-1,-alpha,ply+1,false);
    if(score>alpha&&reduction)score=-search(next,opponent,depth-1,-alpha-1,-alpha,ply+1,false);
    if(score>alpha&&score<beta)score=-search(next,opponent,depth-1,-beta,-alpha,ply+1);
   }
   if(score>best){best=score;bestMove=entry.k;}
   if(score>alpha)alpha=score;
   if(alpha>=beta){
    if(!entry.capture){
     if(killers[ply]&&killers[ply][0]!==entry.k){killers[ply][1]=killers[ply][0];killers[ply][0]=entry.k;}
     history[entry.k]=Math.min(80000,history[entry.k]+depth*depth*6);
    }
    break;
   }
  }
  if(trans.size>=MAX_TT)trans.clear();
  trans.set(key,{depth,score:best,flag:best<=originalAlpha?-1:best>=beta?1:0,move:bestMove});
  return best;
 }
 const available=R.legal(board,side);
 if(!available.length)return null;
 const opening=order(available,board,-1,0);
 if(difficulty==='easy'){
  const choice=opening[Math.floor(Math.random()*Math.min(8,opening.length))];
  return {...choice.m,analysis:{depth:0,nodes:0,ms:0}};
 }
 let best=opening[0].m,score=-Infinity,completed=0;
 for(let depth=1;depth<=maxDepth;depth++){
  try{
   timeout();let alpha=-Infinity,top=-Infinity,winner=best,seen=0;
   const pv=moveId(best),ordered=order(available,board,pv,0);
   for(const entry of ordered){
    timeout();
    const next=R.moved(board,entry.m),enemy=R.ENEMY(side);
    let val;
    if(seen++===0)val=-search(next,enemy,depth-1,-Infinity,-alpha,1);
    else{
     val=-search(next,enemy,depth-1,-alpha-1,-alpha,1);
     if(val>alpha)val=-search(next,enemy,depth-1,-Infinity,-alpha,1);
    }
    if(val>top){top=val;winner=entry.m;}
    if(val>alpha)alpha=val;
   }
   best=winner;score=top;completed=depth;
   if(Math.abs(top)>MATE-500)break;
  }catch(e){if(e.message!=='THINK_TIMEOUT')throw e;break;}
 }
 return {...best,analysis:{depth:completed,nodes:nodes+qnodes,score,ms:Date.now()-start}};
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function'){
 self.onmessage=e=>{
  try{self.postMessage({type:'done',move:choose(e.data.board,e.data.side,e.data.difficulty||'hard')});}
  catch(err){self.postMessage({type:'error',message:String(err.message||err)});}
 };
}
if(typeof module==='object'&&module.exports)module.exports={choose,evaluate};
