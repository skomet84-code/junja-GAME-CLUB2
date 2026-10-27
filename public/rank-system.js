(()=>{'use strict';
const fmt=n=>{
 try{
  const v=BigInt(String(n??0)),negative=v<0n,abs=negative?-v:v,sign=negative?'-':'';
  for(const [unit,multiple] of [['경',10000000000000000n],['조',1000000000000n],['억',100000000n]]){
   if(abs>=multiple&&abs%multiple===0n)return sign+(abs/multiple).toLocaleString('ko-KR')+unit;
  }
  return sign+abs.toLocaleString('ko-KR');
 }catch{return new Intl.NumberFormat('ko-KR').format(Number(n)||0);}
};
let state=null;
function toast(msg){const el=document.getElementById('toast');if(el){el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3200)}else alert(msg)}
async function api(path,opt={}){if(typeof window.api==='function')return window.api(path,opt);const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'요청 실패');return d}
function ensure(){
 if(document.getElementById('rankBtn'))return;
 const shop=document.getElementById('shopBtn');if(!shop)return;
 const b=document.createElement('button');b.id='rankBtn';b.className='rank-pill';b.type='button';b.innerHTML='♛ 신분';shop.after(b);
 const modal=document.createElement('div');modal.id='rankModal';modal.className='rank-modal hidden';modal.innerHTML='<div class="rank-backdrop"></div><div class="rank-card panel"><button class="rank-close" type="button">×</button><div id="rankContent"></div></div>';
 document.body.appendChild(modal);
 b.onclick=()=>openRank();b.addEventListener('touchend',e=>{e.preventDefault();openRank()},{passive:false});modal.querySelector('.rank-backdrop').onclick=close;modal.querySelector('.rank-close').onclick=close;
}
function close(){document.getElementById('rankModal')?.classList.add('hidden')}
function rankMark(rank){return rank.className==='absolute'?'<strong class="absolute-mini">G</strong>':rank.className==='god'?'<strong class="god-mini">∞</strong>':rank.className==='royal'?'<strong class="jr-mini">J</strong>':rank.icon}
function badge(rank,nick=''){return '<span class="social-rank rank-'+rank.className+'"><i>'+rankMark(rank)+'</i><b>'+rank.name+'</b>'+(nick?'<em>'+nick+'</em>':'')+'</span>'}
function render(d){
 state=d;const r=d.rank,u=d.user,all=d.ranks||[];const next=r.next;
 const rows=all.map(x=>'<div class="rank-road rank-'+x.className+' '+(x.level===r.level?'current':'')+(x.level<r.level?' cleared':'')+'"><span>'+rankMark(x)+'</span><b>'+x.name+'</b><small>'+(x.level===0?'START':fmt(x.cost)+' G')+'</small></div>').join('');
 const p=r.perks||{},isGodFinal=r.className==='absolute',godPower=(r.className==='god'||isGodFinal)?'<div class="god-power"><div class="god-power-title"><small>'+(isGodFinal?'BEYOND ALL · GOD JUNJA':'THE ABSOLUTE STATUS')+'</small><b>'+(isGodFinal?'♛ GOD JUNJA · 궁극의 신격':'∞ THE ABSOLUTE · 초월 권능')+'</b><span>'+(isGodFinal?'준자랜드의 진정한 최종 신분 · THE ABSOLUTE를 포함한 모든 하위 신분 권능을 계승합니다.':'갓준자 바로 아래 단계 · 기존 1경 신분 혜택을 그대로 유지합니다.')+'</span></div><div class="god-power-grid"><div><small>DAILY SALARY</small><b>'+fmt(p.dailySalary)+' G</b></div><div><small>DAILY DRAW</small><b>'+fmt(p.dailyDraws)+'회</b></div><div><small>FREE SLOT</small><b>'+fmt(p.freeSlots)+'회</b></div><div><small>TRANSFER FEE</small><b>'+Number(p.transferFeePct||0)+'%</b></div><div><small>ENTRY DISCOUNT</small><b>'+Number(p.gameEntryDiscountPct||0)+'%</b></div><div><small>GIFT BONUS</small><b>+'+Number(p.giftBonusPct||0)+'%</b></div></div><p>'+(isGodFinal?'갓준자 전용 궁극의 무한 오라 · 최상위 프로필 광휘 · 신분 상점 TIER ':'초월 신분 전용 오라 · 신분 상점 TIER ')+Number(p.shopTier||0)+'</p></div>':'';
 const bankDebt=BigInt(String(r.bankDebt||0));
 document.getElementById('rankContent').innerHTML='<div class="rank-hero rank-'+r.className+'"><div class="rank-crown">'+rankMark(r)+'</div><small>'+(isGodFinal?'THE ONE ABOVE ALL':'JUNJA SOCIAL STATUS')+'</small><h2>'+r.name+'</h2>'+(isGodFinal?'<div class="absolute-subtitle">오 직 하 나 의 갓 준 자</div>':'')+'<p>'+u.nickname+' · '+fmt(u.balance)+' G</p>'+badge(r)+'</div><div class="rank-copy"><b>신분은 돈으로 사는 명예 아이템</b><span>승급 비용은 즉시 소멸하며 계정에 영구 저장됩니다. 높은 신분일수록 프로필·로비에서 문장과 오라가 강해집니다.</span></div>'+godPower+(bankDebt>0n?'<div class="rank-bank-lock">🏦 J-BANK 대출 잔액 '+fmt(bankDebt)+' G · 완납 후 승급 가능 <button id="rankOpenBank" type="button">상환하기</button></div>':'')+'<div class="rank-roadmap">'+rows+'</div>'+(next?'<button id="rankPromote" class="rank-promote '+(next.className==='absolute'?'rank-promote-absolute':next.className==='god'?'rank-promote-god':'')+'" type="button"><span>'+rankMark(next)+' '+next.name+'으로 '+(next.className==='absolute'?'최종 각성':'신분 승급')+'</span><b>'+fmt(next.cost)+' G</b></button>':'<div class="rank-max rank-max-absolute">♛ GOD JUNJA · 모든 것을 초월한 진정한 최종 신분</div>');
 document.getElementById('rankPromote')?.addEventListener('click',promote);
 if(bankDebt>0n){const btn=document.getElementById('rankPromote');if(btn){btn.disabled=true;btn.title='J-BANK 대출 완납 후 승급할 수 있습니다.';}}
 document.getElementById('rankOpenBank')?.addEventListener('click',()=>{close();window.JBank?.open()});
 decorate(u);
}
async function openRank(){ensure();const m=document.getElementById('rankModal');m.classList.remove('hidden');document.getElementById('rankContent').innerHTML='<div class="rank-loading">신분 정보를 불러오는 중...</div>';try{render(await api('/api/rank'))}catch(e){document.getElementById('rankContent').innerHTML='<div class="rank-loading">'+e.message+'</div>'}}
async function promote(){const b=document.getElementById('rankPromote');if(!b)return;if(BigInt(String(state?.rank?.bankDebt||0))>0n){toast('J-BANK 대출 원금과 이자를 먼저 완납하세요.');return;}const name=state?.rank?.next?.name||'다음 신분';const cost=state?.rank?.next?.cost||0;if(BigInt(String(state?.user?.balance??0))<BigInt(String(cost))){toast('보유머니가 부족합니다. 필요 금액: '+fmt(cost)+' G');return;}b.disabled=true;try{const d=await api('/api/rank/promote',{method:'POST',body:'{}'});promotionFX(d.rank);const fresh=await api('/api/rank');render(fresh);toast('👑 '+d.rank.name+' 신분으로 상승!');document.getElementById('walletBalance')&&(document.getElementById('walletBalance').textContent=fmt(d.user.balance)+' G')}catch(e){toast(e.message)}finally{b.disabled=false}}
function promotionFX(r){const fx=document.createElement('div');fx.className='rank-up-fx rank-'+r.className;fx.innerHTML='<div><span>'+rankMark(r)+'</span><small>'+(r.className==='absolute'?'GOD JUNJA · FINAL ASCENSION':r.className==='god'?'THE ABSOLUTE ASCENSION':'신분 상승!')+'</small><b>'+r.name+'</b><em>'+(r.className==='absolute'?'THE ONE ABOVE ALL · GOD JUNJA':r.className==='god'?'THE ABSOLUTE STATUS':'JUNJA STATUS UPGRADE')+'</em></div>';document.body.appendChild(fx);setTimeout(()=>fx.remove(),r.className==='absolute'?5400:r.className==='god'?4200:2800)}
function decorate(u){if(!u?.rank)return;const nick=document.getElementById('nickName');if(nick){nick.dataset.rank=u.rank.name;nick.classList.add('rank-name');nick.setAttribute('data-rank-icon',u.rank.icon)}document.body.dataset.socialRank=u.rank.className}
function boot(){ensure();if(typeof me!=='undefined')decorate(me)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.JunjaRank={open:openRank,badge,decorate};
})();