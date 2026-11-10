'use strict';
(function(){
 const icons={love:'♡',money:'✦',work:'♜',health:'✿',relation:'♧',overall:'☾'};
 const descriptions={love:'연인 · 썸 · 재회 · 인연',money:'금전 · 소비 · 기회',work:'직장 · 이직 · 사업',health:'휴식 · 컨디션 · 균형',relation:'우정 · 믿음 · 인간관계',overall:'인생의 방향 · 전체 흐름'};
 const $=id=>document.getElementById(id);
 let categories=[],active=null,picks=[],busy=false;
 function el(tag,className,text){
   const element=document.createElement(tag);
   if(className)element.className=className;
   if(text!==undefined)element.textContent=text;
   return element;
 }
 function setStatus(message,error){
   const n=$('status');n.textContent=message||'';n.className='status'+(error?' error':'');
 }
 function date(ts){
   try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'}).format(new Date(ts));}
   catch{return '기록됨';}
 }
 async function request(url,options){
   const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
   let data;try{data=await response.json();}catch{throw Error('서버 응답을 읽을 수 없습니다.');}
   if(!response.ok){const err=new Error(data.error||'요청을 완료할 수 없습니다.');err.reading=data.reading;err.status=response.status;throw err;}
   return data;
 }
 function renderCategories(){
   const grid=$('categories');grid.replaceChildren();
   $('progress').textContent=categories.filter(c=>c.reading).length+' / '+categories.length+' 완료';
   for(const c of categories){
    const button=el('button','category'+(active===c.category?' active':'')+(c.reading?' done':''));button.type='button';
    button.append(el('span','cat-icon',icons[c.category]||'✦'));
    const copy=el('span','cat-copy');copy.append(el('b','',c.title),el('small','',descriptions[c.category]||''));button.append(copy);
    button.append(el('span','cat-state',c.reading?'✓ 기록 보기':'선택 ↗'));
    button.addEventListener('click',()=>choose(c.category));grid.append(button);
   }
 }
 function renderArchive(){
  const a=$('archive');a.replaceChildren();
  const completed=categories.filter(c=>c.reading);
  if(!completed.length){a.append(el('p','empty','아직 펼친 타로가 없습니다. 첫 번째 카드를 만나 보세요.'));return;}
  for(const c of completed){
   const button=el('button','archive-card');button.type='button';
   button.append(el('span','',icons[c.category]||'✦'));
   const info=el('span','archive-copy');info.append(el('b','',c.title),el('small','',date(c.reading.createdAt)));button.append(info);
   button.append(el('span','archive-open','리딩 보기 ↗'));
   button.addEventListener('click',()=>{choose(c.category);$('experience').scrollIntoView({behavior:'smooth',block:'start'});});
   a.append(button);
  }
 }
 function choose(category){
  active=category;picks=[];renderCategories();
  const item=categories.find(c=>c.category===category);
  if(!item)return;
  $('experienceTitle').textContent=item.title+' · '+(item.reading?'지난 운명의 기록':'카드를 고르는 순간');
  $('intro').hidden=true;$('drawArea').hidden=!!item.reading;$('reading').hidden=!item.reading;
  setStatus('');
  if(item.reading)renderReading(item.reading);else renderDeck();
 }
 function renderDeck(){
  const deck=$('deck');deck.replaceChildren();
  for(let i=0;i<12;i++){
   const order=picks.indexOf(i);
   const btn=el('button','card-back'+(order>=0?' selected':'')+(picks.length>=3&&order<0?' muted':''));btn.type='button';
   btn.setAttribute('aria-label',(i+1)+'번 타로 카드'+(order>=0?', '+(order+1)+'번째 선택':''));
   btn.setAttribute('aria-pressed',String(order>=0));
   const ring=el('span','card-ring','☾');const star=el('span','card-star','✧');btn.append(ring,star);
   if(order>=0)btn.append(el('span','card-order',String(order+1)));
   btn.addEventListener('click',()=>{
    if(busy)return;
    const at=picks.indexOf(i);
    if(at>=0)picks.splice(at,1);
    else if(picks.length<3)picks.push(i);
    renderDeck();
   });
   deck.append(btn);
  }
  $('selectionCount').textContent=picks.length===3?'세 장을 모두 골랐습니다. 최종 펼치기를 누르면 결과가 확정됩니다.':'카드를 3장 선택해 주세요 ('+picks.length+'/3)';
  $('drawBtn').disabled=busy||picks.length!==3;
 }
 function textSection(parent,heading,value){
   const section=el('div','reading-section');
   section.append(el('h3','',heading),el('p','',value||''));parent.append(section);
 }
 function renderReading(reading){
  const content=$('reading');content.replaceChildren();content.hidden=false;
  $('drawArea').hidden=true;$('intro').hidden=true;
  const intro=el('div','reading-intro');
  intro.append(el('span','reading-kicker','✧ YOUR PERSONAL TAROT ✧'),el('h3','',reading.interpretation.headline),el('p','reading-date',date(reading.createdAt)));
  content.append(intro);
  const spread=el('div','spread');
  for(const card of reading.cards){
   const wrapper=el('article','revealed-wrap');
   const front=el('div','revealed-card'+(card.reversed?' reversed':''));
   front.append(el('span','card-top','✧ '+card.arcana+' ✧'),el('span','front-symbol',card.symbol),el('span','front-name',card.name),el('span','front-orientation',card.reversed?'↶ REVERSED':'✦ UPRIGHT'));
   wrapper.append(front,el('b','spread-position',card.position),el('small','spread-direction',card.reversed?'역방향':'정방향'));
   spread.append(wrapper);
  }
  content.append(spread);
  textSection(content,'✦ 리딩의 전체 흐름',reading.interpretation.opening+' '+reading.interpretation.bridge);
  for(const d of reading.interpretation.details)textSection(content,'✧ '+d.position+' · '+d.name+' ('+d.orientation+')',d.description);
  textSection(content,'☾ 세 장이 함께 전하는 메시지',reading.interpretation.connection);
  const advice=el('div','advice');advice.append(el('h3','','당신에게 남기는 조언'),el('p','',reading.interpretation.advice));content.append(advice);
  content.append(el('p','disclaimer',reading.interpretation.disclaimer));
 }
 async function draw(){
  if(busy||picks.length!==3||!active)return;
  if(!window.confirm('이 카테고리의 타로는 평생 한 번만 볼 수 있습니다. 선택한 세 장을 정말 펼칠까요?'))return;
  busy=true;renderDeck();setStatus('운명의 카드 세 장을 펼치는 중입니다…');
  try{
   const data=await request('/api/tarot/draw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:active,picks})});
   const item=categories.find(c=>c.category===active);item.reading=data.reading;
   renderCategories();renderArchive();renderReading(data.reading);setStatus('이 리딩은 내 계정에 저장되었습니다.');
  }catch(e){
   if(e.reading){const item=categories.find(c=>c.category===active);item.reading=e.reading;renderCategories();renderArchive();renderReading(e.reading);}
   setStatus(e.message,true);
  }finally{busy=false;if(!$('drawArea').hidden)renderDeck();}
 }
 async function init(){
  $('drawBtn').addEventListener('click',draw);
  setStatus('회원별 타로 기록을 확인하는 중입니다…');
  try{
   const data=await request('/api/tarot/status');
   categories=data.categories||[];renderCategories();renderArchive();
   setStatus('');if(categories.length)choose(categories.find(c=>!c.reading)?.category||categories[0].category);
  }catch(e){
   $('intro').textContent=e.status===401?'로그인 후 준자랜드 타로를 이용할 수 있습니다. 상단의 준자랜드 버튼으로 돌아가 로그인해 주세요.':e.message;
   setStatus(e.message,true);
  }
 }
 init();
})();