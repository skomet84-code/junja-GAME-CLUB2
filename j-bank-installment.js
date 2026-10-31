'use strict';
const DAY=86400000,DENOM=10000n*BigInt(DAY);
const PRODUCTS=Object.freeze([{days:7,rateBP:8},{days:14,rateBP:10},{days:30,rateBP:15}].map(p=>Object.freeze({...p,dailyInterestPct:(p.rateBP/100).toFixed(2)})));
function interest(a,end,rate){return String(a.payments.reduce((sum,p)=>sum+BigInt(a.amount)*BigInt(Math.max(0,Math.min(end,a.maturesAt)-p.at))*BigInt(rate),0n)/DENOM);}
function view(a,at){
 if(!a)return null;
 const slot=Math.floor((at-a.openedAt)/DAY),matured=at>=a.maturesAt,complete=a.payments.length===a.days;
 const missed=Math.max(0,Math.min(a.days,slot)-a.payments.filter(p=>p.slot<slot).length);
 const rateBP=missed?5:a.rateBP;
 return {id:a.id,days:a.days,amount:a.amount,openedAt:a.openedAt,maturesAt:a.maturesAt,paidCount:a.payments.length,principal:String(BigInt(a.amount)*BigInt(a.payments.length)),dailyInterestPct:(a.rateBP/100).toFixed(2),effectiveDailyInterestPct:(rateBP/100).toFixed(2),missedCount:missed,matured,complete,
  canPay:!matured&&slot>=0&&!a.payments.some(p=>p.slot===slot),nextPaymentAt:a.openedAt+(slot+1)*DAY,
  accruedInterest:interest(a,Math.min(at,a.maturesAt),rateBP),maturityInterestOnPaid:interest(a,a.maturesAt,rateBP)};
}
function requestText(kind,raw){
 if(kind==='installmentOpen'){
  if(!raw||!PRODUCTS.some(p=>p.days===raw.days)||typeof raw.amount!=='string'||!/^[1-9][0-9]{0,79}$/.test(raw.amount))throw Error('적금 기간과 납입금액을 확인하세요.');
  if(BigInt(raw.amount)<1000n)throw Error('적금 최소 회차 납입액은 1,000G입니다.');
  return JSON.stringify({days:raw.days,amount:raw.amount});
 }
 if(typeof raw!=='string'||!/^[a-zA-Z0-9_-]{12,80}$/.test(raw))throw Error('적금 계좌 정보가 올바르지 않습니다.');
 return raw;
}
function transact(record,kind,text,requestId,at,debt,balance){
 let a=record.installment;
 if(kind==='installmentOpen'){
  if(a)throw Error('진행 중인 적금이 있습니다. 만기 수령 또는 해지 후 가입하세요.');
  if(debt>0n)throw Error('대출을 완납해야 적금에 가입할 수 있습니다.');
  const input=JSON.parse(text),product=PRODUCTS.find(p=>p.days===input.days),amount=BigInt(input.amount);
  if(amount>balance)throw Error('게임머니 잔액이 부족합니다.');
  record.installment={id:requestId,days:product.days,rateBP:product.rateBP,amount:input.amount,openedAt:at,maturesAt:at+product.days*DAY,payments:[{slot:0,at}]};
  return {delta:-amount,type:'jbank_installment_open',memo:'J-BANK '+product.days+'일 적금 가입 · 1회차 납입'};
 }
 if(!a||a.id!==text)throw Error('진행 중인 적금 계좌가 변경됐습니다. 은행을 다시 열어 주세요.');
 const v=view(a,at);
 if(kind==='installmentPay'){
  if(debt>0n)throw Error('대출을 완납해야 적금을 납입할 수 있습니다.');
  if(!v.canPay)throw Error(v.matured?'만기일이 지났습니다. 만기 수령해 주세요.':'이번 회차는 이미 납입했습니다.');
  const amount=BigInt(a.amount);if(amount>balance)throw Error('게임머니 잔액이 부족합니다.');
  a.payments.push({slot:Math.floor((at-a.openedAt)/DAY),at});
  return {delta:-amount,type:'jbank_installment_pay',memo:'J-BANK 적금 '+a.payments.length+'회차 납입'};
 }
 if(kind!=='installmentClaim'&&kind!=='installmentCancel')throw Error('알 수 없는 적금 거래입니다.');
 if(kind==='installmentClaim'&&!v.matured)throw Error('아직 적금 만기일이 아닙니다.');
 if(kind==='installmentCancel'&&v.matured)throw Error('만기된 적금입니다. 만기 수령 버튼을 이용하세요.');
 const earned=kind==='installmentClaim'?BigInt(v.maturityInterestOnPaid):0n;
 record.lastInstallment={...v,closedAt:at,paidInterest:String(earned),cancelled:kind==='installmentCancel'};
 record.installment=null;
 return {delta:BigInt(v.principal)+earned,type:kind==='installmentClaim'?'jbank_installment_maturity':'jbank_installment_cancel',memo:'J-BANK 적금 '+(kind==='installmentClaim'?'만기 수령':'중도해지')+' · 이자 '+earned+' G'};
}
module.exports={PRODUCTS,view,requestText,transact};
