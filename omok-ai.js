'use strict';
// Tactical Renju-aware computer opponent. Pure in-memory search: never reads or writes accounts.
const rules=require('./omok-engine');
const N=15, WIN=100000000, DIRS=rules.DIRS;
const other=c=>3-c;
const inBounds=(x,y)=>x>=0&&x<N&&y>=0&&y<N;
function nearby(board){
  const found=new Set();let occupied=0;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(board[y][x]){
    occupied++;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const xx=x+dx,yy=y+dy;
      if(inBounds(xx,yy)&&board[yy][xx]===0)found.add(yy*N+xx);
    }
  }
  if(!occupied)return [{x:7,y:7}];
  return [...found].map(i=>({x:i%N,y:Math.floor(i/N)}));
}
function shapeScore(board,x,y,color){
  if(board[y][x])return -1;
  // Inspect every five-cell window containing the hypothetical stone.
  board[y][x]=color;
  let score=0,winningDirs=0,fours=0,threes=0;
  for(const [dx,dy] of DIRS){
    let best=0,win=false,openFour=false;
    for(let s=-4;s<=0;s++){
      let mine=0,empty=0,blocked=false;
      for(let j=0;j<5;j++){
        const xx=x+(s+j)*dx,yy=y+(s+j)*dy;
        if(!inBounds(xx,yy)){blocked=true;break;}
        const v=board[yy][xx];
        if(v===color)mine++;
        else if(v===0)empty++;
        else {blocked=true;break;}
      }
      if(blocked)continue;
      if(mine===5)win=true;
      else if(mine===4)best=Math.max(best,50000);
      else if(mine===3)best=Math.max(best,1500);
      else if(mine===2)best=Math.max(best,130);
    }
    for(let s=-4;s<=-1;s++){
      let row='';
      for(let j=0;j<6;j++){
        const xx=x+(s+j)*dx,yy=y+(s+j)*dy;
        row+=!inBounds(xx,yy)?'#':board[yy][xx]===color?'X':board[yy][xx]===0?'.':'#';
      }
      if(row==='.XXXX.')openFour=true;
      if(row==='.XXX..'||row==='..XXX.'||row==='.XX.X.'||row==='.X.XX.')best=Math.max(best,7500);
      if(row==='..XX..')best=Math.max(best,400);
    }
    if(win){winningDirs++;best=30000000;}
    else if(openFour)best=350000;
    if(best>=50000)fours++;
    if(best>=7500&&best<50000)threes++;
    score+=best;
  }
  board[y][x]=0;
  if(winningDirs) return 30000000;
  if(fours>=2)score+=350000;
  if(fours&&threes)score+=110000;
  if(threes>=2)score+=30000;
  return score;
}
function isWinningMove(board,x,y,color){
  const result=rules.place(board,x,y,color);
  if(result.ok)board[y][x]=0;
  return result.ok&&result.win===true;
}
function sortedMoves(board,color,limit,forced=null){
  const opponent=other(color);
  const choices=(forced||nearby(board)).filter(p=>board[p.y][p.x]===0);
  const rated=choices.map(p=>{
    const attack=shapeScore(board,p.x,p.y,color);
    const defense=shapeScore(board,p.x,p.y,opponent);
    const center=14-(Math.abs(p.x-7)+Math.abs(p.y-7));
    return {...p,attack,defense,priority:attack*1.12+defense*1.05+center*2};
  }).sort((a,b)=>b.priority-a.priority||b.attack-a.attack);
  const moves=[];
  for(const p of rated){
    const check=rules.place(board,p.x,p.y,color);
    if(!check.ok)continue;
    board[p.y][p.x]=0;
    moves.push({...p,win:!!check.win});
    if(moves.length>=limit)break;
  }
  return moves;
}
function winningSquares(board,color,positions){
  const wins=[];
  for(const p of positions){
    if(shapeScore(board,p.x,p.y,color)<30000000)continue;
    if(isWinningMove(board,p.x,p.y,color))wins.push(p);
  }
  return wins;
}
function evaluate(board,color){
  const positions=nearby(board),opponent=other(color);
  let a1=0,a2=0,b1=0,b2=0;
  for(const p of positions){
    const a=shapeScore(board,p.x,p.y,color);
    const b=shapeScore(board,p.x,p.y,opponent);
    if(a>a1){a2=a1;a1=a;}else if(a>a2)a2=a;
    if(b>b1){b2=b1;b1=b;}else if(b>b2)b2=b;
  }
  // A single unopposed threat is worth more than scattered weak shapes.
  return Math.round(a1+a2*.36-b1*1.1-b2*.4);
}
function choose(board,color,{timeMs=650,maxNodes=2500}={}){
  if(!Array.isArray(board)||board.length!==N||![1,2].includes(color))throw Error('잘못된 AI 대국 상태');
  const candidates=nearby(board);
  if(candidates.length===1&&candidates[0].x===7&&candidates[0].y===7)return {x:7,y:7};
  const ownWins=winningSquares(board,color,candidates);
  if(ownWins.length)return ownWins[0];
  const threats=winningSquares(board,other(color),candidates);
  // If the opponent can win next turn, the AI must answer immediately.
  const forced=threats.length?threats:null;
  let root=sortedMoves(board,color,14,forced);
  if(!root.length)root=sortedMoves(board,color,14);
  if(!root.length)return null;
  if(root.length===1)return {x:root[0].x,y:root[0].y};
  const deadline=Date.now()+Math.max(60,Math.min(1400,timeMs));
  let nodes=0,best=root[0],completed=false;
  const caps=[0,12,7,5,4,3];
  function search(depth,player,alpha,beta,ply){
    if(++nodes>maxNodes||Date.now()>deadline)throw Error('search-budget');
    if(depth===0)return evaluate(board,player);
    const positions=nearby(board);
    // A forced win or forced defense takes priority over positional evaluation.
    const wins=winningSquares(board,player,positions);
    if(wins.length)return WIN+depth;
    const theirs=winningSquares(board,other(player),positions);
    const moves=sortedMoves(board,player,caps[Math.min(ply,5)]||3,theirs.length?theirs:null);
    if(!moves.length)return -WIN+depth;
    let value=-Infinity;
    for(const p of moves){
      const placed=rules.place(board,p.x,p.y,player);
      if(!placed.ok)continue;
      let score;
      try{
        score=placed.win?WIN+depth:placed.draw?0:-search(depth-1,other(player),-beta,-alpha,ply+1);
      }finally{board[p.y][p.x]=0;}
      value=Math.max(value,score);
      alpha=Math.max(alpha,value);
      if(alpha>=beta)break;
    }
    return Number.isFinite(value)?value:evaluate(board,player);
  }
  for(let depth=1;depth<=4;depth++){
    try{
      nodes=0;
      let top=-Infinity,selected=null,alpha=-Infinity;
      const sorted=root.slice().sort((a,b)=>(b===best)-(a===best)||b.priority-a.priority);
      for(const p of sorted.slice(0,depth>=3?10:14)){
        if(Date.now()>deadline)throw Error('search-budget');
        const placed=rules.place(board,p.x,p.y,color);
        if(!placed.ok)continue;
        let value;
        try{
          value=placed.win?WIN+depth:placed.draw?0:-search(depth-1,other(color),-Infinity,-alpha,1);
        }finally{board[p.y][p.x]=0;}
        if(value>top){top=value;selected=p;}
        alpha=Math.max(alpha,top);
      }
      if(selected){best=selected;completed=true;}
      if(top>=WIN-100)break;
    }catch(e){if(e.message!=='search-budget')throw e;break;}
  }
  return {x:best.x,y:best.y};
}
module.exports={choose,shapeScore,nearby};
