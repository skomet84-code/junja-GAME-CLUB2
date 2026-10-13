'use strict';
// Extreme (bounded) tactical search for 15x15 Renju, isolated in a worker.
// This is a handcrafted engine, not a pretrained or provably unbeatable model.
const rules=require('./omok-engine');
const {SIZE,DIRS}=rules;
const WIN=100000000;
const clock=()=>Date.now();
const near=(b)=>{
  const seen=new Uint8Array(SIZE*SIZE),a=[];
  let stones=0;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(b[y][x]){
    stones++;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const xx=x+dx,yy=y+dy;
      if(xx<0||yy<0||xx>=SIZE||yy>=SIZE||b[yy][xx])continue;
      const k=yy*SIZE+xx;
      if(!seen[k]){seen[k]=1;a.push([xx,yy]);}
    }
  }
  return stones?a:[[7,7]];
};
function patternScore(b,x,y,c){
  if(b[y][x])return -WIN;
  let score=0,open4=0,four=0,three=0;
  b[y][x]=c;
  for(const [dx,dy] of DIRS){
    let line='';
    for(let i=-5;i<=5;i++){
      const xx=x+dx*i,yy=y+dy*i;
      line+=xx<0||yy<0||xx>=SIZE||yy>=SIZE?'O':b[yy][xx]===c?'X':b[yy][xx]===0?'.':'O';
    }
    let length=1;
    for(let k=1;k<=5&&line[5-k]==='X';k++)length++;
    for(let k=1;k<=5&&line[5+k]==='X';k++)length++;
    if(length>=5){score+=(c===2||length===5?WIN:0);continue;}
    const fourOpen=line.includes('.XXXX.');
    const fourBroken=/XX\.XX|X\.XXX|XXX\.X/.test(line);
    const fourClosed=/\.XXXX|XXXX\./.test(line);
    const threeOpen=/\.XXX\.|\.XX\.X\.|\.X\.XX\./.test(line);
    const threeBlocked=/\.XXX|XXX\.|\.XX\.|\.X\.X\./.test(line);
    if(fourOpen){score+=520000;open4++;}
    else if(fourBroken||fourClosed){score+=85000;four++;}
    else if(threeOpen){score+=11000;three++;}
    else if(threeBlocked)score+=2000;
    else if(/\.XX\.|\.X\.X\./.test(line))score+=360;
    else if(/\.X\./.test(line))score+=60;
  }
  b[y][x]=0;
  if(open4>=1)score+=600000;
  if(open4+four>=2)score+=1000000;
  if(three>=2)score+=100000;
  if((open4+four)>=1&&three>=1)score+=85000;
  return score;
}
function legal(b,x,y,c){
  const result=rules.place(b,x,y,c);
  if(result.ok)b[y][x]=0;
  return result;
}
function ordered(b,color,limit,deadline,full=false){
  const other=3-color;
  const list=near(b).map(([x,y])=>{
    const attack=patternScore(b,x,y,color);
    const defense=patternScore(b,x,y,other);
    const proximity=14-(Math.abs(x-7)+Math.abs(y-7));
    return {x,y,attack,defense,rank:attack*1.07+defense*1.15+proximity};
  });
  list.sort((a,b)=>b.rank-a.rank || a.y-b.y || a.x-b.x);
  const found=[];
  // For black check real Renju legality rather than guessing forbidden patterns.
  const scan=full?list.length:Math.min(list.length,Math.max(limit*2,15));
  for(let i=0;i<scan;i++){
    if(clock()>deadline)break;
    const m=list[i];
    if(color===1&&!legal(b,m.x,m.y,color).ok)continue;
    found.push(m);
    if(!full&&found.length>=limit)break;
  }
  return found;
}
function evaluate(b,color,deadline){
  const raw=near(b);
  let best=0,second=0,enemy=0,enemySecond=0;
  for(const [x,y] of raw){
    if(clock()>deadline)break;
    const a=patternScore(b,x,y,color),d=patternScore(b,x,y,3-color);
    if(a>best){second=best;best=a;}else if(a>second)second=a;
    if(d>enemy){enemySecond=enemy;enemy=d;}else if(d>enemySecond)enemySecond=d;
  }
  return best+second*.15-enemy*1.16-enemySecond*.17;
}

