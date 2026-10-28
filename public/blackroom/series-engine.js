/* BLACK ROOM serial engine, cases 002–013. Deterministic, storage-safe, no wallet integration. */
(function(root,factory){const E=factory(typeof module==='object'&&module.exports?require('./series-data.js'):root.BlackRoomSeriesData);
 if(typeof module==='object'&&module.exports)module.exports=E;root.BlackRoomSeriesEngine=E;
})(typeof window!=='undefined'?window:{},function(CASES){
 'use strict';const VERSION=1,lookup=new Map(CASES.map(c=>[c.id,c]));
 const own=(v)=>v&&typeof v==='object'&&!Array.isArray(v);
 const unique=(v,valid)=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&valid.includes(x)))]:[];
 const freshCase=()=>({opened:false,scene:0,clues:[],gates:[],theories:[],interviews:[],solved:false,mastered:false,hints:0,misses:0,verdictFails:0,retryAt:0,linkFails:0,linkRetryAt:0,score:0,log:[],replays:0,bestReplayScore:0,lastReplayAt:0,replay:null});
 const fresh=()=>({v:VERSION,cases:{},active:2});
 function cleanCase(data,caseId,forReplay=false){
  const c=lookup.get(caseId),s=freshCase();if(!c||!own(data))return s;
  s.opened=!!data.opened;s.gates=unique(data.gates,['gate1','gate2']);
  if(!s.gates.includes('gate1'))s.gates=[];
  if(!s.gates.includes('gate2'))s.gates=s.gates.filter(x=>x!=='gate2');
  s.clues=unique(data.clues,c.clues.map(x=>x.id));
  if(!s.gates.includes('gate1'))s.clues=s.clues.filter(id=>c.clues.find(x=>x.id===id).scene===0);
  else if(!s.gates.includes('gate2'))s.clues=s.clues.filter(id=>c.clues.find(x=>x.id===id).scene!==2);
  if(!s.clues.includes('e0')||!s.clues.includes('e1'))s.gates=[];
  if(!s.clues.includes('e3')||!s.clues.includes('e4'))s.gates=s.gates.filter(x=>x!=='gate2');
  if(!s.gates.includes('gate1'))s.gates=[]; // cannot unlock second without first
  s.theories=unique(data.theories,c.theories.map(x=>x.id)).filter(id=>c.theories.find(x=>x.id===id).pair.every(p=>s.clues.includes(p)));
  s.interviews=unique(data.interviews,c.witnesses.map(x=>x.id)).filter(id=>{
   const witness=c.witnesses.find(x=>x.id===id);
   return witness.needs.every(p=>s.clues.includes(p))&&s.theories.includes(id==='w0'?'t0':'t2');
  });
  s.solved=!!data.solved&&s.gates.length===2&&s.theories.length===3&&s.interviews.length===2;
  s.mastered=s.solved&&data.mastered===true;
  s.hints=Math.max(0,Math.min(200,Math.floor(Number(data.hints)||0)));
  s.misses=Math.max(0,Math.min(200,Math.floor(Number(data.misses)||0)));
  s.verdictFails=Math.max(0,Math.min(200,Math.floor(Number(data.verdictFails)||0)));
  s.retryAt=Math.max(0,Math.min(Date.now()+90000,Math.floor(Number(data.retryAt)||0)));
  s.linkFails=Math.max(0,Math.min(200,Math.floor(Number(data.linkFails)||0)));
  s.linkRetryAt=Math.max(0,Math.min(Date.now()+90000,Math.floor(Number(data.linkRetryAt)||0)));
  s.score=s.solved?Math.max(1,Math.min(100,Math.floor(Number(data.score)||1))):0;
  s.scene=Math.max(0,Math.min(Number(data.scene)||0,s.gates.includes('gate2')?2:s.gates.includes('gate1')?1:0));
  s.log=Array.isArray(data.log)?data.log.filter(x=>typeof x==='string').slice(0,16):[];
  if(!forReplay){
   s.replays=Math.max(0,Math.min(100000,Math.floor(Number(data.replays)||0)));
   s.bestReplayScore=Math.max(0,Math.min(100,Math.floor(Number(data.bestReplayScore)||0)));
   s.lastReplayAt=Math.max(0,Math.floor(Number(data.lastReplayAt)||0));
   if(s.solved&&own(data.replay)&&data.replay.active===true){
    const r=cleanCase(data.replay,caseId,true);
    r.active=true;r.startedAt=Math.max(0,Math.floor(Number(data.replay.startedAt)||0));
    r.updatedAt=Math.max(r.startedAt,Math.floor(Number(data.replay.updatedAt)||0));
    r.attempt=Math.max(1,Math.min(100001,Math.floor(Number(data.replay.attempt)||s.replays+1)));
    if(r.startedAt>s.lastReplayAt)s.replay=r;
   }
  }
  return s;
 }
 function hydrate(raw,ep1Cleared){
  const s=fresh();if(!own(raw)||raw.v!==VERSION)return s;
  for(let n=2;n<=13;n++){
   if(n>2&&!s.cases[n-1]?.solved)break;
   const input=raw.cases?.[n];if(!input)continue;
   s.cases[n]=cleanCase(input,n);
  }
  if(!ep1Cleared)return fresh();
  const active=Number(raw.active);
  if(Number.isInteger(active)&&active>=2&&active<=13&&unlocked(s,active,true))s.active=active;
  else s.active=highestUnlocked(s,true);
  return s;
 }
 function unlocked(s,id,ep1Cleared){return !!ep1Cleared&&id>=2&&id<=13&&(id===2||!!s.cases[id-1]?.solved);}
 function highestUnlocked(s,cleared){if(!cleared)return 2;let n=2;while(n<13&&s.cases[n]?.solved)n++;return n;}
 function step(s,id,fn){const c=lookup.get(id);if(!c)return {ok:false,message:'없는 사건 파일입니다.'};
  if(!unlocked(s,id,true))return {ok:false,message:'이전 사건을 먼저 해결해야 해.'};
  if(!s.cases[id])s.cases[id]=freshCase();s.cases[id].opened=true;s.active=id;
  const main=s.cases[id],current=main.replay?.active?main.replay:main;
  current.opened=true;
  const outcome=fn(c,current);
  if(current!==main)current.updatedAt=Date.now();
  return outcome;}
 function record(s,txt){s.log.unshift(txt);s.log=s.log.slice(0,16);}
 function inspect(s,id,clue){
  return step(s,id,(c,p)=>{const e=c.clues.find(x=>x.id===clue);
   if(!e)return {ok:false,message:'증거를 찾을 수 없습니다.'};
   if(e.scene>p.gates.length)return {ok:false,message:'이 구역의 잠금을 먼저 해제해야 해.'};
   if(p.clues.includes(clue))return {ok:true,already:true,message:e.description};
   p.clues.push(clue);record(p,'증거 확보 · '+e.name);
   return {ok:true,message:e.description,name:e.name};
  });
 }
 function unlock(s,id,gate,answer){
  return step(s,id,(c,p)=>{const index=gate==='gate1'?0:gate==='gate2'?1:-1;
   if(index<0)return {ok:false,message:'존재하지 않는 장치야.'};
   if(index===1&&!p.gates.includes('gate1'))return {ok:false,message:'앞선 잠금을 해제해야 해.'};
   if(p.gates.includes(gate))return {ok:true,already:true,message:'이미 열려 있는 구역이야.'};
   const requirements=index===0?['e0','e1']:['e3','e4'];
   if(!requirements.every(x=>p.clues.includes(x)))return {ok:false,message:'잠금의 근거가 되는 증거 두 개를 먼저 찾아봐.'};
   if(String(answer||'').trim().toUpperCase()!==c.puzzles[index].answer){p.misses++;return {ok:false,message:'번호가 맞지 않아. 확보한 두 기록의 번호를 비교해.'};}
   p.gates.push(gate);p.scene=index+1;record(p,'구역 개방 · '+c.locations[p.scene]);
   return {ok:true,message:c.locations[p.scene]+'의 문이 열렸다.'};
  });
 }
 function travel(s,id,place){
  return step(s,id,(c,p)=>{const n=Number(place);
   if(!Number.isInteger(n)||n<0||n>2||n>p.gates.length)return {ok:false,message:'아직 접근할 수 없는 장소야.'};
   p.scene=n;return {ok:true,message:c.locations[n]+'에 도착했어.'};});
 }
 function connect(s,id,a,b){
  return step(s,id,(c,p)=>{
   if(a===b||!p.clues.includes(a)||!p.clues.includes(b))return {ok:false,message:'수집한 서로 다른 증거 두 개를 선택해.'};
   if(p.linkRetryAt>Date.now())return {ok:false,message:'연속 추측으로 증거 연결을 일시 중지했어. 기록을 다시 분석한 뒤 시도해.'};
   const k=[a,b].sort().join('|'),found=c.theories.find(t=>t.pair.slice().sort().join('|')===k);
   if(!found){p.linkFails++;if(p.linkFails%4===0)p.linkRetryAt=Date.now()+40000;
    return {ok:false,message:'연결을 보류했어. 시간·출처·물증의 인과관계를 다시 검토해.'};}
   p.linkFails=0;
   if(!p.theories.includes(found.id)){p.theories.push(found.id);record(p,'추론 입증 · '+found.name);}
   return {ok:true,message:found.text,name:found.name};
  });
 }
 function question(s,id,witness){
  return step(s,id,(c,p)=>{
   const w=c.witnesses.find(x=>x.id===witness);if(!w)return {ok:false,message:'해당 인물을 찾을 수 없어.'};
   const theorem=witness==='w0'?'t0':'t2';
   if(!w.needs.every(x=>p.clues.includes(x))||!p.theories.includes(theorem))
    return {ok:true,reveal:false,message:w.claim+' 하지만 그 진술을 반박할 구체적인 증거가 아직 부족해.'};
   if(!p.interviews.includes(witness)){p.interviews.push(witness);record(p,'심문 입증 · '+w.name);}
   return {ok:true,reveal:true,message:'진술의 모순을 입증했어. '+w.needs.map(k=>c.clues.find(e=>e.id===k)?.name).join(' / ')+'의 출처를 최종 보고서에서 교차 검증해.'};
  });
 }
 function options(id,kind){
  const c=lookup.get(id),others=CASES.filter(x=>x.id!==id);
  if(kind==='culprit')return [c.witnesses[1].name,c.verdict.culprit,c.witnesses[0].name].filter((x,i,a)=>a.indexOf(x)===i);
  const current=c.verdict[kind],offset=kind==='act'?3:5;
  return [others[(id+offset)%others.length].verdict[kind],current,others[(id+offset+4)%others.length].verdict[kind]].filter((x,i,a)=>a.indexOf(x)===i);
 }
 // Three case-specific physical records must substantiate the account, not a lucky guess.
