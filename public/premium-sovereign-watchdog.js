'use strict';
/* Classic-script safety watchdog independent of the ES-module graph.
 * If the import map, Three.js, WebGL or GLB fails to initialize on iPhone,
 * the page must never display an unbounded spinner.
 */
(function(){
 const status=document.getElementById('atelierStatus');
 const loading=document.getElementById('atelierLoading');
 const fallback=document.getElementById('atelierFallback');
 const error=document.getElementById('atelierError');
 const retry=document.getElementById('atelierRetry');
 const info=document.getElementById('atelierInfo');
 if(!status||!loading||!fallback||!error)return;
 const READY_TIMEOUT_MS=22000;
 let completed=false;
 let firstError='';
 const snapshot=()=>{try{return window.JunjaSovereignAtelier?.snapshot?.()||null;}catch{return null;}};
 const showFailure=reason=>{
  if(completed||snapshot()?.ready)return;
  completed=true;
  loading.hidden=true;
  fallback.hidden=false;
  error.textContent=reason||'네트워크·브라우저 그래픽 연결이 지연되었습니다.';
  if(info)info.textContent='3D 모델 로딩 실패 · 재시도 또는 기존 전시실 이용';
  if(retry)retry.hidden=false;
 };
 if(retry)retry.addEventListener('click',()=>{
  // Reload everything including a stale import map/GLB cache.
  const next=new URL(location.href);
  const n=Math.min(99,1+(Number(next.searchParams.get('attempt'))||0));
  next.searchParams.set('attempt',String(n));
  location.replace(next.pathname+next.search+next.hash);
 });
 window.addEventListener('securitypolicyviolation',event=>{
  if(snapshot()?.ready)return;
  if(String(event.violatedDirective||'').includes('script-src')){
   firstError='브라우저 보안 정책에서 3D 프로그램 연결이 차단되었습니다.';
   showFailure(firstError);
  }
 });
 window.addEventListener('error',event=>{
  if(snapshot()?.ready)return;
  const el=event.target;
  if(el?.tagName==='SCRIPT'){
   firstError='3D 프로그램 파일을 불러오지 못했습니다.';
   showFailure(firstError);
  }
 },true);
 setTimeout(()=>{
  if(completed||snapshot()?.ready||snapshot()?.failed)return;
  status.textContent='3D 차량을 불러오는 중 · 모바일 연결 확인 중';
 },6500);
 setTimeout(()=>{
  const s=snapshot();
  if(completed||s?.ready)return;
  showFailure(s?.failed?'브라우저에서 3D 그래픽을 준비하지 못했습니다.':firstError||'22초 동안 3D 화면이 준비되지 않았습니다. 다시 시도해 주세요.');
 },READY_TIMEOUT_MS);
})();
