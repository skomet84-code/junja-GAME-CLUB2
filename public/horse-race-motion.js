'use strict';
// The order comes exclusively from the server. These curves only visualize
// the already-decided order consistently for every client watching the round.
(function(root,factory){
 const result=factory();
 if(typeof module==='object'&&module.exports)module.exports=result;
 if(root)root.JunjaHorseMotion=result;
})(typeof window!=='undefined'?window:null,function(){
 const TIMES=[0,.2,.4,.6,.76,.86,1];
 const NORMAL=[
  [0,.22,.43,.65,.80,.92,1],
  [0,.18,.40,.61,.75,.84,.90],
  [0,.20,.38,.56,.70,.77,.82],
  [0,.17,.34,.52,.63,.70,.75],
  [0,.19,.33,.49,.60,.65,.69],
  [0,.15,.30,.46,.56,.61,.63],
  [0,.13,.27,.43,.53,.56,.57]
 ];
 const COMEBACK=[
  [0,.13,.29,.45,.69,.90,1],
  [0,.23,.44,.65,.79,.85,.90],
  [0,.20,.42,.60,.72,.79,.82],
  [0,.18,.37,.53,.64,.71,.75],
  [0,.19,.34,.50,.60,.67,.69],
  [0,.16,.31,.47,.56,.61,.63],
  [0,.14,.27,.43,.52,.57,.57]
 ];
 const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
 function hashRound(id){
  let h=2166136261>>>0;
  for(const ch of String(id||'ROUND'))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
  return h;
 }
 function isComeback(id){return hashRound(id)%5===0;}
 function progress(id,rank,at){
  const t=clamp(at),n=Math.max(0,Math.min(6,Math.trunc(rank)||0));
  const frames=(isComeback(id)?COMEBACK:NORMAL)[n];
  if(t>=1)return frames[frames.length-1];
  let i=0;while(i<TIMES.length-2&&t>TIMES[i+1])i++;
  const part=(t-TIMES[i])/(TIMES[i+1]-TIMES[i]);
  // Tiny deterministic stride variation without falsifying the finish order.
  const seed=hashRound(id)+n*37;
  const gait=Math.sin(t*30+seed%17)*.0025*Math.sin(Math.PI*t);
  return clamp(frames[i]+(frames[i+1]-frames[i])*part+gait);
 }
 function standings(id,order,t){
  return (order||[]).map((h,rank)=>({id:h.id,name:h.name,officialRank:rank+1,progress:progress(id,rank,t)}))
    .sort((a,b)=>b.progress-a.progress||a.officialRank-b.officialRank);
 }
 return {hashRound,isComeback,progress,standings};
});