const reportKeys=['contradiction','mechanism','outcome'];
function validReport(c,answers){
 return !!answers&&answers.culprit===c.verdict.culprit&&answers.act===c.verdict.act&&
 answers.motive===c.verdict.motive&&reportKeys.every((key,i)=>answers[key]===c.forensic.trail[i]);
}
function masterCase(s,id,answers){
 return step(s,id,(c,p)=>{
  if(!p.solved)return {ok:false,message:'본편을 먼저 해결해야 심화 재수사를 시작할 수 있어.'};
  if(p.mastered)return {ok:true,already:true,message:'이미 심화 재수사 입증을 완료한 사건이야.'};
  if(p.clues.length<8)return {ok:false,message:'심화 재수사에는 8개 원본 물증을 모두 확보해야 해.'};
  if(p.retryAt>Date.now())return {ok:false,message:'연속 추측으로 교차검증이 일시 보류됐어. 잠시 뒤 다시 시도해.'};
  if(!validReport(c,answers)){
   p.misses++;p.verdictFails++;if(p.verdictFails%3===0)p.retryAt=Date.now()+45000;
   return {ok:false,message:'최종 재수사 보고서와 현장 물증 사이에 모순이 있어. 다시 조사해.'};
  }
  p.mastered=true;record(p,'심화 재수사 · 증거 교차검증 완료');
  return {ok:true,mastered:true,message:'세 가지 물증의 역할과 최종 판결을 확인했어. 심화 재수사 완료!'};
 });
}
function verdict(s,id,answers){
  const result=step(s,id,(c,p)=>{
   if(p.solved)return {ok:true,already:true,message:c.ending,score:p.score};
   if(p.theories.length!==3||p.interviews.length!==2||p.gates.length!==2)
    return {ok:false,message:'세 가지 추론과 두 사람의 진술을 모두 입증해야 최종 판결이 가능해.'};
   if(p.retryAt>Date.now())return {ok:false,message:'연속 추측으로 판결을 잠시 보류했어. 증거를 다시 살펴본 뒤 재시도해.'};
   if(!validReport(c,answers)||(p.active&&!validReplayReport(c,p,answers))){
    p.verdictFails++;if(p.verdictFails%3===0)p.retryAt=Date.now()+45000;
    p.misses++;record(p,'판결 재검토 · 증거와 결론의 충돌');return {ok:false,message:'판결의 논리 중 하나가 증거와 충돌해. 단서는 그대로 보존돼.'};
   }
   p.solved=true;p.score=Math.max(1,100-p.hints*5-p.misses*8);
   record(p,'사건 해결 · '+p.score+'점');
   return {ok:true,score:p.score,message:c.ending,finished:id===13,next:id<13?id+1:null};
  });
  if(result.ok&&!result.already&&s.cases[id]?.replay?.active){
   const main=s.cases[id],completed=main.replay;
   main.replays=Math.max(0,Number(main.replays)||0)+1;
   main.bestReplayScore=Math.max(Number(main.bestReplayScore)||0,Number(completed.score)||0);
   main.lastReplayAt=Date.now();main.replay=null;
   return {...result,replay:true,message:'고난도 재수사 성공! 원본 사건 기록과 클리어 내역은 그대로 유지돼.'};
  }
  return result;
 }
 function hint(s,id){
  return step(s,id,(c,p)=>{
   if(p.active)return {ok:false,message:'고난도 재수사는 힌트 없이 도전해야 해.'};
   p.hints++;
   const line=!p.gates.includes('gate1')?c.puzzles[0].hint:
    !p.gates.includes('gate2')?c.puzzles[1].hint:
    p.theories.length<3?'공식 진술과 충돌하는 객관 기록, 조작 수단, 감춘 결과를 구분해.':
    p.interviews.length<2?'심문 시 각각의 인물에게 모순을 입증한 증거를 보여줘.':'최종 판결에서 가해자·조작 내용·은폐 목적을 모두 일치시켜.';
   return {ok:true,message:line};
  });
 }
 // A previously solved case can be fully reinvestigated without deleting the original clear.
 function startReplay(s,id){
  if(!unlocked(s,id,true))return {ok:false,message:'먼저 이전 사건의 수사 기록을 열어야 해.'};
  const p=s.cases[id];
  if(!p?.solved)return {ok:false,message:'원본 사건을 먼저 해결해야 고난도 재수사를 시작할 수 있어.'};
  if(p.replay?.active)return {ok:true,already:true,message:'진행 중인 고난도 재수사가 있어.'};
  const r=freshCase();r.active=true;r.attempt=(p.replays||0)+1;r.startedAt=Date.now();r.updatedAt=r.startedAt;
  p.replay=r;
  return {ok:true,message:'새 고난도 수사를 시작했어. 원본 완료 내역은 보존돼.'};
 }
 function viewCase(s,id){const p=s.cases[id];return p?.replay?.active?p.replay:p;}
 function replayPrompts(id,attempt){
  const c=lookup.get(id);if(!c)return [];
  const turn=Math.max(1,Math.floor(Number(attempt)||1));
  const indices=[(id+turn)%3,3+(id*2+turn)%3,6+(id+turn)%2];
  return indices.map((i,n)=>({key:'audit'+n,answer:c.clues[i].id,
   label:['① 첫 현장 원본의 출처를 확인해. 다음 기록에 일치하는 물증은?','② 중간 현장 조작과 연결되는 원본은?','③ 최종 은폐 정황을 뒷받침하는 기록은?'][n]+' 『'+c.clues[i].description+'』'}));
 }
 function validReplayReport(c,p,answers){
  return replayPrompts(c.id,p.attempt).every(({key,answer})=>answers?.[key]===answer);
 }
 function merge(first,second,cleared){
  const a=hydrate(first,cleared),b=hydrate(second,cleared),out=fresh();
  if(!cleared)return out;
  for(let id=2;id<=13;id++){
   if(id>2&&!out.cases[id-1]?.solved)break;
   const x=a.cases[id],y=b.cases[id];if(!x&&!y)continue;
   const c=freshCase();
   c.opened=!!(x?.opened||y?.opened);
   c.clues=[...new Set([...(x?.clues||[]),...(y?.clues||[])])];
   c.gates=[...new Set([...(x?.gates||[]),...(y?.gates||[])])];
   c.theories=[...new Set([...(x?.theories||[]),...(y?.theories||[])])];
   c.interviews=[...new Set([...(x?.interviews||[]),...(y?.interviews||[])])];
   c.solved=!!(x?.solved||y?.solved);c.mastered=!!(x?.mastered||y?.mastered);c.scene=Math.max(x?.scene||0,y?.scene||0);
   c.hints=Math.max(x?.hints||0,y?.hints||0);c.misses=Math.max(x?.misses||0,y?.misses||0);
   c.verdictFails=Math.max(x?.verdictFails||0,y?.verdictFails||0);c.retryAt=Math.max(x?.retryAt||0,y?.retryAt||0);
   c.linkFails=Math.max(x?.linkFails||0,y?.linkFails||0);c.linkRetryAt=Math.max(x?.linkRetryAt||0,y?.linkRetryAt||0);
   c.score=Math.max(x?.score||0,y?.score||0);c.log=[...new Set([...(y?.log||[]),...(x?.log||[])])].slice(0,16);
   c.replays=Math.max(Number(x?.replays)||0,Number(y?.replays)||0);
   c.bestReplayScore=Math.max(Number(x?.bestReplayScore)||0,Number(y?.bestReplayScore)||0);
   c.lastReplayAt=Math.max(Number(x?.lastReplayAt)||0,Number(y?.lastReplayAt)||0);
   c.replay=[x?.replay,y?.replay].filter(r=>r?.active&&r.startedAt>c.lastReplayAt)
     .sort((r,t)=>(t.updatedAt||0)-(r.updatedAt||0))[0]||null;
   out.cases[id]=cleanCase(c,id);
  }
  out.active=highestUnlocked(out,true);return out;
 }
 return Object.freeze({VERSION,CASES,lookup,fresh,freshCase,cleanCase,hydrate,unlocked,highestUnlocked,inspect,unlock,travel,connect,question,options,verdict,masterCase,hint,merge,startReplay,viewCase,replayPrompts});
});