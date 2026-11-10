'use strict';
// READ-ONLY Toss Payments LOOKUP adapter. Does NOT approve, charge, cancel or refund anything.
// Never expose keys to the frontend; never enable against live credentials before PG/legal approval.
// Official reference: https://docs.tosspayments.com/reference#paymentkey%EB%A1%9C-%EA%B2%B0%EC%A0%9C-%EC%A1%B0%ED%9A%8C
const error=(code,message)=>Object.assign(new Error(message),{code});
function createTossReadOnlyVerifier({
 secretKey,fetchImpl=globalThis.fetch,enabled=false,allowLiveKeys=false
}={}){
 if(enabled!==true)throw error('LOOKUP_DISABLED','PG verification is disabled.');
 if(typeof secretKey!=='string'||!/^test_(?:gsk|sk)_[A-Za-z0-9_-]{6,}$/.test(secretKey)&&
  !(allowLiveKeys===true&&/^live_(?:gsk|sk)_[A-Za-z0-9_-]{6,}$/.test(secretKey)))
  throw error('UNSUPPORTED_CREDENTIAL','Valid TEST secret required by default; live credentials are forbidden.');
 if(typeof fetchImpl!=='function')throw error('MISSING_FETCH','Server HTTP fetch required.');
 const authorization='Basic '+Buffer.from(secretKey+':').toString('base64');
 async function lookup(paymentKey){
  if(typeof paymentKey!=='string'||!/^[A-Za-z0-9_-]{6,200}$/.test(paymentKey))
   throw error('INVALID_PAYMENT_KEY','Invalid payment key.');
  let response;
  try{
   response=await fetchImpl('https://api.tosspayments.com/v1/payments/'+encodeURIComponent(paymentKey),{
    method:'GET',headers:{Authorization:authorization,Accept:'application/json'},
    signal:AbortSignal.timeout(8000)
   });
  }catch{throw error('TOSS_UNREACHABLE','Unable to verify payment with provider.');}
  if(!response||response.ok!==true)throw error('TOSS_LOOKUP_FAILED','Provider did not confirm this payment.');
  let body;try{body=await response.json();}catch{throw error('TOSS_RESPONSE_INVALID','Malformed provider response.');}
  // No cardholder, payment method, receipt, or key material is retained or returned.
  if(!body||typeof body!=='object')throw error('TOSS_RESPONSE_INVALID','Missing Payment object.');
  return body;
 }
 function exact(body,{orderId,paymentKey,expectedAmountKrw}){
  if(!Number.isSafeInteger(expectedAmountKrw)||expectedAmountKrw<=0||
    typeof orderId!=='string'||orderId.length<6||orderId.length>64||
    body.orderId!==orderId||body.paymentKey!==paymentKey||
    body.currency!=='KRW'||body.totalAmount!==expectedAmountKrw)
   throw error('TOSS_MISMATCH','Payment record does not match the expected transaction.');
 }
 async function verifyPayment(input){
  const body=await lookup(input.paymentKey);
  exact(body,input);
  if(body.status!=='DONE'||body.balanceAmount!==body.totalAmount)
   throw error('PAYMENT_NOT_SETTLED','Payment is not a fully settled, uncancelled charge.');
  return {status:'APPROVED',orderId:input.orderId,paymentKey:input.paymentKey,
   amountKrw:input.expectedAmountKrw,currency:'KRW'};
 }
 async function verifyRefund(input){
  const body=await lookup(input.paymentKey);
  exact(body,input);
  if(body.status!=='CANCELED'||body.balanceAmount!==0)
   throw error('REFUND_NOT_FINAL','Full payment cancellation is not confirmed.');
  return {status:'REFUNDED',orderId:input.orderId,paymentKey:input.paymentKey,
   amountKrw:input.expectedAmountKrw,currency:'KRW'};
 }
 return Object.freeze({verifyPayment,verifyRefund});
}
module.exports={createTossReadOnlyVerifier};