function immediateWins(b,side,deadline,cap=4){
  const wins=[];
  for(const [x,y] of near(b)){
    if(clock()>deadline)break;
    if(patternScore(b,x,y,side)<WIN)continue;
    const result=legal(b,x,y,side);
    if(result.ok&&result.win){
      wins.push({x,y});
      if(wins.length>=cap)break;
    }
  }
  return wins;
}
function selectMove(original,color,opts={}){
  const b=original.map(row=>row.slice());
  const budget=Math.max(30,Math.min(3400,Number(opts.timeMs)||2800));
  const deadline=clock()+budget;
  const legalMoves=ordered(b,color,16,deadline,true);
  if(!legalMoves.length)return null;
  const enemy=3-color;
  // A direct five is mandatory. Defend every immediate opponent five before searching.
  const myWins=immediateWins(b,color,deadline,3);
  if(myWins.length)return {...myWins[0],reason:'five',depth:0};
  const enemyWinning=immediateWins(b,enemy,deadline,4);
  if(enemyWinning.length){
    const blockers=new Set(enemyWinning.map(m=>m.x+SIZE*m.y));
    const block=legalMoves.filter(m=>blockers.has(m.x+SIZE*m.y))
      .sort((a,b)=>b.attack-a.attack)[0];
    if(block)return {x:block.x,y:block.y,reason:'block-five',depth:0};
  }
  // Screen self-inflicted one-move losses and search for an unanswerable double-ended four.
  const candidates=legalMoves.slice(0,14);
  const safe=[];
  const tacticalDeadline=Math.min(deadline,clock()+Math.max(300,Math.min(800,budget*.30)));
  for(const m of candidates){
    if(clock()>=tacticalDeadline)break;
    const result=rules.place(b,m.x,m.y,color);
    if(!result.ok)continue;
    let opponentThreats=[],fork=[];
    try{
      opponentThreats=immediateWins(b,enemy,tacticalDeadline,1);
      if(!opponentThreats.length)fork=immediateWins(b,color,tacticalDeadline,2);
    }finally{b[m.y][m.x]=0;}
    if(!opponentThreats.length){
      safe.push(m);
      if(fork.length>=2)return {x:m.x,y:m.y,reason:'forced-double-threat',depth:0};
    }
  }
  const searchCandidates=safe.length?[
    ...safe,...candidates.filter(m=>!safe.includes(m)).slice(0,Math.max(0,12-safe.length))
  ].slice(0,12):candidates.slice(0,12);
  const cache=new Map();let nodes=0;
  function search(side,depth,alpha,beta,lastWin){
    if(lastWin)return -WIN-depth*1000;
    if(depth<=0)return evaluate(b,side,deadline);
    if(clock()>deadline)throw Error('time');
    const key=depth+':'+side+':'+b.map(row=>row.join('')).join('');
    if(cache.has(key))return cache.get(key);
    const options=ordered(b,side,depth>=3?7:6,deadline);
    if(!options.length)return 0;
    let value=-Infinity;
    for(const m of options){
      if(clock()>deadline)throw Error('time');
      const result=rules.place(b,m.x,m.y,side);
      if(!result.ok)continue;
      nodes++;
      let score;
      try{score=result.win?WIN+depth*1000:-search(3-side,depth-1,-beta,-alpha,false);}
      finally{b[m.y][m.x]=0;}
      value=Math.max(value,score);alpha=Math.max(alpha,score);
      if(alpha>=beta)break;
    }
    if(value===-Infinity)value=0;
    // Only exact scores may be cached; bounds from cutoffs are not reusable.
    if(alpha<beta&&cache.size<3000)cache.set(key,value);
    return value;
  }
  let best=searchCandidates[0],completed=0;
  for(const depth of [1,2,3,4,5,6]){
    if(clock()>deadline)break;
    try{
      let alpha=-Infinity,chosen=best,bestValue=-Infinity;
      const options=[best,...searchCandidates.filter(m=>m!==best)];
      for(const m of options){
        if(clock()>deadline)throw Error('time');
        const play=rules.place(b,m.x,m.y,color);
        if(!play.ok)continue;
        let score;
        try{score=play.win?WIN+depth*1000:-search(enemy,depth-1,-Infinity,-alpha,false);}
        finally{b[m.y][m.x]=0;}
        score+=m.rank*.00001;
        if(score>bestValue){bestValue=score;chosen=m;}
        alpha=Math.max(alpha,bestValue);
      }
      best=chosen;completed=depth;
      if(bestValue>=WIN)break;
    }catch(error){if(error.message!=='time')throw error;break;}
  }
  return {x:best.x,y:best.y,reason:'search',depth:completed,nodes};
}
module.exports={selectMove,patternScore};
