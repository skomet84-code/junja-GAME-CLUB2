'use strict';
// Server-authoritative 15x15 omok. Renju: black 3-3, 4-4 and overline are forbidden.
const SIZE=15,DIRS=[[1,0],[0,1],[1,1],[1,-1]];
const inside=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<SIZE&&y>=0&&y<SIZE;
const fresh=()=>Array.from({length:SIZE},()=>Array(SIZE).fill(0));
const cell=(b,x,y)=>inside(x,y)?b[y][x]:-1;
function segment(b,x,y,dx,dy,color){
  let a=0,z=0;
  while(cell(b,x-(a+1)*dx,y-(a+1)*dy)===color)a++;
  while(cell(b,x+(z+1)*dx,y+(z+1)*dy)===color)z++;
  const line=[];for(let k=-a;k<=z;k++)line.push([x+k*dx,y+k*dy]);
  return line;
}
const overline=(b,x,y)=>DIRS.some(([dx,dy])=>segment(b,x,y,dx,dy,1).length>5);
function winningLine(b,x,y,color){
  for(const [dx,dy] of DIRS){
    const line=segment(b,x,y,dx,dy,color);
    if(color===1?line.length===5:line.length>=5)return line;
  }return null;
}
function winningEndpoint(b,x,y){
  if(cell(b,x,y)!==0)return false;
  b[y][x]=1;
  const ok=!overline(b,x,y)&&!!winningLine(b,x,y,1);
  b[y][x]=0;return ok;
}
function fourGroups(b,x,y){
  const seen=new Set();
  for(const [dx,dy] of DIRS)for(let offset=-4;offset<=0;offset++){
    const coords=Array.from({length:5},(_,i)=>[x+(offset+i)*dx,y+(offset+i)*dy]);
    const stones=coords.filter(([cx,cy])=>cell(b,cx,cy)===1);
    const spaces=coords.filter(([cx,cy])=>cell(b,cx,cy)===0);
    if(stones.length!==4||spaces.length!==1||!stones.some(([cx,cy])=>cx===x&&cy===y))continue;
    if(!winningEndpoint(b,...spaces[0]))continue;
    seen.add(stones.map(([cx,cy])=>cy*SIZE+cx).sort((a,b)=>a-b).join(','));
  }
  return seen.size;
}
function openThreeGroups(b,x,y){
  const groups=new Set();
  for(const [dx,dy] of DIRS)for(let k=-4;k<=4;k++){
    if(!k)continue;
    const xx=x+k*dx,yy=y+k*dy;
    if(cell(b,xx,yy)!==0)continue;
    b[yy][xx]=1;
    const valid=!overline(b,xx,yy)&&!winningLine(b,xx,yy,1)&&fourGroups(b,xx,yy)<=1;
    if(valid)for(let offset=-5;offset<=0;offset++){
      const row=Array.from({length:6},(_,i)=>[x+(offset+i)*dx,y+(offset+i)*dy]);
      if(cell(b,...row[0])!==0||cell(b,...row[5])!==0)continue;
      const mid=row.slice(1,5);
      if(!mid.every(([cx,cy])=>cell(b,cx,cy)===1))continue;
      if(!mid.some(([cx,cy])=>cx===x&&cy===y)||!mid.some(([cx,cy])=>cx===xx&&cy===yy))continue;
      if(!winningEndpoint(b,...row[0])||!winningEndpoint(b,...row[5]))continue;
      const three=mid.filter(([cx,cy])=>cx!==xx||cy!==yy);
      groups.add(three.map(([cx,cy])=>cy*SIZE+cx).sort((a,b)=>a-b).join(','));
    }
    b[yy][xx]=0;
  }
  return groups.size;
}
// JUNJA LAND house rule: even semi-open and split-three crossings are forbidden for black.
// The classic open-three detector above is retained for full Renju validation.
function threeThreatDirections(b,x,y){
  let count=0;
  for(const [dx,dy] of DIRS){
    let found=false;
    for(let offset=-3;offset<=0&&!found;offset++){
      const row=Array.from({length:4},(_,i)=>[x+(offset+i)*dx,y+(offset+i)*dy]);
      const stones=row.filter(([cx,cy])=>cell(b,cx,cy)===1);
      const gaps=row.filter(([cx,cy])=>cell(b,cx,cy)===0);
      if(stones.length!==3||gaps.length!==1||!stones.some(([cx,cy])=>cx===x&&cy===y))continue;
      const [xx,yy]=gaps[0];
      b[yy][xx]=1;
      const canExtend=!overline(b,xx,yy)&&!winningLine(b,xx,yy,1)&&
        [offset-1,offset+4].some(k=>winningEndpoint(b,x+k*dx,y+k*dy));
      b[yy][xx]=0;
      if(canExtend)found=true;
    }
    if(found)count++;
  }
  return count;
}
// Preserve strict house 3-3 for attacks, but do not punish a black defence
// that blocks an adjacent white line of three or more unless true Renju 3-3.
function blocksWhiteRun(b,x,y){
  for(const [dx,dy] of DIRS)for(const sign of [-1,1]){
    let n=0;
    while(cell(b,x+(n+1)*dx*sign,y+(n+1)*dy*sign)===2)n++;
    if(n>=3)return true;
  }
  return false;
}
function place(b,x,y,color){
  if(!inside(x,y)||![1,2].includes(color))return {ok:false,error:'착수 위치가 올바르지 않습니다.'};
  if(b[y][x]!==0)return {ok:false,error:'이미 돌이 놓인 자리입니다.'};
  b[y][x]=color;
  // RIF Renju rule 9.2: a simultaneous exact-five claim takes precedence.
  const line=winningLine(b,x,y,color);
  if(line)return {ok:true,win:true,line};
  if(color===1&&overline(b,x,y)){b[y][x]=0;return {ok:false,error:'흑돌 장목(6목 이상)은 금수입니다.'};}
  if(color===1){
    if(fourGroups(b,x,y)>=2){b[y][x]=0;return {ok:false,error:'흑돌 4-4 금수입니다.'};}
    if(openThreeGroups(b,x,y)>=2||(threeThreatDirections(b,x,y)>=2&&!blocksWhiteRun(b,x,y))){b[y][x]=0;return {ok:false,error:'흑돌 3-3 금수입니다.'};}
  }
  return {ok:true,win:false,draw:b.every(row=>row.every(v=>v!==0))};
}
module.exports={SIZE,DIRS,inside,fresh,segment,winningLine,place,overline,fourGroups,openThreeGroups,threeThreatDirections,blocksWhiteRun};
