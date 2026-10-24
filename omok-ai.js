'use strict';
// JUNJA OMOK GOD MODE: Renju-aware proof search, poison-move defense and deep negamax.
// It is NOT a neural/AlphaGo model or a proof of unbeatable play.
const rules=require('./omok-engine');
const {SIZE,DIRS}=rules;
const WIN=100000000, INF=WIN*2;
const time=()=>Date.now();
const id=m=>m.y*SIZE+m.x;
const same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
const PATTERNS={
  openFour:/\.XXXX\./g,
  four:/XX\.XX|X\.XXX|XXX\.X|\.XXXX|XXXX\./g,
  three:/\.XXX\.|\.XX\.X\.|\.X\.XX\./g,
  blocked:/\.XXX|XXX\.|\.XX\.|\.X\.X\./g,
  two:/\.XX\.|\.X\.X\./g,
  one:/\.X\./g
};
function touchesCenter(line,re){
  re.lastIndex=0;let m;
  while((m=re.exec(line))!==null){if(m.index<=5&&m.index+m[0].length>5)return true;}
  return false;
}
function near(b,radius=2){
  const seen=new Uint8Array(225),out=[];let stones=0;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(b[y][x]){
    stones++;
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      const xx=x+dx,yy=y+dy;
      if(xx<0||xx>=SIZE||yy<0||yy>=SIZE||b[yy][xx])continue;
      const k=yy*SIZE+xx;if(!seen[k]){seen[k]=1;out.push({x:xx,y:yy});}
    }
  }
  return stones?out:[{x:7,y:7}];
}
function patternScore(b,x,y,c){
  if(b[y][x])return -WIN;
  b[y][x]=c;let score=0,open4=0,four=0,three=0;
  for(const [dx,dy] of DIRS){
    let line='';
    for(let i=-5;i<=5;i++){
      const xx=x+dx*i,yy=y+dy*i;
      line+=xx<0||xx>=SIZE||yy<0||yy>=SIZE?'O':b[yy][xx]===c?'X':b[yy][xx]===0?'.':'O';
    }
    let count=1;
    for(let k=1;k<=5&&line[5-k]==='X';k++)count++;
    for(let k=1;k<=5&&line[5+k]==='X';k++)count++;
    if(count>=5){score+=(c===2||count===5)?WIN:0;continue;}
    if(touchesCenter(line,PATTERNS.openFour)){score+=580000;open4++;}
    else if(touchesCenter(line,PATTERNS.four)){score+=100000;four++;}
    else if(touchesCenter(line,PATTERNS.three)){score+=17500;three++;}
    else if(touchesCenter(line,PATTERNS.blocked))score+=2300;
    else if(touchesCenter(line,PATTERNS.two))score+=390;
    else if(touchesCenter(line,PATTERNS.one))score+=65;
  }
  b[y][x]=0;
  if(open4)score+=800000;
  if(open4+four>=2)score+=1300000;
  if(three>=2)score+=200000;
  if((open4+four)&&three)score+=130000;
  return score;
}
function possibleFive(b,x,y,c){
  for(const [dx,dy] of DIRS){
    let count=1;
    for(let sign of [-1,1])for(let k=1;k<6;k++){
      const xx=x+dx*k*sign,yy=y+dy*k*sign;
      if(xx<0||yy<0||xx>=SIZE||yy>=SIZE||b[yy][xx]!==c)break;
      count++;
    }
    if(c===1?count===5:count>=5)return true;
  }
  return false;
}
function wins(b,c,deadline,cap=5){
  const found=[];
  for(const m of near(b,1)){
    if(time()>deadline)break;
    if(!possibleFive(b,m.x,m.y,c))continue;
    const p=rules.place(b,m.x,m.y,c);
    if(p.ok){b[m.y][m.x]=0;if(p.win){found.push(m);if(found.length>=cap)break;}}
  }
  return found;
}
function ranked(b,c,limit,deadline,preferred,opts={}){
  let ms=near(b,opts.radius||2);
  if(opts.forced){const keys=new Set(opts.forced.map(id));ms=ms.filter(m=>keys.has(id(m)));}
  const enemy=3-c;
  ms=ms.map(m=>{
    const attack=patternScore(b,m.x,m.y,c),defend=patternScore(b,m.x,m.y,enemy);
    const proximity=15-(Math.abs(m.x-7)+Math.abs(m.y-7));
    const p=(preferred&&same(preferred,m))?20000000:0;
    return {...m,attack,defend,rank:p+attack*1.09+defend*1.15+proximity*8};
  }).sort((a,b)=>b.rank-a.rank||a.y-b.y||a.x-b.x);
  const out=[];
  for(const m of ms){
    if(time()>deadline)break;
    // Only legal black moves may enter the search; never search hypothetical Renju fouls.
    if(c===1){const r=rules.place(b,m.x,m.y,c);if(!r.ok)continue;b[m.y][m.x]=0;}
    out.push(m);
    if(out.length>=limit)break;
  }
  return out;
}
function heuristic(b,c,deadline){
  let a=0,a2=0,d=0,d2=0;
  for(const m of near(b,1)){
    if(time()>deadline)break;
    const s=patternScore(b,m.x,m.y,c),e=patternScore(b,m.x,m.y,3-c);
    if(s>a){a2=a;a=s;}else if(s>a2)a2=s;
    if(e>d){d2=d;d=e;}else if(e>d2)d2=e;
  }
  return Math.max(-WIN+1,Math.min(WIN-1,a+a2*.22-d*1.18-d2*.22));
}
// Proof-oriented VCF: an attacker must threaten a legal five on EVERY attacking move.
// Defending a unique immediate five is forced; 2+ independent winning points force a win.
// VCT-style open-three threats are handled by the regular tactical search, not misreported as proofs.
function findVCF(b,attacker,rounds,deadline){
  const defender=3-attacker,seen=new Set();
  let checked=0;
  function attack(left){
    if(time()>=deadline||++checked>2400)return null;
    const own=wins(b,attacker,deadline,1);
    if(own.length)return own[0];
    if(left===0||wins(b,defender,deadline,1).length)return null;
    // Threat creation is evaluated after the move, rather than inferring a fork from patterns.
    const moves=ranked(b,attacker,11,deadline,null,{radius:2}).filter(m=>m.attack>=65000);
    for(const m of moves){
      if(time()>=deadline)return null;
      const p=rules.place(b,m.x,m.y,attacker);if(!p.ok)continue;
      let successful=false;
      try{
        if(p.win){successful=true;}
        else if(!wins(b,defender,deadline,1).length){
          const goals=wins(b,attacker,deadline,3);
          if(goals.length>=2)successful=true;
          else if(goals.length===1){
            const guard=goals[0],key=left+':'+b.map(r=>r.join('')).join('');
            if(!seen.has(key)){
              seen.add(key);
              const defense=rules.place(b,guard.x,guard.y,defender);
              if(!defense.ok)successful=true;
              else{try{successful=!defense.win&&!!attack(left-1);}finally{b[guard.y][guard.x]=0;}}
            }
          }
        }
      }finally{b[m.y][m.x]=0;}
      if(successful)return m;
    }
    return null;
  }
  return attack(rounds);
}
function selectMove(original,color,opts={}){
  const b=original.map(r=>r.slice());
  const budget=Math.max(40,Math.min(11000,Number(opts.timeMs)||4400));
  const deadline=time()+budget,enemy=3-color;
  let nodes=0,completed=0,reason='search';
  const initial=ranked(b,color,36,deadline,null,{radius:2});
  if(!initial.length)return null;
  const mine=wins(b,color,deadline,2);
  if(mine.length)return {...mine[0],reason:'five',depth:0,nodes};
  const danger=wins(b,enemy,deadline,4);
  if(danger.length){
    const guarded=initial.filter(m=>danger.some(g=>same(g,m)));
    if(guarded.length===1)return {...guarded[0],reason:'block-five',depth:0,nodes};
    if(guarded.length>1)return {...guarded[0],reason:'multiple-threats',depth:0,nodes};
  }
  // Don't consume the main search time on a tactical proof.
  if(budget>=650&&time()<deadline-220){
    const proofDeadline=Math.min(deadline-250, time()+Math.min(1400,budget*.23));
    const forced=findVCF(b,color,5,proofDeadline);
    if(forced)return {...forced,reason:'vcf',depth:0,nodes};
  }
  const root=initial.slice(0,Math.min(18,initial.length));
  // Root candidate screening prevents moving into an immediate loss if an alternative exists.
  let safe=[];
  const preDeadline=Math.min(deadline-150,time()+Math.min(420,budget*.12));
  for(const m of root){
    if(time()>=preDeadline)break;
    const p=rules.place(b,m.x,m.y,color);if(!p.ok)continue;
    let bad=false;
    try{bad=wins(b,enemy,preDeadline,1).length>0;}
    finally{b[m.y][m.x]=0;}
    if(!bad)safe.push(m);
  }
  let candidates=safe.length?[...safe,...root.filter(m=>!safe.includes(m))].slice(0,16):root.slice(0,16);
  // GOD MODE: reject candidate moves that allow a PROVEN opponent four-chain.
  // Each proof includes legal Renju replies and is bounded independently.
  if(budget>=1800&&time()<deadline-900){
    const guardDeadline=Math.min(deadline-850,time()+Math.min(650,budget*.1));
    const poison=new Set();
    for(const m of candidates.slice(0,14)){
      if(time()>=guardDeadline)break;
      const played=rules.place(b,m.x,m.y,color);
      if(!played.ok)continue;
      try{
        if(!played.win&&!played.draw){
          const shortDeadline=Math.min(guardDeadline,time()+90);
          if(findVCF(b,enemy,3,shortDeadline))poison.add(id(m));
        }
      }finally{b[m.y][m.x]=0;}
    }
    if(poison.size&&poison.size<candidates.length){
      const survivors=candidates.filter(m=>!poison.has(id(m)));
      if(survivors.length)candidates=survivors;
    }
  }
  let best=candidates[0];
  let h1=0,h2=0,seed=0x95AC74F3;
  const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  const z1=Array.from({length:450},rnd),z2=Array.from({length:450},rnd);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(b[y][x]){
    const k=(y*SIZE+x)*2+b[y][x]-1;h1^=z1[k];h2^=z2[k];
  }
  const tt=new Map(),history=new Int32Array(450),killers=[];
  function make(m,side){const p=rules.place(b,m.x,m.y,side);if(p.ok){const k=id(m)*2+side-1;h1^=z1[k];h2^=z2[k];}return p;}
  function undo(m,side){b[m.y][m.x]=0;const k=id(m)*2+side-1;h1^=z1[k];h2^=z2[k];}
  function quiesce(side,alpha,beta,ply,ext){
    if(time()>=deadline)throw Error('time');
    const my=wins(b,side,deadline,1);
    if(my.length)return WIN-ply*1000;
    const theirs=wins(b,3-side,deadline,3);
    if(theirs.length>1)return -WIN+ply*1000;
    if(!theirs.length||ext===0)return heuristic(b,side,deadline);
    const m=theirs[0],play=make(m,side);
    if(!play.ok)return -WIN+ply*1000;
    try{return play.win?WIN-ply*1000:-quiesce(3-side,-beta,-alpha,ply+1,ext-1);}
    finally{undo(m,side);}
  }
  function search(side,depth,alpha,beta,ply){
    if(time()>=deadline)throw Error('time');nodes++;
    if(depth<=0)return quiesce(side,alpha,beta,ply,2);
    const key=h1+','+h2+','+side,old=tt.get(key),lo=alpha,hi=beta;
    if(old&&old.depth>=depth){
      if(old.flag==='exact')return old.value;
      if(old.flag==='lower')alpha=Math.max(alpha,old.value);
      if(old.flag==='upper')beta=Math.min(beta,old.value);
      if(alpha>=beta)return old.value;
    }
    const my=wins(b,side,deadline,1);
    if(my.length)return WIN-ply*1000;
    const threatened=wins(b,3-side,deadline,3);
    if(threatened.length>=2)return -WIN+ply*1000;
    let options=ranked(b,side,depth>=6?11:depth>=4?10:depth>=2?8:7,deadline,old?.move||killers[ply],threatened.length?{forced:threatened}:{radius:2});
    if(!options.length)return threatened.length?-WIN+ply*1000:0;
    options.sort((a,b)=>(b.rank+(history[id(b)*2+side-1]||0))-(a.rank+(history[id(a)*2+side-1]||0)));
    let val=-INF,chosen=null;
    for(const m of options){
      if(time()>=deadline)throw Error('time');
      const p=make(m,side);if(!p.ok)continue;
      let v;
      try{v=p.win?WIN-ply*1000:-search(3-side,depth-1,-beta,-alpha,ply+1);}
      finally{undo(m,side);}
      if(v>val){val=v;chosen=m;}
      alpha=Math.max(alpha,val);
      if(alpha>=beta){
        history[id(m)*2+side-1]=Math.min(300000,history[id(m)*2+side-1]+depth*depth*120);
        killers[ply]=m;break;
      }
    }
    if(val===-INF)return 0;
    if(tt.size<18000)tt.set(key,{depth,value:val,flag:val<=lo?'upper':val>=hi?'lower':'exact',move:chosen});
    return val;
  }
  for(let depth=1;depth<=10;depth++){
    if(time()>=deadline)break;
    let chosen=best,bestValue=-INF,alpha=-INF;
    try{
      const opts2=[best,...candidates.filter(m=>!same(m,best))];
      for(const m of opts2){
        if(time()>=deadline)throw Error('time');
        const p=make(m,color);if(!p.ok)continue;
        let v;
        try{v=p.win?WIN:-search(enemy,depth-1,-INF,-alpha,1);}
        finally{undo(m,color);}
        if(v>bestValue){bestValue=v;chosen=m;}
        alpha=Math.max(alpha,v);
      }
      best=chosen;completed=depth;
      if(bestValue>=WIN-20000){reason='forced-search';break;}
    }catch(e){if(e.message!=='time')throw e;break;}
  }
  return {x:best.x,y:best.y,reason,depth:completed,nodes};
}
module.exports={selectMove,patternScore,findVCF};
