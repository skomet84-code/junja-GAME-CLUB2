/* Royal Sichuan: deterministic, DOM-free rules shared by gameplay and tests. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.RoyalSichuan=api;})(globalThis,()=>{
'use strict';
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,random=Math.random){for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function path(board,cols,rows,a,b,ignoreKind=false){
 if(a===b||!board[a]||!board[b]||(!ignoreKind&&board[a]!==board[b]))return null;
 const start=[a%cols+1,Math.floor(a/cols)+1],end=[b%cols+1,Math.floor(b/cols)+1];
 const free=(x,y)=>(x===end[0]&&y===end[1])||x===0||y===0||x===cols+1||y===rows+1||!board[(y-1)*cols+x-1];
 const dirs=[[1,0],[0,1],[-1,0],[0,-1]],q=[],seen=new Map();
 for(let d=0;d<4;d++)q.push({x:start[0],y:start[1],d,t:0,p:[start]});
 for(let head=0;head<q.length;head++){
  const n=q[head];for(let d=0;d<4;d++){
   const t=n.t+(d!==n.d?1:0);if(t>2)continue;
   const x=n.x+dirs[d][0],y=n.y+dirs[d][1];if(x<0||y<0||x>cols+1||y>rows+1||!free(x,y))continue;
   const p=n.p.concat([[x,y]]);if(x===end[0]&&y===end[1])return p;
   const key=(y*(cols+2)+x)*4+d;if(seen.has(key)&&seen.get(key)<=t)continue;seen.set(key,t);q.push({x,y,d,t,p});
  }
 }
 return null;
}
function moves(board,cols,rows,firstOnly=false){const out=[];for(let a=0;a<board.length;a++){if(!board[a])continue;for(let b=a+1;b<board.length;b++){if(board[a]!==board[b])continue;const p=path(board,cols,rows,a,b);if(p){out.push({a,b,path:p});if(firstOnly)return out;}}}return out;}
// Remove geometric pairs on a fully occupied mask; assign matching identities
// in that removal order. Replaying solution always clears the static board.
function arrange(mask,cols,rows,kinds,random=Math.random){
 const occupancy=mask.map(v=>v?1:0),board=mask.map(()=>0),solution=[];
 const pairs=shuffle(kinds.slice(),random);let pair=0;
 while(occupancy.some(Boolean)){
  const indexes=shuffle(occupancy.map((v,i)=>v?i:-1).filter(i=>i>=0),random);let chosen=null;
  for(const a of indexes){for(const b of indexes){if(a===b)continue;if(path(occupancy,cols,rows,a,b,true)){chosen=[a,b];break;}}if(chosen)break;}
  if(!chosen)throw new Error('Invalid board mask');
  const[a,b]=chosen;board[a]=board[b]=pairs[pair++];occupancy[a]=occupancy[b]=0;solution.push([a,b]);
 }
 return{board,solution};
}
function config(level){level=Math.max(1,Math.min(24,Math.floor(level)));const world=Math.floor((level-1)/6),step=(level-1)%6;return{level,world,cols:6,rows:8+(step>=2?2:0)+(step>=4?2:0),types:Math.min(12,6+world*2+Math.floor(step/2)),seconds:180+step*12-world*12,gravity:world===1?'down':world===3?'up':null,comboWindow:world===2?4000:6000,seal:step===5};}
function create(level,seed){const c=config(level),random=rng(seed),mask=Array(c.cols*c.rows).fill(1);if((level-1)%6===1|| (level-1)%6===4){for(const row of[2,c.rows-3])for(const col of[2,3])mask[row*c.cols+col]=0;}
 const kinds=Array.from({length:mask.filter(Boolean).length/2},(_,i)=>i%c.types+1);return{...c,...arrange(mask,c.cols,c.rows,kinds,random)};}
function towerConfig(floor){
 floor=Math.max(25,Math.floor(Number(floor)||25));
 const depth=floor-25,phase=depth%6,cycle=Math.floor(depth/6);
 const rows=phase<2?10:12,gravity=phase===2?'down':phase===4?'up':null;
 return{level:floor,floor,world:depth%4,cols:6,rows,types:Math.min(12,8+Math.floor(depth/4)),seconds:Math.max(105,210-Math.floor(depth/3)*6),gravity,comboWindow:Math.max(3200,5200-cycle*180),seal:(floor%10===0),tower:true};
}
function createTower(floor,seed){
 const c=towerConfig(floor),random=rng(seed),mask=Array(c.cols*c.rows).fill(1),phase=(floor-25)%6;
 if(phase===1||phase===4){for(const row of[2,c.rows-3])for(const col of[2,3])mask[row*c.cols+col]=0;}
 if(phase===3){for(let y=2;y<c.rows-2;y+=3){mask[y*c.cols]=0;mask[y*c.cols+c.cols-1]=0;}}
 const kinds=Array.from({length:mask.filter(Boolean).length/2},(_,i)=>i%c.types+1);
 return{...c,...arrange(mask,c.cols,c.rows,kinds,random)};
}
function compact(board,cols,rows,direction){if(!direction)return board.slice();const out=board.map(()=>0);for(let x=0;x<cols;x++){const values=[];for(let y=0;y<rows;y++)if(board[y*cols+x])values.push(board[y*cols+x]);const offset=direction==='down'?rows-values.length:0;values.forEach((v,y)=>out[(y+offset)*cols+x]=v);}return out;}
function reshuffle(board,cols,rows,random=Math.random){const counts=new Map();for(const v of board)if(v)counts.set(v,(counts.get(v)||0)+1);const kinds=[];for(const[v,n]of counts){if(n%2)throw new Error('Unpaired tile');for(let i=0;i<n/2;i++)kinds.push(v);}return arrange(board,cols,rows,kinds,random).board;}
function dateKey(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function dateSeed(key){let seed=0;for(const c of key)seed=(Math.imul(seed,31)+c.charCodeAt(0))|0;return seed>>>0;}
return{rng,path,moves,arrange,config,create,towerConfig,createTower,compact,reshuffle,dateKey,dateSeed};
});
