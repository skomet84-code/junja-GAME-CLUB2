/* BLACK ROOM serial engine, cases 002–013. Deterministic, storage-safe, no wallet integration. */
(function(root,factory){const E=factory(typeof module==='object'&&module.exports?require('./series-data.js'):root.BlackRoomSeriesData);
 if(typeof module==='object'&&module.exports)module.exports=E;root.BlackRoomSeriesEngine=E;
})(typeof window!=='undefined'?window:{},function(CASES){
 'use strict';const VERSION=1,lookup=new Map(CASES.map(c=>[c.id,c]));
 const own=(v)=>v&&typeof v==='object'&&!Array.isArray(v);
 const unique=(v,valid)=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&valid.includes(x)))]:[];
 const freshCase=()=>({opened:false,scene:0,clues:[],gates:[],theories:[],interviews:[],solved:false,hints:0,misses:0,score:0,log:[]});
 const fresh=()=>({v:VERSION,cases:{},active:2});
 function cleanCase(data,caseId){
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
  s.hints=Math.max(0,Math.min(200,Math.floor(Number(data.hints)||0)));
  s.misses=Math.max(0,Math.min(200,Math.floor(Number(data.misses)||0)));
  s.score=s.solved?Math.max(1,Math.min(100,Math.floor(Number(data.score)||1))):0;
  s.scene=Math.max(0,Math.min(Number(data.scene)||0,s.gates.includes('gate2')?2:s.gates.includes('gate1')?1:0));
  s.log=Array.isArray(data.log)?data.log.filter(x=>typeof x==='string').slice(0,16):[];
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
  return fn(c,s.cases[id]);}
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
   const k=[a,b].sort().join('|'),found=c.theories.find(t=>t.pair.slice().sort().join('|')===k);
   if(!found)return {ok:false,message:'그럴듯하지만 이 두 기록만으로는 결론을 입증할 수 없어. 시각·출입 기록·은폐 목적을 다시 비교해.'};
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
   return {ok:true,reveal:true,message:w.reveal};
  });
 }
 function options(id,kind){
  const c=lookup.get(id),others=CASES.filter(x=>x.id!==id);
  if(kind==='culprit')return [c.witnesses[1].name,c.verdict.culprit,c.witnesses[0].name].filter((x,i,a)=>a.indexOf(x)===i);
  const current=c.verdict[kind],offset=kind==='act'?3:5;
  return [others[(id+offset)%others.length].verdict[kind],current,others[(id+offset+4)%others.length].verdict[kind]].filter((x,i,a)=>a.indexOf(x)===i);
 }
 function verdict(s,id,answers){
  return step(s,id,(c,p)=>{
   if(p.solved)return {ok:true,already:true,message:c.ending,score:p.score};
   if(p.theories.length!==3||p.interviews.length!==2||p.gates.length!==2)
    return {ok:false,message:'세 가지 추론과 두 사람의 진술을 모두 입증해야 최종 판결이 가능해.'};
   if(!answers||answers.culprit!==c.verdict.culprit||answers.act!==c.verdict.act||answers.motive!==c.verdict.motive){
    p.misses++;record(p,'판결 재검토 · 증거와 결론의 충돌');return {ok:false,message:'판결의 논리 중 하나가 증거와 충돌해. 단서는 그대로 보존돼.'};
   }
   p.solved=true;p.score=Math.max(1,100-p.hints*5-p.misses*8);
   record(p,'사건 해결 · '+p.score+'점');
   return {ok:true,score:p.score,message:c.ending,finished:id===13,next:id<13?id+1:null};
  });
 }
 function hint(s,id){
  return step(s,id,(c,p)=>{
   p.hints++;
   const line=!p.gates.includes('gate1')?c.puzzles[0].hint:
    !p.gates.includes('gate2')?c.puzzles[1].hint:
    p.theories.length<3?'추론 탭에서 0↔3, 1↔4, 5↔7번 증거의 연결을 살펴봐.':
    p.interviews.length<2?'심문 시 각각의 인물에게 모순을 입증한 증거를 보여줘.':'최종 판결에서 가해자·조작 내용·은폐 목적을 모두 일치시켜.';
   return {ok:true,message:line};
  });
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
   c.solved=!!(x?.solved||y?.solved);c.scene=Math.max(x?.scene||0,y?.scene||0);
   c.hints=Math.max(x?.hints||0,y?.hints||0);c.misses=Math.max(x?.misses||0,y?.misses||0);
   c.score=Math.max(x?.score||0,y?.score||0);c.log=[...new Set([...(y?.log||[]),...(x?.log||[])])].slice(0,16);
   out.cases[id]=cleanCase(c,id);
  }
  out.active=highestUnlocked(out,true);return out;
 }
 return Object.freeze({VERSION,CASES,lookup,fresh,freshCase,cleanCase,hydrate,unlocked,highestUnlocked,inspect,unlock,travel,connect,question,options,verdict,hint,merge});
});