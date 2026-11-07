'use strict';
// Deterministic, presentation-only football choreography. Match outcomes and
// goal counts remain exclusively authoritative in /api/jpl/status.
(function(root){
 const formation=[[.065,.50],[.20,.14],[.20,.38],[.20,.62],[.20,.86],[.37,.16],[.37,.42],[.37,.58],[.37,.84],[.58,.34],[.58,.67]];
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const mix=(a,b,t)=>a+(b-a)*t;
 const ease=t=>t*t*(3-2*t);
 const norm=t=>((t%1)+1)%1;
 const round=v=>Math.round(v*1e6)/1e6;
 function frame({seconds=0,minute=0,seed=25,playing=false,finished=false,events=[]}={}){
  seconds=Math.max(0,Number(seconds)||0);
  minute=clamp(Number(minute)||0,0,90);
  const phase=Math.floor(seconds/2.15);
  const progress=ease(norm(seconds/2.15));
  const side=phase%2===0?'H':'A';
  // The carrier and receiver exchange the ball continuously, rather than a
  // disconnected sine-wave ball orbit. No random generator or mutable state.
  const carrier=5+(phase%6),receiver=5+((phase+2)%6);
  const position=(s,i)=>{
   const p=formation[i],home=s==='H';
   let x=home?p[0]:1-p[0],y=home?p[1]:1-p[1];
   const t=seconds*.85+seed*.00017;
   if(i>0){
    const advance=(s===side?1:-1)*(home?1:-1);
    x+=advance*(.06*Math.sin(t*.56+i*.67)+.025*Math.sin(t*1.43+i));
    y+=.036*Math.sin(t*1.16+i*1.7);
    if(i===carrier&&s===side)x+=(home?1:-1)*.045;
    if(i===receiver&&s===side)x+=(home?1:-1)*.07;
   }else{y+=.035*Math.sin(t*.6);x+=.012*Math.cos(t*.5)}
   return {x:round(clamp(x,.028,.972)),y:round(clamp(y,.048,.952))};
  };
  const players={H:formation.map((_,i)=>position('H',i)),A:formation.map((_,i)=>position('A',i))};
  const from=players[side][carrier],to=players[side][receiver];
  let ball={x:mix(from.x,to.x,progress),y:mix(from.y,to.y,progress),lift:playing?Math.sin(progress*Math.PI)*.026:0};
  let highlight=null;
  // Only events that the backend has already published can influence visuals.
  const latest=events.filter(e=>Number.isFinite(e.minute)&&e.minute<=minute)
   .slice().sort((a,b)=>a.minute-b.minute).at(-1);
  if(playing&&latest&&minute-latest.minute<=2){
   if(latest.kind==='GOAL'){
    const attackRight=latest.side==='H';
    const elapsed=clamp((minute-latest.minute)/2,0,1);
    ball={x:attackRight?.968:.032,y:.5+.06*Math.sin(seconds*4),lift:.025+elapsed*.025};
    highlight={kind:'GOAL',side:latest.side,minute:latest.minute,player:latest.player||''};
   }else if(latest.kind==='SHOT'||latest.kind==='SAVE'){
    const attackRight=latest.side==='H';
    ball={x:attackRight?.88:.12,y:.5+.14*Math.sin(seconds*1.8),lift:.038};
    highlight={kind:latest.kind,side:latest.side,minute:latest.minute,player:''};
   }
  }
  // A completed match freezes its playfield instead of an endless ball chase.
  if(finished){ball={x:.5,y:.5,lift:0};highlight=null}
  return {players,ball:{x:round(ball.x),y:round(ball.y),lift:round(ball.lift)},side,carrier,receiver,highlight,
   playing:!!playing&&!finished,finished:!!finished};
 }
 const api={frame};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.JPLBroadcastMotion=api;
})(typeof window!=='undefined'?window:globalThis);
