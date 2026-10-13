/* JUNJA LAND Janggi: shared 9x10 Korean chess rules, zero external dependencies. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 else root.JanggiRules=api;
})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 const W=9,H=10,CHO='c',HAN='h',ENEMY=s=>s===CHO?HAN:CHO;
 const VAL={king:20000,guard:260,rook:1250,cannon:690,horse:510,elephant:340,soldier:225};
 const INS=(x,y)=>x>=0&&x<9&&y>=0&&y<10;
 const at=(b,x,y)=>INS(x,y)?b[y][x]:null;
 const own=(p,s)=>!!p&&p.s===s;
 const piece=(s,t)=>({s,t});
 function fresh(opts={}){
  const b=Array.from({length:H},()=>Array(W).fill(null));
  for(const s of [HAN,CHO]){
   const back=s===HAN?0:9,king=s===HAN?1:8,cannon=s===HAN?2:7,pawns=s===HAN?3:6;
   let order=['rook','horse','elephant','guard',null,'guard','elephant','horse','rook'];
   if(opts[s+'Swap']){for(const [a,z] of [[1,2],[6,7]])[order[a],order[z]]=[order[z],order[a]];}
   for(let x=0;x<9;x++)if(order[x])b[back][x]=piece(s,order[x]);
   b[king][4]=piece(s,'king');b[cannon][1]=piece(s,'cannon');b[cannon][7]=piece(s,'cannon');
   for(const x of [0,2,4,6,8])b[pawns][x]=piece(s,'soldier');
  }
  return b;
 }
 function palace(x,y,s){return x>=3&&x<=5&&(s===HAN?y>=0&&y<=2:y>=7&&y<=9);}
 function inPalace(x,y){return palace(x,y,HAN)||palace(x,y,CHO);}
 function isCenter(x,y){return x===4&&(y===1||y===8);}
 function isCorner(x,y){return (x===3||x===5)&&(y===0||y===2||y===7||y===9);}
 function diagEdge(x,y,nx,ny){
  if(Math.abs(nx-x)!==1||Math.abs(ny-y)!==1||!inPalace(x,y)||!inPalace(nx,ny))return false;
  return (palace(x,y,HAN)&&palace(nx,ny,HAN)||palace(x,y,CHO)&&palace(nx,ny,CHO))&&(isCenter(x,y)||isCenter(nx,ny));
 }
 function palaceRays(x,y){
  if(!isCenter(x,y)&&!isCorner(x,y))return [];
  const rays=[];
  for(const dx of [-1,1])for(const dy of [-1,1]){
   if(!diagEdge(x,y,x+dx,y+dy))continue;
   const ray=[],a=x+dx,b=y+dy;ray.push([a,b]);
   if(diagEdge(a,b,a+dx,b+dy))ray.push([a+dx,b+dy]);
   rays.push(ray);
  }
  return rays;
 }
 function pseudo(b,side,attack=false){
  const all=[];
  function add(x,y,tx,ty){
   if(!INS(tx,ty))return;
   const target=b[ty][tx];
   if(own(target,side)||target&&target.t==='king'&&!attack)return;
   all.push({x,y,tx,ty,score:target?VAL[target.t]*10-VAL[b[y][x].t]:0});
  }
  function line(x,y,ray,unitType){
   let screen=false;
   for(const [tx,ty] of ray){
    const target=b[ty][tx];
    if(unitType==='cannon'){
     if(!screen){if(target){if(target.t==='cannon')break;screen=true;}continue;}
     if(target&&target.t==='cannon'||own(target,side))break;
     add(x,y,tx,ty);if(target)break;
    }else{
     if(own(target,side))break;
     add(x,y,tx,ty);if(target)break;
    }
   }
  }
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const p=b[y][x];if(!own(p,side))continue;
   switch(p.t){
    case 'rook':case 'cannon':{
     for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const ray=[];let tx=x+dx,ty=y+dy;
      while(INS(tx,ty)){ray.push([tx,ty]);tx+=dx;ty+=dy;}
      line(x,y,ray,p.t);
     }
     for(const ray of palaceRays(x,y))line(x,y,ray,p.t);
     break;
    }
    case 'horse':case 'elephant':{
     for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if(!INS(x+dx,y+dy)||at(b,x+dx,y+dy))continue;
      for(const sign of [-1,1]){
       const x2=x+2*dx+(dy?sign:0),y2=y+2*dy+(dx?sign:0);
       if(p.t==='horse')add(x,y,x2,y2);
       else {
        if(!INS(x2,y2)||at(b,x2,y2))continue;
        const tx=x+3*dx+(dy?2*sign:0),ty=y+3*dy+(dx?2*sign:0);
        add(x,y,tx,ty);
       }
      }
     }
     break;
    }
    case 'guard':case 'king':{
     for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const tx=x+dx,ty=y+dy;
      if(!palace(tx,ty,side))continue;
      if(dx&&dy&&!diagEdge(x,y,tx,ty))continue;
      add(x,y,tx,ty);
     }
     break;
    }
    case 'soldier':{
     const f=side===CHO?-1:1;
     for(const [dx,dy] of [[0,f],[-1,0],[1,0]])add(x,y,x+dx,y+dy);
     for(const dx of [-1,1])if(diagEdge(x,y,x+dx,y+f))add(x,y,x+dx,y+f);
     break;
    }
   }
  }
  return all;
 }
 function moved(b,m){
  const next=b.map(row=>row.slice());next[m.ty][m.tx]=next[m.y][m.x];next[m.y][m.x]=null;return next;
 }
 function kingAt(b,side){
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(b[y][x]?.s===side&&b[y][x]?.t==='king')return [x,y];
  return null;
 }
 function checked(b,side){
  const pos=kingAt(b,side);if(!pos)return true;
  return pseudo(b,ENEMY(side),true).some(m=>m.tx===pos[0]&&m.ty===pos[1]);
 }
 function legal(b,side){
  return pseudo(b,side).filter(m=>!checked(moved(b,m),side));
 }
 function isLegal(b,side,m){
  if(!m||!Number.isInteger(m.x)||!Number.isInteger(m.y)||!Number.isInteger(m.tx)||!Number.isInteger(m.ty))return false;
  return legal(b,side).some(a=>a.x===m.x&&a.y===m.y&&a.tx===m.tx&&a.ty===m.ty);
 }
 function facing(b){
  const a=kingAt(b,HAN),c=kingAt(b,CHO);
  if(!a||!c||a[0]!==c[0])return false;
  for(let y=a[1]+1;y<c[1];y++)if(b[y][a[0]])return false;
  return true;
 }
 function status(b,turn){
  const moves=legal(b,turn),check=checked(b,turn);
  return {turn,check,moves:moves.length,winner:!moves.length&&check?ENEMY(turn):null,draw:!moves.length&&!check};
 }
 function encode(b,turn){return turn+'|'+b.map(row=>row.map(p=>p?(p.s+p.t[0]+(p.t==='cannon'?'a':'')):'.').join(',')).join('/');}
 return {W,H,CHO,HAN,VAL,fresh,pseudo,moved,legal,isLegal,checked,kingAt,facing,status,encode,ENEMY,at,diagEdge};
});
