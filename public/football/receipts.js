(()=>{'use strict';
// JPL fictional-game-money prediction slips. All numbers and fixtures originate on the server.
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pickName={H:'승',D:'무',A:'패'};
const outcomeText={OPEN:'경기예정',WIN:'적중',LOSE:'미적중',FORFEITED:'개인회생 소멸'};
const dateTime=ms=>new Date(ms).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const money=x=>{
 let n=BigInt(x||'0'),sign=n<0n?'-':'';if(n<0n)n=-n;
 const out=[];for(const [name,power] of [['경',10000000000000000n],['조',1000000000000n],['억',100000000n],['만',10000n]]){
  if(n>=power){out.push((n/power).toLocaleString('ko-KR')+name);n%=power}
 }
 if(n||!out.length)out.push(n.toLocaleString('ko-KR'));
 return sign+out.join(' ')+' G';
};
let current=null,teams=new Map(),dlg=null;
const id=t=>t.receiptNumber||'JPL-'+t.seasonId+'-'+String(t.id).slice(-10).toUpperCase();
const name=clubId=>teams.get(clubId)?.short||clubId;
const lines=t=>t.legs.map((p,i)=>({
 seq:i+1,
 home:name(p.home),away:name(p.away),handicap:p.market==='HDP'?'H '+(p.line>0?'+':'')+p.line:'일반',
 choice:pickName[p.pick]||p.pick,odds:(p.odds100/100).toFixed(2),kickoff:dateTime(p.kickoff)
}));
const net=t=>t.status==='WIN'?t.paid:t.status==='LOSE'||t.status==='FORFEITED'?'0':t.expectedNet??t.potential;
const tax=t=>t.status==='WIN'?t.tax||'0':t.status==='LOSE'||t.status==='FORFEITED'?'0':t.expectedTax||'0';
function init(){
 if(dlg)return;
 dlg=document.createElement('dialog');
 dlg.className='jpl-receipt-dialog';
 dlg.setAttribute('aria-label','준자 프리미어리그 구매표');
 dlg.innerHTML='<div class="jpl-receipt-shell"><div class="jpl-receipt-toolbar"><span>♛ JUNJA PREMIER LEAGUE</span><button data-jpl-receipt-action="close" type="button" aria-label="구매표 닫기">×</button></div><div id="jplReceiptContent"></div><div class="jpl-receipt-actions"><button type="button" data-jpl-receipt-action="copy">내역 복사</button><button type="button" data-jpl-receipt-action="save">이미지 저장</button><button type="button" data-jpl-receipt-action="share">이미지 공유</button></div><p class="jpl-receipt-note">준자랜드 가상 게임머니(G) 전용 구매 기록 · 실제 스포츠토토/현금 거래 아님</p></div>';
 document.body.appendChild(dlg);
 dlg.addEventListener('click',ev=>{
  if(ev.target===dlg){dlg.close();return}
  const btn=ev.target.closest('[data-jpl-receipt-action]');if(!btn)return;
  const act=btn.dataset.jplReceiptAction;
  if(act==='close')dlg.close();
  if(act==='copy')copy();
  if(act==='save')exportImage(false);
  if(act==='share')exportImage(true);
 });
}
function open(ticket,clubList=[]){
 if(!ticket||!Array.isArray(ticket.legs))return;
 init();current=ticket;
 teams=new Map(clubList.map(x=>[x.id,x]));
 const items=lines(ticket);
 const rows=items.map(l=>
  '<tr><td><b>'+String(l.seq).padStart(2,'0')+'</b><small>'+esc(l.kickoff)+'</small></td><td><strong>'+esc(l.home)+'</strong><span>vs</span><strong>'+esc(l.away)+'</strong><small>'+esc(l.handicap)+'</small></td><td><b>'+esc(l.choice)+'</b></td><td>'+l.odds+'</td></tr>'
 ).join('');
 document.getElementById('jplReceiptContent').innerHTML=
  '<article class="jpl-printed-ticket"><div class="jpl-printed-top"><div class="jpl-printed-logo">♛</div><div><h2>JPL MATCH PREDICTION</h2><p>OFFICIAL IN-GAME PURCHASE RECORD</p></div></div>'+
  '<div class="jpl-printed-stamp"><span>승무패 · '+ticket.legs.length+'경기 조합</span><strong>'+esc(outcomeText[ticket.status]||ticket.status)+'</strong></div>'+
  '<div class="jpl-printed-meta"><span>발권번호 <b>'+esc(id(ticket))+'</b></span><span>구매일시 <b>'+esc(dateTime(ticket.placedAt))+'</b></span></div>'+
  '<table class="jpl-printed-lines"><thead><tr><th>경기</th><th>HOME / AWAY</th><th>선택</th><th>배당</th></tr></thead><tbody>'+rows+'</tbody></table>'+
  '<div class="jpl-printed-math"><div><span>선택경기 수</span><b>'+ticket.legs.length+'경기</b></div><div><span>총 적중 배당률</span><b>'+esc(ticket.totalOdds)+' 배</b></div><div><span>구매 게임머니</span><b>'+money(ticket.stake)+'</b></div><div><span>적중 시 총지급</span><b>'+money(ticket.potential)+'</b></div>'+
  (BigInt(tax(ticket))>0n?'<div><span>'+(ticket.status==='OPEN'?'예상 ':'')+'슬롯 잭팟 적립 (20%)</span><b>−'+money(tax(ticket))+'</b></div>':'')+
  '<div class="jpl-printed-total"><span>'+(ticket.status==='WIN'?'실제 지급':'적중 시 예상 실수령')+'</span><strong>'+money(net(ticket))+'</strong></div></div>'+
  '<div class="jpl-printed-footer">JUNJA PREMIER LEAGUE · 시즌 '+esc(ticket.seasonId)+'<br>가상 경기 예측표입니다. 결과 및 당첨은 보장되지 않습니다.</div></article>';
 if(!dlg.open)dlg.showModal();
}
const summary=()=>{
 const t=current;if(!t)return '';
 return ['♛ JUNJA PREMIER LEAGUE 구매표',id(t),'구매: '+dateTime(t.placedAt),
  ...lines(t).map(l=>l.seq+'. '+l.home+' vs '+l.away+' | '+l.handicap+' '+l.choice+' | '+l.odds+'배'),
  '총 배당 '+t.totalOdds+'배','구매금 '+money(t.stake),
  '총 예상 적중 '+money(t.potential),
  '예상/실지급 '+money(net(t)),'상태 '+(outcomeText[t.status]||t.status),
  '[준자랜드 가상 게임머니 전용]'].join('\n');
};
async function copy(){
 try{
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(summary());alert('구매표 내용이 복사됐어.')}
  else window.prompt('아래 내용을 길게 눌러 복사해 줘.',summary());
 }catch{window.prompt('아래 내용을 길게 눌러 복사해 줘.',summary())}
}
function drawImage(){
 const t=current;if(!t)throw Error('구매표를 찾을 수 없어.');
 const rows=lines(t),W=930,scale=2,extra=BigInt(tax(t))>0n?1:0,H=770+rows.length*96+extra*53;
 const canvas=document.createElement('canvas');canvas.width=W*scale;canvas.height=H*scale;
 const c=canvas.getContext('2d');c.scale(scale,scale);
 c.fillStyle='#101827';c.fillRect(0,0,W,H);
 c.fillStyle='#f9f8f4';c.fillRect(35,35,W-70,H-70);
 c.fillStyle='#d3aa61';c.fillRect(35,35,W-70,12);
 c.textBaseline='alphabetic';
 const write=(text,x,y,size=26,bold=false,color='#152034',align='left')=>{
  c.fillStyle=color;c.font=(bold?'800 ':'500 ')+size+'px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  c.textAlign=align;c.fillText(String(text),x,y);
 };
 write('♛  JUNJA PREMIER LEAGUE',73,108,30,true);
 write('VIRTUAL MATCH PREDICTION RECEIPT',73,140,17,false,'#647086');
 c.fillStyle='#edf0f4';c.fillRect(65,166,W-130,77);
 write('승무패 · '+t.legs.length+'경기 조합',84,210,25,true);
 write(outcomeText[t.status]||t.status,W-85,210,25,true,'#996c24','right');
 write('구매 '+dateTime(t.placedAt),73,278,21,false,'#56647b');
 write('발권 '+id(t),W-73,278,19,true,'#37425a','right');
 c.strokeStyle='#bbc3cc';c.setLineDash([10,7]);c.beginPath();c.moveTo(72,310);c.lineTo(W-72,310);c.stroke();c.setLineDash([]);
 write('순번',82,345,18,true);write('경기 / 핸디캡',173,345,18,true);write('선택',700,345,18,true);write('배당',W-82,345,18,true,'#152034','right');
 let y=382;
 rows.forEach(l=>{
  c.fillStyle=l.seq%2?'#fffefa':'#f0f2f5';c.fillRect(65,y-25,W-130,83);
  write(String(l.seq).padStart(2,'0'),82,y+13,21,true);
  write(l.home+' vs '+l.away,173,y+8,25,true);
  write(l.handicap+' · '+l.kickoff,173,y+35,17,false,'#647086');
  write(l.choice,704,y+17,27,true,'#155a9d');
  write(l.odds,W-82,y+17,25,true,'#152034','right');
  y+=96;
 });
 c.strokeStyle='#bbc3cc';c.setLineDash([10,7]);c.beginPath();c.moveTo(72,y-4);c.lineTo(W-72,y-4);c.stroke();c.setLineDash([]);
 let ty=y+42;
 const summaryRow=(label,value,bold=false)=>{
  write(label,80,ty,21,bold,'#44536c');
  write(value,W-82,ty,25,bold,'#152034','right');ty+=53;
 };
 summaryRow('선택경기수',t.legs.length+'경기');
 summaryRow('예상 적중배당률',t.totalOdds+' 배');
 summaryRow('구매 게임머니',money(t.stake));
 if(extra)summaryRow('잭팟 적립 20%',money(tax(t)));
 c.fillStyle='#dfc38b';c.fillRect(65,ty-30,W-130,69);
 write('예상 / 실제 실수령',81,ty+13,20,true,'#1b2836');
 write(money(net(t)),W-83,ty+15,31,true,'#1b2836','right');
 write('JUNJA LAND · GAME MONEY ONLY · NO CASH VALUE',W/2,H-70,17,true,'#59677e','center');
 return canvas;
}
async function exportImage(share){
 try{
  const canvas=drawImage(),blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('이미지 생성에 실패했어.');
  const fileName='JPL_'+String(current.seasonId).replace(/[^A-Za-z0-9_-]/g,'')+'_'+String(current.id).replace(/[^A-Za-z0-9_-]/g,'').slice(0,12)+'.png';
  const file=new File([blob],fileName,{type:'image/png'});
  if(share&&navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
   await navigator.share({files:[file],title:'JPL 승무패 구매표',text:'준자랜드에서 발권한 가상 승무패 구매표'});
   return;
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(e){if(e?.name!=='AbortError')alert('구매표 저장/공유에 실패했어: '+(e.message||e))}
}
window.JPLReceipts={open};
})();