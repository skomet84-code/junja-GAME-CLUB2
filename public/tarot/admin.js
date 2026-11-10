(()=>{'use strict';
const $=id=>document.getElementById(id),safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let page=1,pages=1,busy=false,filter={q:'',category:''};
const date=ts=>{const d=new Date(Number(ts));return Number.isFinite(d.getTime())?d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'날짜 미상';};
function render(row){const r=row.reading,i=r.interpretation||{},u=row.user;
return '<details><summary><strong>'+safe(u.nickname)+' · '+safe(u.username||'회원 #'+u.id)+'</strong><span>'+safe(r.title)+' · '+safe(date(r.createdAt))+' (한국시간)</span><small>'+r.cards.map(c=>safe(c.name)+' '+(c.reversed?'역방향':'정방향')).join(' / ')+' · 눌러서 해석 보기</small></summary><div class="content"><div class="cards">'+r.cards.map(c=>'<article class="card"><small>'+safe(c.position)+'</small><div class="symbol">'+safe(c.symbol)+'</div><strong>'+safe(c.name)+'</strong><p>'+(c.reversed?'역방향':'정방향')+'</p></article>').join('')+'</div><h2>'+safe(i.headline||r.title)+'</h2><p>'+safe(i.opening)+'</p><p>'+safe(i.bridge)+'</p>'+(i.details||[]).map(d=>'<section class="reading"><h3>'+safe(d.position)+' · '+safe(d.name)+' ('+safe(d.orientation)+')</h3><p>'+safe(d.description)+'</p></section>').join('')+'<section class="reading"><h3>카드 조합 해석</h3><p>'+safe(i.connection)+'</p><h3>조언</h3><p>'+safe(i.advice)+'</p><small>'+safe(i.disclaimer)+'</small></section></div></details>';
}
async function load(target=1){if(busy)return;busy=true;$('search').disabled=true;$('prev').disabled=true;$('next').disabled=true;$('rows').replaceChildren();$('status').textContent='타로 기록을 불러오는 중…';
try{const res=await fetch('/api/admin/tarot?'+new URLSearchParams({...filter,page:String(target)}),{credentials:'same-origin',cache:'no-store'});const data=await res.json();if(!res.ok)throw Error(data.error||'조회에 실패했습니다.');page=data.pagination.page;pages=data.pagination.pages;
if($('category').options.length===1)for(const c of data.categories){const o=document.createElement('option');o.value=c.category;o.textContent=c.title;$('category').append(o);}
$('rows').innerHTML=data.rows.map(render).join('');$('status').textContent=data.pagination.total?'총 '+data.pagination.total+'건 · 원본 기록 조회':'해당 조건의 타로 기록이 없습니다.';$('page').textContent=page+' / '+pages+' 페이지';
}catch(e){$('status').textContent=e.message;$('page').textContent='';page=1;pages=1;}finally{busy=false;$('search').disabled=false;$('prev').disabled=page<=1;$('next').disabled=page>=pages;}}
$('filters').addEventListener('submit',e=>{e.preventDefault();if(busy)return;filter={q:$('query').value.trim(),category:$('category').value};load(1);});$('prev').onclick=()=>load(page-1);$('next').onclick=()=>load(page+1);load();
})();
