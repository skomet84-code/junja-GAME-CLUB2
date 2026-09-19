(()=>{'use strict';
const fmt=n=>new Intl.NumberFormat('ko-KR').format(Number(n||0));
let state=null;
function toast(msg){const el=document.getElementById('toast');if(el){el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3200)}else alert(msg)}
async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'요청 실패');return d}
function ensure(){
 if(document.getElementById('rankBtn'))return;
 const shop=document.getElementById('shopBtn');if(!shop)return;
 const b=document.createElement('button');b.id='rankBtn';b.className='rank-pill';b.type='button';b.innerHTML='♛ 신분';shop.after(b);
 const modal=document.createElement('div');modal.id='rankModal';modal.className='rank-modal hidden';modal.innerHTML='<div class="rank-backdrop"></div><div class="rank-card panel"><button class="rank-close" type="button">×</button><div id="rankContent"></div></div>';
 document.body.appendChild(modal);
 b.onclick=()=>openRank();modal.querySelector('.rank-backdrop').onclick=close;modal.querySelector('.rank-close').onclick=close;
}
function close(){document.getElementById('rankModal')?.classList.add('hidden')}
function badge(rank,nick=''){return '<span class="social-rank rank-'+rank.className+'"><i>'+rank.icon+'</i><b>'+rank.name+'</b>'+(nick?'<em>'+nick+'</em>':'')+'</span>'}
function render(d){
 state=d;const r=d.rank,u=d.user,all=d.ranks||[];const next=r.next;
 const rows=all.map(x=>'<div class="rank-road '+(x.level===r.level?'current':'')+(x.level<r.level?' cleared':'')+'"><span>'+x.icon+'</span><b>'+x.name+'</b><small>'+(x.level===0?'START':fmt(x.cost)+' G')+'</small></div>').join('');
 document.getElementById('rankContent').innerHTML='<div class="rank-hero rank-'+r.className+'"><div class="rank-crown">'+r.icon+'</div><small>JUNJA SOCIAL STATUS</small><h2>'+r.name+'</h2><p>'+u.nickname+' · '+fmt(u.balance)+' G</p>'+badge(r)+'</div><div class="rank-copy"><b>신분은 돈으로 사는 명예 아이템</b><span>승급 비용은 즉시 소멸하며 계정에 영구 저장됩니다. 높은 신분일수록 프로필·로비에서 문장과 오라가 강해집니다.</span></div><div class="rank-roadmap">'+rows+'</div>'+(next?'<button id="rankPromote" class="rank-promote" type="button"><span>'+next.icon+' '+next.name+'으로 신분 상승</span><b>'+fmt(next.cost)+' G</b></button>':'<div class="rank-max">♛ JUNJA ROYAL · 최고 신분 달성</div>');
 document.getElementById('rankPromote')?.addEventListener('click',promote);
 decorate(u);
}
async function openRank(){ensure();const m=document.getElementById('rankModal');m.classList.remove('hidden');document.getElementById('rankContent').innerHTML='<div class="rank-loading">신분 정보를 불러오는 중...</div>';try{render(await api('/api/rank'))}catch(e){document.getElementById('rankContent').innerHTML='<div class="rank-loading">'+e.message+'</div>'}}
async function promote(){const b=document.getElementById('rankPromote');if(!b)return;const name=state?.rank?.next?.name||'다음 신분';const cost=state?.rank?.next?.cost||0;if(Number(state?.user?.balance||0)<Number(cost)){toast('보유머니가 부족합니다. 필요 금액: '+fmt(cost)+' G');return;}b.disabled=true;try{const d=await api('/api/rank/promote',{method:'POST',body:'{}'});promotionFX(d.rank);const fresh=await api('/api/rank');render(fresh);toast('👑 '+d.rank.name+' 신분으로 상승!');document.getElementById('walletBalance')&&(document.getElementById('walletBalance').textContent=fmt(d.user.balance)+' G')}catch(e){toast(e.message)}finally{b.disabled=false}}
function promotionFX(r){const fx=document.createElement('div');fx.className='rank-up-fx rank-'+r.className;fx.innerHTML='<div><span>'+r.icon+'</span><small>신분 상승!</small><b>'+r.name+'</b><em>JUNJA STATUS UPGRADE</em></div>';document.body.appendChild(fx);setTimeout(()=>fx.remove(),2800)}
function decorate(u){if(!u?.rank)return;const nick=document.getElementById('nickName');if(nick){nick.dataset.rank=u.rank.name;nick.classList.add('rank-name');nick.setAttribute('data-rank-icon',u.rank.icon)}document.body.dataset.socialRank=u.rank.className}
async function boot(){ensure();try{const d=await api('/api/me');decorate(d.user)}catch{}}
new MutationObserver(()=>ensure()).observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',boot);setTimeout(boot,800);
window.JunjaRank={open:openRank,badge};
})();