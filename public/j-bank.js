(()=>{'use strict';
const $=s=>document.querySelector(s),fmt=v=>{try{let n=BigInt(v??0),r='';for(const [name,size] of [['경',10000000000000000n],['조',1000000000000n],['억',100000000n]]){const p=n/size;if(p){r+=p.toLocaleString('ko-KR')+name+' ';n%=size}}return (r.trim()+(n?' '+n.toLocaleString('ko-KR'):'')).trim()||'0'}catch{return String(v)}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TIERS=['평민','상인','부호','귀족','남작','자작','백작','후작','공작','왕','황제','JUNJA ROYAL','THE ABSOLUTE','GOD JUNJA'];
const LIMITS=['5000000','30000000','100000000','500000000','1000000000','3000000000','10000000000','50000000000','100000000000','1000000000000','10000000000000','5000000000000000','100000000000000000','300000000000000000'];
let state=null,busy=false;
function mount(){
 if($('#jbankModal'))return;
 const div=document.createElement('div');div.id='jbankModal';div.className='jbank-modal';div.setAttribute('role','dialog');div.setAttribute('aria-modal','true');div.setAttribute('aria-label','J-BANK 은행');
 div.innerHTML='<div class="jbank-panel"><button id="jbankClose" class="jbank-close" aria-label="닫기" type="button">×</button><small class="jbank-kicker">JUNJA PRIVATE BANKING · VIRTUAL CURRENCY</small><h2>♛ J-BANK</h2><p>신분에 따라 달라지는 대출 한도 · 게임머니 전용 디지털 은행</p><div id="jbankContent">은행 정보 확인 중...</div><div id="jbankNotice" aria-live="polite"></div></div>';
 document.body.appendChild(div);
 div.addEventListener('click',e=>{if(e.target===div||e.target.closest('#jbankClose'))close();
  const choice=e.target.closest('[data-jbank-preset]');if(choice&&state){const type=choice.dataset.jbankType,input=$('#jbank'+(type==='borrow'?'Borrow':'Repay'));if(!input)return;let max=type==='borrow'?BigInt(state.available):BigInt(state.outstanding);if(type==='repay'&&BigInt(state.wallet)<max)max=BigInt(state.wallet);input.value=String(choice.dataset.jbankPreset==='max'?max:max*BigInt(choice.dataset.jbankPreset)/100n);}
  const action=e.target.closest('[data-jbank-action]');if(action)submit(action.dataset.jbankAction);
 });
 div.addEventListener('input',e=>{if(e.target.classList.contains('jbank-input'))e.target.value=e.target.value.replace(/[^0-9]/g,'');});
}
function notice(text,error=false){const n=$('#jbankNotice');if(n){n.textContent=text;n.className=error?'jbank-error':'jbank-success';}}
async function request(path,options){const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'은행 요청에 실패했습니다.');return d;}
function render(d){
 state=d;const debt=BigInt(d.outstanding),cash=BigInt(d.wallet),hasLoan=debt>0n;
 const q=d.rankSale;
 const saleHtml=q?'<section class="jbank-rank-sale"><div class="jbank-sale-heading">⚖️ <b>신분 매각 · 빚 상환</b><small>매각은 본인 선택이며 취소할 수 없습니다.</small></div>'+
 '<p>현재 <b>'+esc(q.fromName)+'</b> → <b>'+esc(q.toName)+'</b> · 승급비용의 <b>70%</b> 매입</p>'+
 '<div class="jbank-sale-summary"><span>매각대금 <b>'+fmt(q.salePrice)+' G</b></span><span>대출 자동 상환 <b>'+fmt(q.repayAmount)+' G</b></span><span>매각 후 남는 빚 <b>'+fmt(q.remainingDebt)+' G</b></span><span>지갑에 지급 <b>'+fmt(q.cashBack)+' G</b></span></div>'+
 '<p class="jbank-sale-caution">매각대금은 이자부터 갚는 데 사용돼요. 남은 대출금이 있다면 추가 대출·승급은 계속 불가합니다. 완납하면 한 단계 낮아진 신분의 한도 내에서 다시 대출할 수 있습니다. 되사려면 다시 정상 승급비용을 내야 해요.</p>'+
 '<button class="jbank-submit jbank-sell-btn" data-jbank-action="sellRank" type="button">신분 1단계 매각 · 빚 상환하기</button></section>':
 '<div class="jbank-sale-muted">미상환 대출이 있고 평민보다 높은 등급일 때 신분 매각을 사용할 수 있습니다.</div>';
 $('#jbankContent').innerHTML='<div class="jbank-member">♛ '+esc(d.rank.name)+' 신분 · 한도 '+fmt(d.loanLimit)+' G</div>'+
 '<div class="jbank-grid"><div><small>신규 대출 가능</small><strong>'+fmt(d.available)+' G</strong></div><div><small>총 상환 잔액</small><strong>'+fmt(debt)+' G</strong></div><div><small>남은 원금</small><strong>'+fmt(d.principal)+' G</strong></div><div><small>누적 이자</small><strong>'+fmt(d.interest)+' G</strong></div></div>'+
 '<p class="jbank-terms">📖 <b>대출 안내</b> — 게임머니 G 전용 · 원금 기준 일 0.1% 단리 · 한국시간 날짜가 바뀌면 이자 발생 · 이자부터 상환 · 복리/별도 연체료 없음.<br><b>미상환 시 추가 대출 및 신분 승급 불가</b>. 원금과 이자를 모두 갚으면 즉시 신분 승급 가능합니다.</p>'+
 '<div class="jbank-forms"><section><h3>🏦 대출 신청</h3><label>대출금 G<input id="jbankBorrow" class="jbank-input" inputmode="numeric" type="text" placeholder="최소 '+fmt(d.minLoan)+' G" '+(hasLoan?'disabled':'')+'></label><div class="jbank-presets"><button type="button" data-jbank-type="borrow" data-jbank-preset="25" '+(hasLoan?'disabled':'')+'>25%</button><button type="button" data-jbank-type="borrow" data-jbank-preset="50" '+(hasLoan?'disabled':'')+'>50%</button><button type="button" data-jbank-type="borrow" data-jbank-preset="max" '+(hasLoan?'disabled':'')+'>최대한도</button></div><button class="jbank-submit" data-jbank-action="borrow" '+(hasLoan?'disabled':'')+'>게임머니 대출받기</button></section>'+
 '<section><h3>💳 원금·이자 상환</h3><label>상환금 G<input id="jbankRepay" class="jbank-input" inputmode="numeric" type="text" placeholder="보유 '+fmt(cash)+' G" '+(!hasLoan?'disabled':'')+'></label><div class="jbank-presets"><button type="button" data-jbank-type="repay" data-jbank-preset="25" '+(!hasLoan?'disabled':'')+'>25%</button><button type="button" data-jbank-type="repay" data-jbank-preset="50" '+(!hasLoan?'disabled':'')+'>50%</button><button type="button" data-jbank-type="repay" data-jbank-preset="max" '+(!hasLoan?'disabled':'')+'>상환 가능 최대</button></div><button class="jbank-submit repay" data-jbank-action="repay" '+(!hasLoan?'disabled':'')+'>입력 금액 상환</button><button class="jbank-submit repay" data-jbank-action="all" '+(!hasLoan||cash<debt?'disabled':'')+'>원금+이자 전액 완납</button></section></div>'+
 saleHtml+'<details class="jbank-tiers"><summary>신분별 J-BANK 대출 한도 확인</summary><table><tbody>'+TIERS.map((tier,i)=>'<tr class="'+(d.rank.level===i?'current':'')+'"><td>'+esc(tier)+'</td><td>'+fmt(LIMITS[i])+' G</td></tr>').join('')+'</tbody></table></details>';
}
async function open(){mount();$('#jbankModal').classList.add('open');notice('');try{render(await request('/api/jbank'))}catch(e){$('#jbankContent').textContent=e.message;notice('다시 열어 주세요.',true);}}
function close(){$('#jbankModal')?.classList.remove('open');}
async function sellRank(){
 if(busy||!state?.rankSale)return;
 const quote=state.rankSale;
 const details=quote.fromName+' → '+quote.toName+'\n매각대금: '+fmt(quote.salePrice)+' G (승급비의 70%)\n상환: '+fmt(quote.repayAmount)+' G\n남는 빚: '+fmt(quote.remainingDebt)+' G\n지갑 지급: '+fmt(quote.cashBack)+' G\n\n강등은 취소할 수 없습니다. 정말 매각할까요?';
 if(!confirm(details))return;
 busy=true;
 document.querySelectorAll('#jbankModal [data-jbank-action]').forEach(b=>b.disabled=true);
 try{
  const requestId=crypto.randomUUID();
  const d=await request('/api/jbank/sell-rank',{method:'POST',body:JSON.stringify({requestId,confirmation:{level:quote.fromLevel,debt:state.outstanding,price:quote.salePrice}})});
  render(d.status);
  document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{balance:d.status.wallet,user:d.user}}));
  notice('신분 매각: '+d.sale.fromName+' → '+d.sale.toName+' · '+fmt(d.sale.repaid)+' G 상환. '+
   (BigInt(d.status.outstanding)>0n?'남은 빚 '+fmt(d.status.outstanding)+' G를 완납해야 추가 대출 가능.':'완납 성공! 낮아진 신분의 한도로 다시 대출할 수 있어요.'));
 }catch(e){try{render(await request('/api/jbank'))}catch{}notice(e.message,true)}
 finally{busy=false;}
}
async function submit(action){if(action==='sellRank')return sellRank();
 if(busy||!state)return;const borrow=action==='borrow';
 const raw=action==='all'?'all':$('#jbank'+(borrow?'Borrow':'Repay'))?.value?.trim();
 if(raw!=='all'&&!/^[1-9][0-9]*$/.test(String(raw||''))){notice('금액을 정확히 입력해 주세요.',true);return;}
 if(borrow&&(BigInt(raw)<BigInt(state.minLoan)||BigInt(raw)>BigInt(state.available))){notice('최소 100만 G부터 현재 신분 한도 이내로 신청해 주세요.',true);return;}
 if(!borrow&&raw!=='all'&&(BigInt(raw)>BigInt(state.outstanding)||BigInt(raw)>BigInt(state.wallet))){notice('현재 상환 잔액과 보유머니를 확인해 주세요.',true);return;}
 if(!confirm(borrow?fmt(raw)+' G 대출을 신청할까요? 매일 원금의 0.1% 이자가 발생하며 완납 전 신분 승급이 불가능합니다.':'대출금을 상환할까요?'))return;
 busy=true;document.querySelectorAll('#jbankModal [data-jbank-action]').forEach(b=>b.disabled=true);
 try{const requestId=crypto.randomUUID();const d=await request('/api/jbank/'+(borrow?'borrow':'repay'),{method:'POST',body:JSON.stringify({amount:raw,requestId})});render(d.status);document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{balance:d.status.wallet,user:d.user}}));notice(borrow?'대출 입금 완료!':'상환 완료.'+(BigInt(d.status.outstanding)===0n?' 신분 승급 제한이 해제되었습니다.':''));}
 catch(e){notice(e.message,true)}finally{busy=false;}
}
function boot(){document.getElementById('jBankBtn')?.addEventListener('click',open);document.getElementById('jBankHeroBtn')?.addEventListener('click',open);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.JBank={open,close};
})();