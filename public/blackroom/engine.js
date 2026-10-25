/* BLACKROOM EP01 engine. Standalone deterministic game; no real wallet or account access. */
const BlackRoomEngine = (() => {
'use strict';
const VERSION = 1;
const SCENES = {
 hall:{name:'13층 복도',sub:'멈춘 시계와 존재하지 않는 문'},
 room:{name:'제13호실',sub:'그 누구도 나올 수 없었다는 방'},
 security:{name:'보안실',sub:'기록되지 않은 일곱 분'}
};
const CLUES = {
 guest:{scene:'hall',name:'23:17 객실 장부',type:'문서',x:21,y:58,description:'13호실 마지막 방문 시각은 23:17. 인증코드 YS-04가 적혀 있다. 문 옆 키패드는 마지막 방문 시각 네 자리를 요구한다.',fragment:'13호실 · 23:17 · 인증 YS-04'},
 clock:{scene:'hall',name:'멈춘 복도 시계',type:'물증',x:80,y:21,description:'시계는 정확히 23:24에 멈췄다. 한밤중의 사건 시각을 가리키는 것 같지만 카메라 기록과 다르다.',fragment:'23:24 — 멈춘 초침'},
 thread:{scene:'hall',name:'문틀의 청색 섬유',type:'물증',x:72,y:75,description:'문틀에 감색 울 섬유가 걸려 있다. 호텔 제복과는 다른 고급 원단이다.',fragment:'감색 울 원단 · 바깥쪽 문틀'},
 latch:{scene:'hall',name:'긁힌 정비 잠금쇠',type:'현장',x:53,y:49,description:'출입문의 정비용 잠금쇠에 최근 생긴 긁힘이 있다. 안쪽에서 잠근 밀실만은 아닌 것 같다.',fragment:'외부 정비용 강제 해제 흔적'},
 footprint:{scene:'room',name:'옷장으로 향한 발자국',type:'현장',x:29,y:78,description:'발자국은 복도에서 방 안쪽 옷장으로 향했다. 오른발 뒤축이 비정상적으로 닳은 형태다.',fragment:'오른쪽 뒤축 마모 · 옷장 방향'},
 cup:{scene:'room',name:'식지 않은 두 번째 찻잔',type:'물증',x:70,y:71,description:'컵 두 개가 나란히 놓였다. 한 잔만 립스틱이 묻어 있다. 누군가 예상보다 오래 머물렀을지 모른다.',fragment:'찻잔 2개 · 립스틱 자국 1개'},
 invitation:{scene:'room',name:'찢어진 초대장',type:'문서',x:54,y:53,description:'뒷면에는 은빛 초승달 브로치가 그려져 있다. “이 표식은 오직 단 한 사람에게만.”',fragment:'은빛 초승달 · 한 사람만의 소품'},
 lock:{scene:'room',name:'정비용 잠금 로그',type:'디지털',x:86,y:28,description:'23:24에 사용된 실제 잠금 권한은 MAINT-09. 객실 장부에 남은 YS-04와는 전혀 다른 종류다.',fragment:'23:24 · MAINT-09 · OVERRIDE'},
 mirror:{scene:'room',name:'거울의 숨겨진 문구',type:'암호',x:23,y:28,description:'입김을 불면 “영상은 진실보다 7분 늦는다”라는 글이 나타난다.',fragment:'진실보다 7분 늦는 영상'},
 sync:{scene:'security',name:'CCTV 동기화 메모',type:'문서',x:19,y:33,description:'CCTV 장비는 실제보다 7분 느리다. 영상 보관함 암호 규칙: [지연 분 두 자리] + [객실 번호 두 자리].',fragment:'지연 07 / 객실 13'},
 footage:{scene:'security',name:'13호실 CCTV 원본',type:'영상',x:53,y:47,gate:'archive',description:'영상의 23:17은 실제 23:24. 당신과 비슷한 외투를 입었지만 가슴에는 은빛 초승달 브로치가 보인다.',fragment:'23:17 영상 · 은빛 초승달 브로치'},
 ledger:{scene:'security',name:'보안실 대여 장부',type:'문서',x:80,y:71,description:'기술자 강도윤이 초승달 소품을 빌리고 돌려주지 않았다. MAINT-09 정비 권한도 그가 가지고 있다.',fragment:'강도윤 · 브로치 미반납 · MAINT-09'}
};
const LINKS = {
 timeline:{ids:['clock','sync'],name:'사라진 7분',icon:'◷',result:'CCTV가 표시한 23:17은 실제 23:24. 카메라 시각으로 꾸민 알리바이는 거짓이다.'},
 entry:{ids:['guest','lock'],name:'가짜 출입 기록',icon:'⌁',result:'장부의 YS-04와 문을 연 MAINT-09는 서로 다른 권한이다. 직원 코드는 범인이라는 증거가 아니다.'},
 path:{ids:['thread','footprint'],name:'문에서 옷장까지',icon:'↝',result:'문틀에 남은 울 원단과 옷장으로 향하는 비대칭 발자국은 누군가 실제로 출입했음을 보여준다.'},
 disguise:{ids:['invitation','footage'],name:'영상 속 가짜 나',icon:'◈',result:'영상의 은빛 초승달은 초대장에 기록된 유일한 표식이다. 카메라 속 사람은 당신이 아니라 변장한 누군가다.'},
 suspect:{ids:['lock','ledger'],name:'정비 권한의 주인',icon:'♟',result:'강도윤이 잠금 권한과 영상 속 브로치를 모두 가지고 있었다.'}
};
const PEOPLE = {
 yoon:{name:'윤서린',role:'호텔 총지배인',statement:'그날 밤 나는 로비에 있었어요. 객실 장부에 내 코드가 왜 있는지 모르겠군요.',needs:['guest','lock'],reveal:'YS-04는 제 코드지만 23:24에 문을 연 건 MAINT-09예요. 정비 권한은 제게 없어요.'},
 kang:{name:'강도윤',role:'시설·보안 기술자',statement:'카메라는 거짓말하지 않죠. 분명 당신이 그곳에 있었습니다.',needs:['sync','ledger'],reveal:'카메라가 7분 느렸다는 건 알고 있었어요. 브로치도 제가 가지고 있었죠. 하지만 전부 우연입니다.'},
 lee:{name:'이현',role:'옆방 투숙객',statement:'그 시각 복도에는 아무도 없었어요. 정말이에요.',needs:['thread','footprint'],reveal:'사실 누군가 지나갔어요. 오른쪽 발을 끌면서 걸었죠. 무서워서 거짓말했어요.'}
};
const REQUIRED = ['timeline','entry','disguise'];
function initial(){return {v:VERSION,scene:'hall',clues:[],links:[],door:false,archive:false,interviews:{},started:false,solved:false,ending:'pending',score:0,hints:0,misses:0,log:[]};}
function hydrate(data){
 if(!data||typeof data!=='object'||data.v!==VERSION)return initial();
 const s=initial();
 s.door=!!data.door;s.archive=!!data.archive;s.started=!!data.started;s.solved=!!data.solved;
 s.ending=s.solved?(data.ending==='true'?'true':'partial'):'pending';
 s.scene=SCENES[data.scene]?data.scene:'hall';if(!s.door)s.scene='hall';
 s.clues=Array.isArray(data.clues)?[...new Set(data.clues.filter(k=>CLUES[k]))]:[];
 if(!s.archive)s.clues=s.clues.filter(k=>k!=='footage');
 s.links=Array.isArray(data.links)?[...new Set(data.links.filter(k=>LINKS[k]))]:[];
 s.interviews={};
 for(const k of Object.keys(PEOPLE))if(data.interviews&&data.interviews[k])s.interviews[k]=true;
 s.hints=Math.max(0,Math.min(999,Number(data.hints)||0));s.misses=Math.max(0,Math.min(999,Number(data.misses)||0));
 s.score=Math.max(0,Math.min(100,Number(data.score)||0));
 s.log=Array.isArray(data.log)?data.log.filter(x=>typeof x==='string').slice(-30):[];
 return s;
}
function record(s,entry){s.log.unshift(entry);s.log=s.log.slice(0,30);}
function collect(s,id){
 const c=CLUES[id];if(!c)return {ok:false,message:'존재하지 않는 단서야.'};
 if(c.scene!=='hall'&&!s.door)return {ok:false,message:'먼저 제13호실 문을 열어야 해.'};
 if(c.gate&&!s[c.gate])return {ok:false,message:'영상 보관함 암호를 먼저 풀어야 해.'};
 if(s.clues.includes(id))return {ok:true,already:true,message:'이미 기록한 단서야.'};
 s.clues.push(id);record(s,'증거 확보 · '+c.name);return {ok:true,message:'수사 수첩에 단서를 추가했어.'};
}
function travel(s,id){
 if(!SCENES[id])return {ok:false,message:'접근 불가능한 장소야.'};
 if(id!=='hall'&&!s.door)return {ok:false,message:'먼저 13호실의 잠금을 해제해야 해.'};
 s.scene=id;return {ok:true,message:SCENES[id].name+' 도착'};
}
function puzzle(s,id,answer){
 const v=String(answer==null?'':answer).replace(/[^0-9]/g,'').slice(0,4);
 if(id==='door'){
  if(s.door)return {ok:true,message:'이미 열린 문이야.'};
  if(v!=='2317')return {ok:false,message:'틀린 번호야. 장부에 기록된 마지막 방문 시각을 살펴봐.'};
  s.door=true;s.scene='room';record(s,'제13호실 잠금 해제');return {ok:true,message:'쇳소리와 함께 제13호실 문이 열렸다.'};
 }
 if(id==='archive'){
  if(!s.door)return {ok:false,message:'보안실까지 먼저 가야 해.'};
  if(s.archive)return {ok:true,message:'이미 열린 보관함이야.'};
  if(v!=='0713')return {ok:false,message:'암호가 틀렸어. 지연 분과 객실 번호를 두 자리씩 입력해.'};
  s.archive=true;record(s,'CCTV 원본 아카이브 잠금 해제');return {ok:true,message:'화면이 켜지고 23:17 영상이 재생된다.'};
 }
 return {ok:false,message:'알 수 없는 장치야.'};
}
function connect(s,a,b){
 if(a===b||!CLUES[a]||!CLUES[b])return {ok:false,message:'서로 다른 단서 두 개를 선택해.'};
 if(!s.clues.includes(a)||!s.clues.includes(b))return {ok:false,message:'수집되지 않은 단서가 있어.'};
 const found=Object.entries(LINKS).find(([,v])=>v.ids.includes(a)&&v.ids.includes(b));
 if(!found)return {ok:false,message:'이 단서 두 개만으로는 입증할 수 없어. 다른 모순을 찾아봐.'};
 const [key,item]=found;
 if(s.links.includes(key))return {ok:true,already:true,key,message:'이미 입증한 결론이야.'};
 s.links.push(key);record(s,'추론 입증 · '+item.name);return {ok:true,key,message:item.result};
}
function interrogate(s,id){
 const p=PEOPLE[id];if(!p)return {ok:false,message:'존재하지 않는 인물이야.'};
 if(p.needs.every(k=>s.clues.includes(k))){s.interviews[id]=true;record(s,p.name+'의 진술 모순 발견');return {ok:true,reveal:true,message:p.reveal};}
 return {ok:true,reveal:false,message:p.statement};
}
function ready(s){return REQUIRED.every(k=>s.links.includes(k));}
function fullTruth(s){
 return s.solved&&Object.keys(LINKS).every(k=>s.links.includes(k))&&
  Object.keys(PEOPLE).every(k=>s.interviews[k]);
}
function revealTruth(s){
 if(!s.solved)return {ok:false,message:'주요 사건을 먼저 해결해야 해.'};
 if(!fullTruth(s))return {ok:false,message:'다섯 가지 추론과 세 명의 핵심 진술을 모두 입증해야 해.'};
 if(s.ending==='true')return {ok:true,already:true,score:s.score,rank:s.score>=90?'S':'A'};
 s.ending='true';s.score=Math.max(1,100-s.hints*8-s.misses*12);
 record(s,'숨겨진 진상까지 규명 · 진엔딩 ('+s.score+'점)');
 return {ok:true,score:s.score,rank:s.score>=90?'S':'A',message:'밀실뿐 아니라 은폐된 이동 경로와 세 명의 모순된 증언을 모두 밝혀냈다. 사건 뒤에는 또 다른 지시자가 존재한다.'};
}
function verdict(s,answers){
 if(!ready(s))return {ok:false,locked:true,message:'시각 · 출입 · 변장에 관한 세 추론이 필요해.'};
 if(!answers||answers.culprit!=='kang'||answers.time!=='offset'||answers.method!=='maintenance'){
  s.misses++;record(s,'섣부른 지목 · 재검토 필요');return {ok:false,message:'증거 한 개가 결론과 모순된다. 단서는 보존되니 다시 추리해.'};
 }
 s.solved=true;s.ending='partial';
 s.score=Math.min(79,Math.max(1,100-s.hints*8-s.misses*12));
 record(s,'주요 사건 해결 · 남은 진실 조사 가능 ('+s.score+'점)');
 if(fullTruth(s)){
  const revealed=revealTruth(s);
  return {...revealed,ending:'true'};
 }
 const rank=s.score>=75?'A':s.score>=55?'B':'C';
 return {ok:true,score:s.score,rank,ending:'partial',message:'강도윤의 밀실 조작은 입증됐다. 하지만 사건 배후와 이동 경로에 미해결 의문이 남았다. 다른 증거와 세 용의자의 진술을 끝까지 조사해.'};
}
function hint(s){
 s.hints++;
 const info=!s.door?'13호실 방문 장부의 네 자리 시각을 문 옆 숫자패드에 입력해.':
  !s.archive?'보안실 동기화 메모를 읽어. 지연 분 두 자리 + 객실 두 자리야.':
  !s.clues.includes('footage')?'암호를 풀었다면 CCTV 화면을 조사해.':
  !s.links.includes('timeline')?'복도 시계와 CCTV 장비 메모를 연결해.':
  !s.links.includes('entry')?'객실 장부와 정비 잠금 로그의 권한을 비교해.':
  !s.links.includes('disguise')?'초대장 뒷면의 브로치와 CCTV 영상을 비교해.':
  '최종 지목에서 시간·정비 권한·위장자의 정체를 모두 정확히 선택해.';
 record(s,'힌트 사용');return info;
}
function progress(s){
 const fraction=s.clues.length/12*.43+s.links.length/5*.36+(s.door?.08:0)+(s.archive?.08:0)+(s.solved?.05:0);
 return {clues:s.clues.length,total:12,links:s.links.length,required:REQUIRED.filter(k=>s.links.includes(k)).length,percent:Math.min(100,Math.round(fraction*100))};
}
return Object.freeze({VERSION,SCENES,CLUES,LINKS,PEOPLE,REQUIRED,initial,hydrate,collect,travel,puzzle,connect,interrogate,ready,fullTruth,revealTruth,verdict,hint,progress});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BlackRoomEngine;
if(typeof window!=='undefined')window.BlackRoomEngine=BlackRoomEngine;
