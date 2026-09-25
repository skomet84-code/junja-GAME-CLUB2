'use strict';
const {rank}=require('./holdem-ai');
// Receives own cards and opponent's exposed cards only. Stud has separate
// runouts for each player, unlike Hold'em's shared board.
function decide(input,rng=Math.random){
 const {cards,exposed,stack,roundBet,currentBet,minRaise,opponentStack,opponentRoundBet,pot}=input;
 const known=new Set([...cards,...exposed]);
 const unseen=[...'SHDC'].flatMap(s=>[...'23456789TJQKA'].map(r=>r+s)).filter(c=>!known.has(c));
 const call=Math.min(stack,Math.max(0,currentBet-roundBet)),odds=call/Math.max(1,pot+call);
 const pressure=call/Math.max(1,pot-call),loose=input.looseness??.18;
 let wins=0,weight=0,squares=0;
 for(let n=0;n<512;n++){
  const pool=unseen.slice();const take=()=>{const i=Math.floor(rng()*pool.length),c=pool[i];pool[i]=pool[pool.length-1];pool.pop();return c;};
  const opp=exposed.slice();while(opp.length<cards.length)opp.push(take());
  const cat=Math.floor(rank(opp)/15**5),high=Math.max(...opp.map(c=>'23456789TJQKA'.indexOf(c[0])+2));
  const strength=cat===0?(high>=13?.25:.1):cat===1?.5:cat===2?.72:.95;
  const w=call?loose+(1-loose)*Math.max(.025,Math.min(1,(strength-(pressure>1?.55:.3))*3+.2)):1;
  const own=cards.slice();while(own.length<7)own.push(take());while(opp.length<7)opp.push(take());
  const a=rank(own),b=rank(opp),v=a>b?1:a===b?.5:0;wins+=w*v;squares+=w*v*v;weight+=w;
 }
 const equity=wins/weight,uncertainty=Math.sqrt(Math.max(0,squares/weight-equity*equity)/512);
 if(call&&equity<odds+Math.min(.045,2*uncertainty))return {action:'fold',equity};
 const maxTo=Math.min(roundBet+stack,opponentRoundBet+opponentStack),minTo=currentBet+minRaise,roll=rng();
 const value=call?equity>.76:equity>.62;
 const bluff=!call&&cards.length>=4&&equity<.35&&roll<.045;
 const semiBluff=!call&&cards.length<7&&equity>=.4&&roll<.18;
 if(maxTo>currentBet&&(value&&roll<.85||bluff||semiBluff)){
  const size=Math.max(minRaise,Math.floor((pot+call)*(equity>.8?.8:.55)));
  return {action:'raise',raiseTo:Math.min(maxTo,Math.max(minTo,currentBet+size)),equity};
 }
 return {action:call?'call':'check',equity};
}
module.exports={decide};
