(()=>{
'use strict';
const seen=new Set();
let capQueued=false;
const sleep25=ms=>new Promise(r=>setTimeout(r,ms));
const NODE={START:[90,90],FINISH:[90,90],O1:[90,74],O2:[90,58],O3:[90,42],O4:[90,26],O5:[90,10],O6:[74,10],O7:[58,10],O8:[42,10],O9:[26,10],O10:[10,10],O11:[10,26],O12:[10,42],O13:[10,58],O14:[10,74],O15:[10,90],O16:[26,90],O17:[42,90],O18:[58,90],O19:[74,90],O20:[82,90],A1:[75,25],A2:[63,37],C:[50,50],A4:[37,63],A5:[25,75],B1:[25,25],B2:[37,37],B4:[63,63],B5:[75,75]};
function removeCaps(){
  document.querySelectorAll('main input[type="number"]').forEach(el=>{
    if(el.closest('#view-admin'))return;
    el.removeAttribute('max');
    if(/bet|buyin|wager/i.test(el.id||''))el.dataset.walletLimit='1';
  });
  document.querySelectorAll('main small').forEach(el=>{if(/MAX\s*100,?000\s*G?/i.test(el.textContent||''))el.textContent='보유머니 한도까지';});
}
function scheduleCaps(){if(capQueued)return;capQueued=true;requestAnimationFrame(()=>{capQueued=false;removeCaps()})}
function decorate(){
  document.body.classList.add('junja-v25');
  document.querySelectorAll('main .view').forEach(v=>{const id=(v.id||'').replace('view-','');if(id)v.dataset.theme=id;});
  const main=document.querySelector('main');if(main&&!main.querySelector('.v25-ambient')){const x=document.createElement('div');x.className='v25-ambient';x.innerHTML='<i></i><i></i><i></i>';main.prepend(x)}
  removeCaps();
}
function centerRouteDialog(piece){
  const raw=piece?.node||'START';
  if(raw!=='CA'&&typeof yutPhysicalClient==='function'&&!['O5','O10'].includes(yutPhysicalClient(piece)))return Promise.resolve(null);
  const center=raw==='CA';
  return new Promise(resolve=>{
    const wrap=document.createElement('div');wrap.className='yut-route-modal v25-route-modal';
    wrap.innerHTML=`<div class="yut-route-card"><small>${center?'CENTER SHORTCUT':'ROUTE SELECT'}</small><h3>${center?'가운데에서 결승 지름길로 꺾을까?':'어느 길로 갈까?'}</h3><p>${center?'가운데 큰 원은 갈림길이야. 결승 방향 대각선으로 꺾거나 기존 대각선을 계속 갈 수 있어.':'코너에 정확히 도착했어. 지름길 또는 외곽길을 선택해.'}</p><div class="yut-route-options"><button data-route="shortcut"><b>${center?'↘ 결승 지름길':'↘ 지름길'}</b><span>${center?'중앙에서 우하단 결승 방향':'중앙 대각선으로 빠르게'}</span></button><button data-route="outer"><b>${center?'↙ 그대로 진행':'↪ 외곽길'}</b><span>${center?'기존 대각선을 계속 이동':'바깥 칸을 계속 이동'}</span></button></div></div>`;
    document.body.appendChild(wrap);wrap.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{const v=b.dataset.route;wrap.remove();try{fx()}catch{}resolve(v)});wrap.onclick=e=>{if(e.target===wrap){wrap.remove();resolve(null)}};
  });
}
function motionToken(board,label,color='#f6cf67'){
  const t=document.createElement('div');t.className='yut-motion-token';t.style.setProperty('--pc',color);t.innerHTML=`<span>${label}</span>`;board.appendChild(t);return t;
}
async function animateTrace(root,last,label,color){
  if(!last?.trace?.length)return;const board=root.querySelector('.true-yut-board');if(!board)return;
  const key=`${last.at||''}:${last.sideId||last.side||''}:${last.from||''}:${last.to||''}:${last.move||''}`;if(seen.has(key))return;seen.add(key);if(seen.size>120){const a=[...seen].slice(0,50);a.forEach(x=>seen.delete(x))}
  const seq=[last.from,...last.trace].filter(Boolean).map(n=>n==='CA'||n==='CB'?'C':n);const token=motionToken(board,label,color);
  const place=n=>{const p=NODE[n]||NODE.START;token.style.left=p[0]+'%';token.style.top=p[1]+'%'};place(seq[0]);await sleep25(60);
  for(const n of seq.slice(1)){place(n);token.classList.add('moving');await sleep25(310);try{fx('click')}catch{}}
  token.classList.add('arrived');await sleep25(220);token.remove();
}
function opponentThrow(root,last,nickname='상대'){
  if(!last||last.type!=='throw')return;const key=`throw:${last.at||last.userId+':'+last.name}`;if(seen.has(key))return;seen.add(key);
  const scene=root.querySelector('.yut-toss-scene');if(scene){scene.classList.add('throwing','opponent-throwing');setTimeout(()=>scene.classList.remove('throwing','opponent-throwing'),1050)}
  const panel=root.querySelector('.throw-control');if(panel){const b=document.createElement('div');b.className='opponent-yut-banner';b.innerHTML=`<b>🪵 ${nickname}</b><span>${last.name||'윷'} · ${last.move||''}칸</span>`;panel.prepend(b);setTimeout(()=>b.remove(),1500)}
}
function installYutHooks(){
  try{
    if(typeof yutRouteDialog==='function')yutRouteDialog=centerRouteDialog;
    if(typeof yutPieceButtons==='function'){
      const origPieces=yutPieceButtons;yutPieceButtons=function(side,sel,attr){const html=origPieces(side,sel,attr);setTimeout(()=>{document.querySelectorAll(`[${attr}] small`).forEach((s,i)=>{const p=side?.pieces?.[i];if(p?.node==='CA')s.textContent='C · 중앙 지름길 선택 가능'})},0);return html};
    }
    if(typeof renderYut==='function'){
      const orig=renderYut;renderYut=function(room){const r=orig(room);setTimeout(()=>{const root=document.querySelector('#yutRoom'),last=room?.yut?.last;if(!root||!last)return;const p=(room.players||[]).find(x=>Number(x.userId)===Number(last.userId));if(last.type==='throw'&&Number(last.userId)!==Number(me?.id))opponentThrow(root,last,p?.nickname||'상대');if(last.type==='move'){const side=(room.yut?.sides||[]).find(s=>s.id===last.sideId);animateTrace(root,last,side?.label||'말',side?.color)}},30);return r};
    }
    if(typeof renderSoloYut==='function'){
      const origSolo=renderSoloYut;renderSoloYut=function(g){const r=origSolo(g);setTimeout(()=>{const root=document.querySelector('#yutSoloRoom'),last=g?.last;if(!root||!last)return;if(last.type==='throw'&&last.side==='bot')opponentThrow(root,last,'J-BOT');if(last.type==='move')animateTrace(root,last,last.side==='bot'?'BOT':'ME',last.side==='bot'?'#71a8ff':'#f6cf67')},30);return r};
    }
  }catch(e){console.warn('[JUNJA v2.5] yut hook degraded',e)}
}
function init(){decorate();installYutHooks();new MutationObserver(scheduleCaps).observe(document.body,{subtree:true,childList:true});window.addEventListener('pageshow',decorate);window.addEventListener('resize',()=>document.documentElement.style.setProperty('--vh',(innerHeight*.01)+'px'))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
