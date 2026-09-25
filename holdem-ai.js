'use strict';

// Bounded, heads-up equity search. Only our hole cards and the public board
// enter this module: never the real opponent cards or the server's deck.
const RANKS='23456789TJQKA', SUITS='SHDC';
const deck=()=>[...SUITS].flatMap(s=>[...RANKS].map(r=>r+s));
const value=c=>RANKS.indexOf(c[0])+2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function straight(values){
  const set=new Set(values);if(set.has(14))set.add(1);
  for(let hi=14;hi>=5;hi--)if([0,1,2,3,4].every(d=>set.has(hi-d)))return hi;
  return 0;
}
function rank(cards){
  const counts=Array(15).fill(0), suits={S:[],H:[],D:[],C:[]};
  for(const c of cards){counts[value(c)]++;suits[c[1]].push(value(c));}
  const vals=[];for(let v=14;v>=2;v--)if(counts[v])vals.push(v);
  const flush=Object.values(suits).find(a=>a.length>=5), sf=flush&&straight(flush);
  const four=vals.find(v=>counts[v]===4), trips=vals.filter(v=>counts[v]>=3),pairs=vals.filter(v=>counts[v]>=2);
  let result;
  if(sf)result=[8,sf];
  else if(four)result=[7,four,vals.find(v=>v!==four)];
  else if(trips.length&&pairs.some(v=>v!==trips[0]))result=[6,trips[0],pairs.find(v=>v!==trips[0])];
  else if(flush)result=[5,...flush.sort((a,b)=>b-a).slice(0,5)];
  else if(straight(vals))result=[4,straight(vals)];
  else if(trips.length)result=[3,trips[0],...vals.filter(v=>v!==trips[0]).slice(0,2)];
  else if(pairs.length>=2)result=[2,...pairs.slice(0,2),vals.find(v=>!pairs.slice(0,2).includes(v))];
  else if(pairs.length)result=[1,pairs[0],...vals.filter(v=>v!==pairs[0]).slice(0,3)];
  else result=[0,...vals.slice(0,5)];
  let score=0;for(let i=0;i<6;i++)score=score*15+(result[i]||0);
  return score;
}
function holeQuality(hole){
  const [hi,lo]=hole.map(value).sort((a,b)=>b-a), suited=hole[0][1]===hole[1][1];
  if(hi===lo)return .5+(hi-2)*.04;
  return clamp(.13+(hi-2)*.028+(lo-2)*.018+(suited?.055:0)+(hi-lo===1?.04:0)+(hi===14?.055:0)-(hi-lo>4?.04:0),.1,.86);
}
function rangeWeight(hole,board,pressure,looseness){
  if(pressure<=0)return 1;
  let strength=holeQuality(hole);
  if(board.length>=3){
    const score=rank([...hole,...board]),category=Math.floor(score/15**5);
    strength=[.12,.45,.7,.84,.9,.94,.97,.99,1][category];
    // A pair entirely on the board is not a made hand advantage.
    if(category===1&&!hole.some(c=>board.some(b=>value(b)===value(c)))&&value(hole[0])!==value(hole[1]))strength=.2;
    if(board.length<5){
      const cards=[...hole,...board];
      if(SUITS.split('').some(s=>cards.filter(c=>c[1]===s).length===4))strength=Math.max(strength,.43);
      const v=new Set(cards.map(value));if(v.has(14))v.add(1);
      for(let hi=5;hi<=14;hi++)if([0,1,2,3,4].filter(d=>v.has(hi-d)).length===4)strength=Math.max(strength,.36);
    }
  }
  const tight=pressure>1?.64:pressure>.45?.48:.3;
  const valueWeight=clamp((strength-tight)*3+.2,.025,1);
  // Repeated public aggression widens the range; it never reveals a hand.
  return looseness+(1-looseness)*valueWeight;
}
function estimate(input,rng=Math.random,samples=512){
  const known=new Set([...input.hole,...input.board]);
  const unknown=deck().filter(c=>!known.has(c));
  let won=0,total=0,squared=0;
  for(let n=0;n<samples;n++){
    const pool=unknown.slice();
    const take=()=>{const i=Math.floor(rng()*pool.length);const c=pool[i];pool[i]=pool[pool.length-1];pool.pop();return c;};
    const opp=[take(),take()], board=input.board.slice();
    const weight=rangeWeight(opp,board,input.pressure||0,input.looseness??.12);
    while(board.length<5)board.push(take());
    const a=rank([...input.hole,...board]),b=rank([...opp,...board]);
    const result=a>b?1:a===b?.5:0;
    won+=weight*result;squared+=weight*result*result;total+=weight;
  }
  const equity=won/total;
  return {equity,uncertainty:Math.sqrt(Math.max(0,squared/total-equity*equity)/samples)};
}
function equity(input,rng=Math.random,samples=512){return estimate(input,rng,samples).equity;}
function decide(input,rng=Math.random){
  const {hole,board,stack,roundBet,currentBet,minRaise,bigBlind,opponentStack,opponentRoundBet}=input;
  const call=Math.min(stack,Math.max(0,currentBet-roundBet));
  // Exclude an opponent's uncallable excess from the pot odds.
  const excess=Math.max(0,opponentRoundBet-(roundBet+stack));
  const pot=Math.max(1,input.pot-excess),beforeBet=Math.max(bigBlind,pot-call);
  const pressure=call/beforeBet, odds=call/(pot+call);
  const result=estimate({...input,pressure},rng),eq=result.equity,quality=holeQuality(hole);
  const maxTo=roundBet+stack,minTo=currentBet+minRaise;
  const canRaise=opponentStack>0&&maxTo>=minTo;
  // A small estimation margin prevents marginal, enormous calls. Draws and
  // short-stack calls still continue when their pot odds justify them.
  const margin=call>0?Math.min(result.uncertainty*2,(board.length===5?.018:.035)+(pressure>1?.025:0)):0;
  if(call>0&&eq<odds+margin)return {action:'fold',equity:eq};
  const roll=rng(), inPosition=!!input.inPosition;
  const valueBet=eq>(board.length===0?.62:.67);
  const valueRaise=eq>.76;
  const bluff=call===0&&board.length>0&&eq<.4&&roll<(inPosition?.075:.035);
  const semiBluff=call===0&&board.length>0&&board.length<5&&eq>=.4&&roll<.23;
  const open=board.length===0&&call<=bigBlind&&quality>.56&&roll<.72;
  if(canRaise&&((valueBet&&call===0&&roll<.9)||(valueRaise&&call>0&&roll<.72)||bluff||semiBluff||open)){
    const size=board.length===0?Math.max(bigBlind*2,call*2):Math.max(bigBlind,Math.floor((pot+call)*(eq>.82?.8:.55)));
    const target=Math.min(maxTo,Math.max(minTo,currentBet+size));
    return {action:'raise',raiseTo:Math.floor(target),equity:eq};
  }
  return {action:call?'call':'check',equity:eq};
}
// Called only after a legal public action. Counts hands, not repeated raises
// within one hand, so a single betting sequence cannot poison the model.
function observe(room,hand,action){
  let p=room.holdemOpponent;
  if(!p)p=room.holdemOpponent={hands:8,aggressive:2,lastHand:null,raised:false};
  if(p.lastHand!==hand){p.lastHand=hand;p.hands=p.hands*.96+1;p.aggressive*=.96;p.raised=false;}
  if(action==='raise'&&!p.raised){p.aggressive++;p.raised=true;}
}
module.exports={decide,equity,rank,holeQuality,observe};
