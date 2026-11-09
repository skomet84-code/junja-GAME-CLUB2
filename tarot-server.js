'use strict';

// JUNJA LAND tarot: one lifetime reading per account and category.
// Uses game_state because it is already part of the Railway Postgres snapshot.
const THEMES={
  love:{title:'연애운',topic:'마음과 인연',focus:'내 감정을 먼저 확인하고 상대의 선택도 존중하세요.',question:'설렘보다 서로의 태도가 꾸준한지 확인해 보세요.'},
  money:{title:'재물운',topic:'돈의 흐름과 기회',focus:'큰 결정보다 지출과 저축의 기준부터 명확하게 세우세요.',question:'수익을 서두르기보다 감당할 수 있는 위험의 범위를 정하세요.'},
  work:{title:'직장·사업운',topic:'일과 성장의 방향',focus:'성과를 입증할 작은 목표를 세우고 주변과 소통하세요.',question:'새로운 기회는 준비와 협업이 만날 때 힘을 얻습니다.'},
  health:{title:'건강·컨디션운',topic:'휴식과 생활의 균형',focus:'생활 리듬을 살피고 필요하면 전문가의 도움을 받으세요.',question:'몸과 마음의 신호를 무시하지 말고 충분히 쉬어 주세요.'},
  relation:{title:'인간관계운',topic:'신뢰와 관계의 경계',focus:'당신에게 편안한 관계를 선택하고 불편한 경계를 표현하세요.',question:'말보다 반복되는 행동에서 관계의 방향을 살펴보세요.'},
  overall:{title:'종합운',topic:'삶의 흐름과 선택',focus:'지금 조절할 수 있는 일부터 하나씩 움직여 보세요.',question:'예측보다 선택과 행동이 다음 장면을 바꿉니다.'}
};
const MAJOR=[
 ['바보','새 출발과 순수한 호기심','준비 없는 도약과 성급함','🃏'],
 ['마법사','의지와 능력을 현실로 옮김','자신감 부족 또는 재능의 낭비','✨'],
 ['여사제','직감과 내면의 지혜','감정을 숨기거나 신호를 외면함','🌙'],
 ['여황제','풍요와 돌봄과 성장','과한 기대와 자기돌봄의 부족','🌸'],
 ['황제','안정과 책임과 구조','고집과 통제욕으로 인한 마찰','👑'],
 ['교황','조언과 신뢰와 전통','주변 기준에만 기대는 태도','📜'],
 ['연인','진심 어린 연결과 선택','가치관의 불일치와 망설임','💞'],
 ['전차','목표를 향한 추진력','방향을 잃은 조급함','⚔️'],
 ['힘','인내와 부드러운 용기','감정의 소진과 자신감의 흔들림','🦁'],
 ['은둔자','성찰과 신중한 판단','지나친 고립과 결론의 지연','🏮'],
 ['운명의 수레바퀴','변화의 계기와 새로운 순환','변화를 통제하려는 불안','☸️'],
 ['정의','균형과 책임 있는 선택','한쪽으로 기운 판단과 불공정','⚖️'],
 ['매달린 사람','관점의 전환과 기다림','불필요한 희생과 정체','🔮'],
 ['죽음','오래된 국면의 끝과 새로운 전환','끝내야 할 일을 붙드는 마음','🦋'],
 ['절제','조율과 회복과 균형','과도함과 불균형','🏺'],
 ['악마','강한 욕망과 집착의 자각','유혹에서 벗어나지 못하는 패턴','⛓️'],
 ['탑','기존 틀이 흔들리는 깨달음','변화를 두려워하는 저항','⚡'],
 ['별','희망과 회복과 영감','의욕 저하와 기대의 흔들림','⭐'],
 ['달','직감과 불확실함의 공존','오해와 근거 없는 두려움','🌘'],
 ['태양','명료함과 기쁨과 활력','지나친 낙관과 소진','☀️'],
 ['심판','깨달음과 새 단계의 시작','과거에 묶인 자책','📯'],
 ['세계','완성과 성취와 새로운 문','마무리되지 않은 숙제','🌍']
];
const SUITS=[
 {name:'완드',symbol:'🔥',positive:'열정과 도전',shadow:'의욕의 분산과 무리'},
 {name:'컵',symbol:'🏆',positive:'감정의 교류와 공감',shadow:'감정의 흔들림과 오해'},
 {name:'소드',symbol:'⚔️',positive:'분별력과 명확한 대화',shadow:'긴장과 날카로운 말'},
 {name:'펜타클',symbol:'🪙',positive:'꾸준함과 현실적인 성과',shadow:'현실적 부담과 조급함'}
];
const RANKS=[
 ['에이스','새로운 가능성이 피어남','첫걸음을 망설임'],
 ['2','둘 사이의 균형과 선택','우선순위의 혼란'],
 ['3','협력으로 확장되는 기회','협조의 어긋남'],
 ['4','안정적인 기반의 형성','안주하거나 움켜쥠'],
 ['5','변화 속에서 배우는 교훈','갈등을 과하게 키움'],
 ['6','도움과 인정의 교환','주고받는 균형의 붕괴'],
 ['7','신념을 시험하는 순간','방어와 의심에 지침'],
 ['8','움직임과 성실한 반복','진행 속도가 늦어짐'],
 ['9','경험에서 나온 끈기','걱정이 커져 시야가 좁아짐'],
 ['10','한 주기의 완성과 무게','과도한 책임을 짊어짐'],
 ['페이지','호기심 어린 소식과 배움','미숙한 기대와 소통'],
 ['나이트','실행과 추진의 에너지','서두르다 생기는 충돌'],
 ['퀸','성숙한 이해와 돌봄','자기희생 또는 통제'],
 ['킹','주도권과 책임 있는 결정','독단과 경직된 태도']
];
const DECK=[
 ...MAJOR.map((a,i)=>({id:'major-'+i,name:a[0],up:a[1],reverse:a[2],symbol:a[3],arcana:'메이저 아르카나'})),
 ...SUITS.flatMap(s=>RANKS.map((r,i)=>({id:s.name+'-'+i,name:s.name+' '+r[0],up:s.positive+' · '+r[1],reverse:s.shadow+' · '+r[2],symbol:s.symbol,arcana:'마이너 아르카나'})))
];
const POSITIONS=['지나온 흐름','현재의 핵심','앞으로의 방향'];
const POINTS=[
 '그동안의 경험과 선택이 지금의 마음에 어떤 흔적을 남겼는지 읽는 자리입니다.',
 '현재 가장 중요하게 바라봐야 할 감정과 행동을 비추는 자리입니다.',
 '정해진 운명이 아니라 앞으로 시도해 볼 방향을 보여주는 자리입니다.'
];
function shuffle(deck,crypto){
 const a=deck.slice();
 for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
function compose(theme,cards){
 const t=THEMES[theme];
 const mood=cards.filter(c=>!c.reversed).length;
 const a=cards[0],b=cards[1],c=cards[2];
 const opening='이번 '+t.title+' 리딩의 중심은 '+t.topic+'입니다. 첫 번째 카드 '+a.name+'에서 시작한 흐름이 '+b.name+'을 거쳐 '+c.name+'으로 이어집니다.';
 const bridge=mood===3?'세 카드가 모두 정방향이라 현재의 가능성을 비교적 적극적으로 살펴볼 때입니다. 다만 긍정적인 상징이 결과를 보장하지는 않습니다.':mood===0?'세 카드가 모두 역방향이라 외부의 운보다 내면의 망설임과 반복되는 습관을 정리하는 일이 중요해 보입니다.':'정방향과 역방향이 함께 나타나 기회와 주의점이 공존합니다. 단순히 좋다 또는 나쁘다로 결론내기보다는 흐름의 차이를 읽어보세요.';
 const details=cards.map((card,i)=>{
  const meaning=card.reversed?card.reverse:card.up;
  const verb=card.reversed?'역방향으로 놓여 '+meaning+'의 그림자를 살펴보라고 말합니다.':'정방향으로 놓여 '+meaning+'의 가능성을 강조합니다.';
  return {position:POSITIONS[i],name:card.name,orientation:card.reversed?'역방향':'정방향',
   description:POINTS[i]+' '+card.name+' 카드는 '+verb+' '+(i===0?'과거의 경험을 탓하기보다 그때 형성된 기준을 알아차리는 것이 첫 단서입니다.':i===1?'오늘 선택할 수 있는 작은 행동이 이 장면을 바꾸는 열쇠가 됩니다.':'앞날을 단정하지 말고 어떤 태도를 지켜 갈지 정해 보는 것이 좋습니다.')};
 });
 return {headline:t.title+' · 세 장의 메시지',opening,bridge,details,
  connection:'세 카드를 함께 보면, '+a.name+'의 '+(a.reversed?a.reverse:a.up)+'이(가) '+b.name+'의 '+(b.reversed?b.reverse:b.up)+'을(를) 만나고, 그 경험이 '+c.name+'의 '+(c.reversed?c.reverse:c.up)+'으로 이어집니다. 특히 가운데 카드는 지금 바꿀 수 있는 선택이 무엇인지 묻고 있습니다.',
  advice:t.focus+' '+t.question,
  disclaimer:'이 리딩은 전통 타로의 상징을 활용한 오락·자기성찰 콘텐츠입니다. 실제 미래를 예언하지 않으며 건강·재정 등 중요한 결정의 근거가 될 수 없습니다.'};
}
module.exports=function createTarot({db,crypto,readBody,requireAuth,json,rateLimit,flush=async()=>{},now=Date.now}){
 const key=(id,category)=>'tarot:permanent:v1:'+String(id)+':'+category;
 const get=(id,category)=>{
  const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(key(id,category));
  if(!row)return null;
  try{return JSON.parse(row.value);}catch{return null;}
 };
 async function handle(req,res,url){
  if(!url.pathname.startsWith('/api/tarot'))return false;
  const user=requireAuth(req,res);if(!user)return true;
  if(req.method==='GET'&&url.pathname==='/api/tarot/status'){
   return json(res,200,{ok:true,categories:Object.keys(THEMES).map(category=>({category,title:THEMES[category].title,reading:get(user.id,category)}))}),true;
  }
  if(req.method!=='POST'||url.pathname!=='/api/tarot/draw'){
   json(res,404,{error:'타로 요청을 찾을 수 없습니다.'});return true;
  }
  if(!rateLimit('tarot:'+user.id,10,60000)){json(res,429,{error:'잠시 후 다시 시도해 주세요.'});return true;}
  let body;try{body=await readBody(req);}catch(e){json(res,400,{error:'요청 형식을 확인해 주세요.'});return true;}
  const category=String(body.category||'');
  const picks=body.picks;
  if(!Object.hasOwn(THEMES,category)){json(res,400,{error:'올바른 운세 카테고리를 골라 주세요.'});return true;}
  if(!Array.isArray(picks)||picks.length!==3||new Set(picks).size!==3||!picks.every(x=>Number.isInteger(x)&&x>=0&&x<12)){
   json(res,400,{error:'카드를 서로 다른 위치에서 3장 골라 주세요.'});return true;
  }
  const old=get(user.id,category);
  if(old){json(res,409,{error:'이 카테고리는 이미 한 번 확인했습니다. 기존 결과를 다시 보여드립니다.',reading:old});return true;}
  const pack=shuffle(DECK,crypto).slice(0,12);
  const cards=picks.map((i,position)=>({...pack[i],reversed:crypto.randomInt(2)===0,position:POSITIONS[position]}));
  const reading={category,title:THEMES[category].title,createdAt:now(),cards,interpretation:compose(category,cards)};
  try{
   // The game's existing snapshot-backed key table enforces a unique reading.
   const result=db.prepare('INSERT OR IGNORE INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(key(user.id,category),JSON.stringify(reading),reading.createdAt);
   if(Number(result.changes)===0){
    json(res,409,{error:'이미 타로를 확인한 카테고리입니다.',reading:get(user.id,category)});return true;
   }
   await flush();
   json(res,201,{ok:true,reading});
  }catch(e){console.error('[TAROT] save failed',e);json(res,500,{error:'결과 저장에 실패했습니다. 잠시 후 기록을 확인해 주세요.'});}
  return true;
 }
 return {handle,DECK,THEMES,compose};
};