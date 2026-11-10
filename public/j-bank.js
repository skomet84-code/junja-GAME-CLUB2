(()=>{'use strict';
const $=s=>document.querySelector(s),fmt=v=>{try{let n=BigInt(v??0),r='';for(const [name,size] of [['경',10000000000000000n],['조',1000000000000n],['억',100000000n]]){const p=n/size;if(p){r+=p.toLocaleString('ko-KR')+name+' ';n%=size}}return (r.trim()+(n?' '+n.toLocaleString('ko-KR'):'')).trim()||'0'}catch{return String(v)}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TIERS=['평민','상인','부호','귀족','남작','자작','백작','후작','공작','왕','황제','JUNJA ROYAL','THE ABSOLUTE','GOD JUNJA'];
const LIMITS=['5000000','30000000','100000000','500000000','1000000000','3000000000','10000000000','50000000000','100000000000','1000000000000','10000000000000','5000000000000000','100000000000000000','300000000000000000'];
let state=null,busy=false;
function mount(){
 if($('#jbankModal'))return;
 const div=document.createElement('div');div.id='jbankModal';div.className='jbank-modal';div.setAttribute('role','dialog');div.setAttribute('aria-modal','true');div.setAttribute('aria-label','J-BANK 은행');
 div.innerHTML='<div class="jbank-panel"><button id="jbankClose" class="jbank-close" aria-label="닫기" type="button">×</button><small class="jbank-kicker">JUNJA PRIVATE BANKING · VIRTUAL CURRENCY</small><h2>♛ J-BANK</h2><p>신분에 따라 달라지는 대출 한도 · 게임머니 전용 디지털 은행</p><button id="jbankMarketOpen" class="jstock-launch" type="button"><span><b>📈 준자 주식 거래소</b><small>준자반도체 · 물산 · 엔터 · 바이오 · 에너지</small></span><strong>J-STOCK 입장 ›</strong></button><button id="jbankCoinOpen" class="jstock-launch" type="button"><span><b>🪙 J-COIN 거래소</b><small>8종 코인 · 15분 변동 · 24시간 거래</small></span><strong>J-COIN 입장 ›</strong></button><div id="jbankContent">은행 정보 확인 중...</div><div id="jbankNotice" aria-live="polite"></div></div>';
 document.body.appendChild(div);
 div.addEventListener('click',e=>{if(e.target===div||e.target.closest('#jbankClose'))close();
  const choice=e.target.closest('[data-jbank-preset]');if(choice&&state){const type=choice.dataset.jbankType;
   const credit=type.startsWith('credit'),borrow=type==='borrow'||type==='creditBorrow';
   const input=$(credit?'#jcredit'+(borrow?'Borrow':'Repay'):'#jbank'+(borrow?'Borrow':'Repay'));
   if(!input)return;
   const quote=credit?state.credit:state;
   let max=BigInt(borrow?quote.available:quote.outstanding);
   if(!borrow&&BigInt(state.wallet)<max)max=BigInt(state.wallet);
   input.value=String(choice.dataset.jbankPreset==='max'?max:max*BigInt(choice.dataset.jbankPreset)/100n);}
  const action=e.target.closest('[data-jbank-action]');if(action)submit(action.dataset.jbankAction);
 });
 div.addEventListener('input',e=>{if(e.target.classList.contains('jbank-input'))e.target.value=e.target.value.replace(/[^0-9]/g,'');});
}
function notice(text,error=false){const n=$('#jbankNotice');if(n){n.textContent=text;n.className=error?'jbank-error':'jbank-success';}}
async function request(path,options){const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'은행 요청에 실패했습니다.');return d;}
function rehabilitationStatus(d){
 if(d.lastRehabilitation)return '이미 개인회생을 이용했어요. 개인회생은 계정당 한 번만 가능합니다.';
 if(d.canRehabilitate)return '미상환 신분·신용대출이 있다면 당일 즉시 신청할 수 있어요.';
 if(d.rehabilitationBlockedReason)return d.rehabilitationBlockedReason;
 if(BigInt(d.outstanding||'0')+BigInt(d.creditOutstanding||'0')===0n)return '미상환 대출이 없어 신청할 수 없어요.';
 return '신청 가능 여부를 다시 확인해 주세요.';
}
function render(d){
 state=d;const debt=BigInt(d.outstanding),cash=BigInt(d.wallet),hasLoan=debt>0n,loanLocked=!d.canBorrow;
 const q=d.rankSale;
 const saleHtml=q?'<section class="jbank-rank-sale"><div class="jbank-sale-heading">⚖️ <b>신분 매각 · 빚 상환</b><small>매각은 본인 선택이며 취소할 수 없습니다.</small></div>'+
 '<p>현재 <b>'+esc(q.fromName)+'</b> → <b>'+esc(q.toName)+'</b> · 승급비용의 <b>99%</b> 매입</p>'+
 '<div class="jbank-sale-summary"><span>매각대금 <b>'+fmt(q.salePrice)+' G</b></span><span>대출 자동 상환 <b>'+fmt(q.repayAmount)+' G</b></span><span>매각 후 남는 빚 <b>'+fmt(q.remainingDebt)+' G</b></span><span>지갑에 지급 <b>'+fmt(q.cashBack)+' G</b></span></div>'+
 '<p class="jbank-sale-caution">매각대금은 이자부터 갚는 데 사용돼요. 남은 대출금이 있다면 추가 대출·승급은 계속 불가합니다. 완납하면 한 단계 낮아진 신분의 한도 내에서 다시 대출할 수 있습니다. 되사려면 다시 정상 승급비용을 내야 해요.</p>'+
 '<button class="jbank-submit jbank-sell-btn" data-jbank-action="sellRank" type="button">신분 1단계 매각 · 빚 상환하기</button></section>':
 '<div class="jbank-sale-muted">미상환 대출이 있고 평민보다 높은 등급일 때 신분 매각을 사용할 수 있습니다.</div>';
 $('#jbankContent').innerHTML='<div class="jbank-member">♛ '+esc(d.rank.name)+' 신분 · 한도 '+fmt(d.loanLimit)+' G</div>'+
 '<div class="jbank-grid"><div><small>신분 대출 가능</small><strong>'+fmt(d.available)+' G</strong></div><div><small>총 상환 잔액</small><strong>'+fmt(debt)+' G</strong></div><div><small>남은 원금</small><strong>'+fmt(d.principal)+' G</strong></div><div><small>누적 이자</small><strong>'+fmt(d.interest)+' G</strong></div></div>'+
 '<p class="jbank-terms">📖 <b>대출 안내</b> — 게임머니 G 전용 · 원금 기준 일 0.1% 단리 · 이자 포함 7일 내 완납. 7일 초과 연체 시 현금·자유저축·적금·주식·코인·신분(99% 매각가) 순으로 자동 회수됩니다. 연체료는 없습니다.</p>'+
 (d.dueAt&&hasLoan?'<p class="jbank-terms">⏰ 상환 마감: '+new Date(d.dueAt).toLocaleString('ko-KR')+(d.overdue?' · <b>연체/강제 회수 대상</b>':'')+'</p>':'')+
 '<section class="jbank-rank-sale" id="jbankRehabilitation"><h3>🛟 개인회생 · 최후의 재출발</h3>'+
 '<p class="jbank-sale-caution">⚠️ 7일은 연체 강제매각 기준이야. 개인회생은 미상환 신분·신용대출이 있다면 당일 즉시 신청 가능해. 7일 초과 연체 시 자동 매각은 별도로 유지돼.</p>'+
 '<p>개인회생 신청 시 신분·신용대출은 탕감되지만 <b>기존 보유머니·신분·예적금·주식·코인·명품·아이템은 모두 초기화</b>돼요. 다시 시작할 게임머니 1,000억 G가 지급되며 <b>계정당 1회, 취소 불가</b>예요.</p>'+
 '<p class="jbank-terms"><b>현재 '+(d.canRehabilitate?'신청 가능':'신청 불가')+'</b> · '+esc(rehabilitationStatus(d))+'</p>'+
 '<button class="jbank-submit" data-jbank-action="rehabilitation" type="button">🛟 개인회생 신청'+(d.canRehabilitate?' · 최종 확인':' · 신청 조건 확인')+'</button></section>'+
 (loanLocked?'<p class="jbank-blocked-reason">🔒 신분 대출 제한: '+esc(d.borrowBlockedReason||'현재 대출 신청 조건을 확인해 주세요.')+'</p>':'')+
 '<div class="jbank-forms"><section><h3>🏦 신분 대출 신청</h3><label>대출금 G<input id="jbankBorrow" class="jbank-input" inputmode="numeric" type="text" placeholder="최소 '+fmt(d.minLoan)+' G" '+(loanLocked?'disabled':'')+'></label><div class="jbank-presets"><button type="button" data-jbank-type="borrow" data-jbank-preset="25" '+(loanLocked?'disabled':'')+'>25%</button><button type="button" data-jbank-type="borrow" data-jbank-preset="50" '+(loanLocked?'disabled':'')+'>50%</button><button type="button" data-jbank-type="borrow" data-jbank-preset="max" '+(loanLocked?'disabled':'')+'>최대한도</button></div><button class="jbank-submit" data-jbank-action="borrow" '+(loanLocked?'disabled':'')+'>게임머니 대출받기</button></section>'+
 '<section><h3>💳 원금·이자 상환</h3><label>상환금 G<input id="jbankRepay" class="jbank-input" inputmode="numeric" type="text" placeholder="보유 '+fmt(cash)+' G" '+(!hasLoan?'disabled':'')+'></label><div class="jbank-presets"><button type="button" data-jbank-type="repay" data-jbank-preset="25" '+(!hasLoan?'disabled':'')+'>25%</button><button type="button" data-jbank-type="repay" data-jbank-preset="50" '+(!hasLoan?'disabled':'')+'>50%</button><button type="button" data-jbank-type="repay" data-jbank-preset="max" '+(!hasLoan?'disabled':'')+'>상환 가능 최대</button></div><button class="jbank-submit repay" data-jbank-action="repay" '+(!hasLoan?'disabled':'')+'>입력 금액 상환</button><button class="jbank-submit repay" data-jbank-action="all" '+(!hasLoan||cash<debt?'disabled':'')+'>원금+이자 전액 완납</button></section></div>'+
 creditHtml(d.credit)+savingsHtml(d)+installmentHtml(d)+saleHtml+'<details class="jbank-tiers"><summary>신분별 J-BANK 대출 한도 확인</summary><table><tbody>'+TIERS.map((tier,i)=>'<tr class="'+(d.rank.level===i?'current':'')+'"><td>'+esc(tier)+'</td><td>'+fmt(LIMITS[i])+' G</td></tr>').join('')+'</tbody></table></details>';
}
function creditHtml(c){
 if(!c)return '';
 const locked=!c.canBorrow,hasDebt=BigInt(c.outstanding||'0')>0n;
 return '<section id="jbankCredit" class="jbank-rank-sale jcredit-panel">'+
 '<div class="jcredit-heading"><span class="jcredit-mark">50%</span><div><small>JUNJA PRIVATE CREDIT</small><h3>💎 총자산 신용대출</h3><p>신분별 한도와 별개 · 평가자산의 최대 50% · 일 0.2% 단리</p></div></div>'+
 '<div class="jbank-grid jcredit-values"><div><small>보유 총자산 평가액</small><strong>'+fmt(c.assets.gross)+' G</strong></div>'+
 '<div><small>기존 채무 차감 후 평가액</small><strong>'+fmt(c.assets.net)+' G</strong></div>'+
 '<div><small>최대 신용대출 한도 (50%)</small><strong>'+fmt(c.creditLimit)+' G</strong></div>'+
 '<div><small>지금 신청 가능액</small><strong>'+fmt(c.available)+' G</strong></div>'+
 '<div><small>신용대출 남은 원금</small><strong>'+fmt(c.principal)+' G</strong></div>'+
 '<div><small>현재 미납 이자</small><strong>'+fmt(c.interest)+' G</strong></div></div>'+
 '<details class="jcredit-details"><summary>총자산 평가 구성 확인</summary><div class="jcredit-breakdown">'+
 [['보유머니',c.assets.cash],['자유저축',c.assets.savings],['적금 원금',c.assets.installment],
  ['주식 시가',c.assets.stocks],['코인 시가',c.assets.coins],['명품 은행매입가(정가 75%)',c.assets.luxury]]
 .map(([k,v])=>'<div><span>'+k+'</span><b>'+fmt(v)+' G</b></div>').join('')+
 '</div><p>경매 등록 중인 명품, 신분 승급 비용 및 일반 장식 아이템은 신용평가에서 제외합니다.</p></details>'+
 '<p class="jbank-terms">상환기한 7일 · 원금 기준 일 0.2% 단리 · 기간 중 일부/전액 상환 가능. 7일 초과 미상환 시 보유머니 → 자유저축 → 적금 → 주식 → 코인 → 명품 순서로 자동 회수합니다. 주식·코인 매각에는 기존 거래 수수료가 적용되고, 명품은 은행 즉시매입가(정가 75%)로 정산됩니다.</p>'+
 (hasDebt?'<p class="jcredit-due">📅 상환기한 '+new Date(c.dueAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+(c.overdue?' · 연체 강제회수 진행':'')+' · 총 채무 '+fmt(c.outstanding)+' G</p>':'')+
 (locked?'<p class="jbank-blocked-reason">🔒 '+esc(c.blockedReason)+'</p>':'')+
 '<div class="jbank-forms"><section><h3>신용대출 신청</h3><label>대출금 G<input id="jcreditBorrow" class="jbank-input" inputmode="numeric" type="text" placeholder="최소 '+fmt(c.minLoan)+' G" '+(locked?'disabled':'')+'></label>'+
 '<div class="jbank-presets"><button type="button" data-jbank-type="creditBorrow" data-jbank-preset="25" '+(locked?'disabled':'')+'>25%</button><button type="button" data-jbank-type="creditBorrow" data-jbank-preset="50" '+(locked?'disabled':'')+'>50%</button><button type="button" data-jbank-type="creditBorrow" data-jbank-preset="max" '+(locked?'disabled':'')+'>최대한도</button></div>'+
 '<button class="jbank-submit jcredit-borrow" data-jbank-action="creditBorrow" '+(locked?'disabled':'')+'>총자산 기반 신용대출 받기</button></section>'+
 '<section><h3>신용대출 상환</h3><label>상환금 G<input id="jcreditRepay" class="jbank-input" inputmode="numeric" type="text" placeholder="현재 미상환 '+fmt(c.outstanding)+' G" '+(!hasDebt?'disabled':'')+'></label>'+
 '<div class="jbank-presets"><button type="button" data-jbank-type="creditRepay" data-jbank-preset="25" '+(!hasDebt?'disabled':'')+'>25%</button><button type="button" data-jbank-type="creditRepay" data-jbank-preset="50" '+(!hasDebt?'disabled':'')+'>50%</button><button type="button" data-jbank-type="creditRepay" data-jbank-preset="max" '+(!hasDebt?'disabled':'')+'>상환 가능 최대</button></div>'+
 '<button class="jbank-submit repay" data-jbank-action="creditRepay" '+(!hasDebt?'disabled':'')+'>입력 금액 상환</button>'+
 '<button class="jbank-submit repay" data-jbank-action="creditRepayAll" '+(!hasDebt||BigInt(state.wallet)<BigInt(c.outstanding)?'disabled':'')+'>신용대출 전액 완납</button></section></div></section>';
}
function savingsHtml(d){
 const s=d.savings;if(!s)return '';
 return '<section class="jbank-rank-sale"><h3>💰 자유저축 · 하루 '+esc(s.dailyInterestPct)+'%</h3><div class="jbank-grid"><div><small>저축 원금</small><strong>'+fmt(s.principal)+' G</strong></div><div><small>출금 가능 총액</small><strong>'+fmt(s.total)+' G</strong></div><div><small>미출금 이자</small><strong>'+fmt(s.interest)+' G</strong></div><div><small>지금까지 받은 이자</small><strong>'+fmt(s.totalEarned)+' G</strong></div></div><p class="jbank-terms">원금은 입금 직후부터 언제든 출금 가능 · 이자는 첫 24시간 예치 후 적립(원금 기준 일 0.05% 단리) · 접속하지 않아도 적립 · 출금한 금액은 지갑에 즉시 반영됩니다. 대출 완납 후 입금 가능.</p><div class="jbank-forms"><section><label>입금액 G<input id="jbankDeposit" class="jbank-input" inputmode="numeric" placeholder="보유 '+fmt(d.wallet)+' G"></label><button class="jbank-submit" data-jbank-action="deposit" '+(s.canDeposit?'':'disabled')+'>저축하기</button></section><section><label>출금액 G<input id="jbankWithdraw" class="jbank-input" inputmode="numeric" placeholder="최대 '+fmt(s.total)+' G"></label><button class="jbank-submit repay" data-jbank-action="withdraw" '+(s.canWithdraw?'':'disabled')+'>입력 금액 출금</button><button class="jbank-submit repay" data-jbank-action="withdrawAll" '+(s.canWithdraw?'':'disabled')+'>원금 + 이자 전액 출금</button></section></div></section>';
}
async function savingsSubmit(action){
 if(busy||!state)return;
 const deposit=action==='deposit',amount=action==='withdrawAll'?'all':$('#jbank'+(deposit?'Deposit':'Withdraw')).value.trim();
 if(amount!=='all'&&!/^[1-9][0-9]*$/.test(amount)){notice('금액을 정확히 입력해 주세요.',true);return;}
 busy=true;document.querySelectorAll('#jbankModal [data-jbank-action]').forEach(b=>b.disabled=true);
 try{
  const d=await request('/api/jbank/'+(deposit?'deposit':'withdraw'),{method:'POST',body:JSON.stringify({amount,requestId:crypto.randomUUID()})});
  render(d.status);document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{balance:d.status.wallet,user:d.user}}));
  notice(deposit?'저축 입금 완료! 예치한 시간만큼 이자가 쌓여요.':'저축 출금 완료! 지갑에 반영되었습니다.');
 }catch(e){try{render(await request('/api/jbank'))}catch{render(state)}notice(e.message,true)}finally{busy=false;}
}
function installmentHtml(d){
 const a=d.installment,dates=t=>new Date(t).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
 const terms='<p class="jbank-terms">가입 즉시 첫 회차 납입 · 한국시간 기준 날짜마다 한 회차(자정 이후 납입 가능, 하루 1회) · 직접 납입(자동이체 없음) · 회차별 실제 예치 시간에 따른 단리입니다. 놓친 회차는 추가 납입할 수 없으며 만기 금리는 일 0.05%로 낮아져요. 중도해지 시 원금만 반환됩니다. 기존 적금이 있어도 신분 대출을 신청하고 정상 납입할 수 있습니다. 단, 대출을 갚기 전에는 새로운 적금에 가입할 수 없습니다.</p>';
 if(!a)return '<section class="jbank-rank-sale"><h3>📅 차곡차곡 적금</h3>'+terms+'<div class="jbank-grid">'+(d.installmentProducts||[]).map(p=>'<div><b>'+p.days+'일 적금</b><strong>하루 '+esc(p.dailyInterestPct)+'%</strong></div>').join('')+'</div><label>기간<select id="jbankInstallmentDays" class="jbank-input">'+(d.installmentProducts||[]).map(p=>'<option value="'+p.days+'">'+p.days+'일 · 일 '+esc(p.dailyInterestPct)+'%</option>').join('')+'</select></label><label>매일 납입할 금액 G<input id="jbankInstallmentAmount" class="jbank-input" inputmode="numeric" placeholder="회차당 최소 1,000 G"></label><button class="jbank-submit" data-jbank-action="installmentOpen" '+(BigInt(d.outstanding)>0n?'disabled':'')+'>적금 가입 · 첫 회차 납입</button></section>';
 return '<section class="jbank-rank-sale"><h3>📅 '+a.days+'일 적금 · '+a.paidCount+'/'+a.days+'회 납입</h3><div class="jbank-grid"><div><small>회차 납입액</small><strong>'+fmt(a.amount)+' G</strong></div><div><small>쌓인 원금</small><strong>'+fmt(a.principal)+' G</strong></div><div><small>현재 누적 이자</small><strong>'+fmt(a.accruedInterest)+' G</strong></div><div><small>적용 일 금리</small><strong>'+esc(a.effectiveDailyInterestPct)+'%</strong></div></div><p>만기: '+esc(dates(a.maturesAt))+' (한국시간)<br>미납 '+a.missedCount+'회 · '+(a.matured?'만기 수령 가능':a.canPay?'오늘 회차 납입 가능':'다음 회차: '+esc(dates(a.nextPaymentAt)))+'</p>'+terms+(a.matured?'<p>수령액: <b>'+fmt(BigInt(a.principal)+BigInt(a.maturityInterestOnPaid))+' G</b></p><button class="jbank-submit" data-jbank-action="installmentClaim">원금 + 이자 만기 수령</button>':'<button class="jbank-submit" data-jbank-action="installmentPay" '+(a.canPay?'':'disabled')+'>'+(a.canPay?'오늘 회차 '+fmt(a.amount)+' G 납입':a.complete?'전체 회차 납입 완료':a.paidToday?'오늘 납입 완료 · 내일 가능':'다음 회차 납입 대기')+'</button><button class="jbank-submit repay" data-jbank-action="installmentCancel">중도해지 · 원금만 반환</button>')+'</section>';
}
async function installmentSubmit(action){
 if(busy||!state)return;
 let amount=state.installment?.id;
 if(action==='installmentOpen'){
  const raw=$('#jbankInstallmentAmount').value.trim(),days=Number($('#jbankInstallmentDays').value);
  if(!/^[1-9][0-9]*$/.test(raw)||BigInt(raw)<1000n){notice('회차당 1,000 G 이상 입력해 주세요.',true);return;}
  amount={days,amount:raw};
  if(!confirm(days+'일 동안 매일 '+fmt(raw)+' G씩 납입합니다. 총 납입 예정 원금은 '+fmt(BigInt(raw)*BigInt(days))+' G입니다. 지금 첫 회차를 납입할까요?'))return;
 }
 if(action==='installmentCancel'&&!confirm('중도해지하면 이자는 지급되지 않고 원금 '+fmt(state.installment.principal)+' G만 반환됩니다. 해지할까요?'))return;
 busy=true;document.querySelectorAll('#jbankModal [data-jbank-action]').forEach(b=>b.disabled=true);
 try{
  const d=await request('/api/jbank/'+action,{method:'POST',body:JSON.stringify({amount,requestId:crypto.randomUUID()})});
  render(d.status);document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{balance:d.status.wallet,user:d.user}}));
  notice(({installmentOpen:'적금 가입과 첫 회차 납입 완료!',installmentPay:'오늘 회차 납입 완료!',installmentClaim:'만기 원금과 이자가 지갑에 지급됐어요.',installmentCancel:'적금 해지 완료. 원금을 지갑에 반환했어요.'})[action]);
 }catch(e){try{render(await request('/api/jbank'))}catch{render(state)}notice(e.message,true)}finally{busy=false;}
}
async function open(){mount();$('#jbankModal').classList.add('open');notice('');try{render(await request('/api/jbank'))}catch(e){$('#jbankContent').textContent=e.message;notice('다시 열어 주세요.',true);}}
function close(){$('#jbankModal')?.classList.remove('open');}
async function sellRank(){
 if(busy||!state?.rankSale)return;
 const quote=state.rankSale;
 const details=quote.fromName+' → '+quote.toName+'\n매각대금: '+fmt(quote.salePrice)+' G (승급비의 99%)\n상환: '+fmt(quote.repayAmount)+' G\n남는 빚: '+fmt(quote.remainingDebt)+' G\n지갑 지급: '+fmt(quote.cashBack)+' G\n\n강등은 취소할 수 없습니다. 정말 매각할까요?';
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
async function rehabilitation(){
 if(busy||!state)return;
 if(!state.canRehabilitate){
  alert('개인회생 신청 조건 안내\n\n'+rehabilitationStatus(state)+'\n\n7일은 강제매각 기준이지 개인회생 대기기간이 아니야. 미상환 대출이 있다면 즉시 신청 가능하고 계정당 1회만 가능해.');
  return;
 }
 if(!confirm('지금 개인회생을 신청할까? 모든 신분·신용대출은 탕감되지만 지갑·신분·예적금·주식·코인·명품·아이템이 초기화되고 1,000억 G로 다시 시작해. 계정당 1회, 취소 불가.'))return;
 const typed=prompt('확인하려면 개인회생 이라고 정확히 입력해줘.');
 if(typed!=='개인회생'){notice('확인 문구가 일치하지 않습니다.',true);return}
 busy=true;
 try{
  const d=await request('/api/jbank/rehabilitation',{method:'POST',body:JSON.stringify({confirmation:typed,requestId:crypto.randomUUID()})});
  render(d.status);document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{balance:d.status.wallet,user:d.user}}));
  notice('개인회생 완료 · 채무 '+fmt(d.result.forgiven)+' G 탕감, 새 출발금 1,000억 G');
 }catch(e){notice(e.message,true)}finally{busy=false;}
}
async function creditSubmit(action){
 if(busy||!state?.credit)return;
 const borrow=action==='creditBorrow',all=action==='creditRepayAll';
 const raw=all?'all':$('#jcredit'+(borrow?'Borrow':'Repay'))?.value?.trim();
 if(raw!=='all'&&!/^[1-9][0-9]*$/.test(String(raw||''))){notice('대출 금액을 정확히 입력해 주세요.',true);return;}
 const c=state.credit;
 if(borrow&&(BigInt(raw)<BigInt(c.minLoan)||BigInt(raw)>BigInt(c.available))){notice('신용대출은 최소 100만 G부터 총자산의 50% 이내에서 신청할 수 있어요.',true);return;}
 if(!borrow&&raw!=='all'&&(BigInt(raw)>BigInt(c.outstanding)||BigInt(raw)>BigInt(state.wallet))){notice('미상환 신용대출 또는 보유머니를 초과했습니다.',true);return;}
 if(!borrow&&all&&BigInt(state.wallet)<BigInt(c.outstanding)){notice('전액 완납에 필요한 게임머니가 부족해요.',true);return;}
 if(!confirm(borrow?'총자산 평가액의 50% 한도 내에서 '+fmt(raw)+' G 신용대출을 신청할까요?\n일 0.2% 단리, 7일 이내 상환. 연체 시 자산이 순차적으로 강제매각됩니다.':'신용대출을 '+(all?'전액':fmt(raw)+' G')+' 상환할까요?'))return;
 busy=true;document.querySelectorAll('#jbankModal [data-jbank-action]').forEach(b=>b.disabled=true);
 try{
  const d=await request('/api/jcredit/'+(borrow?'borrow':'repay'),{method:'POST',body:JSON.stringify({amount:raw,requestId:crypto.randomUUID()})});
  render(d.status);document.dispatchEvent(new CustomEvent('jbank:wallet-change',{detail:{balance:d.status.wallet,user:d.user}}));
  notice(borrow?'신용대출 입금 완료 · 7일 내 상환해 주세요.':'신용대출 상환 완료.'+(BigInt(d.status.credit.outstanding)===0n?' 신용대출 제한이 해제됐어요.':''));
 }catch(e){try{render(await request('/api/jbank'))}catch{}notice(e.message,true)}
 finally{busy=false;}
}
async function submit(action){if(action==='creditBorrow'||action==='creditRepay'||action==='creditRepayAll')return creditSubmit(action);if(action==='rehabilitation')return rehabilitation();if(action.startsWith('installment'))return installmentSubmit(action);if(['deposit','withdraw','withdrawAll'].includes(action))return savingsSubmit(action);if(action==='sellRank')return sellRank();
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