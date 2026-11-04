'use strict';
const assert=require('node:assert/strict');
const {createTossReadOnlyVerifier}=require('../premium-toss-readonly');
const code=value=>e=>e?.code===value;
(async()=>{
 const secret='test_sk_fake_only_123456';
 assert.throws(()=>createTossReadOnlyVerifier({secretKey:secret}),code('LOOKUP_DISABLED'));
 assert.throws(()=>createTossReadOnlyVerifier({enabled:true,secretKey:'live_sk_DO_NOT_USE'}),code('UNSUPPORTED_CREDENTIAL'));
 let status='DONE',amount=9900,balance=9900,currency='KRW',overrideOrderId='',overridePaymentKey='';
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url,init});
  return {ok:true,json:async()=>({
    orderId:overrideOrderId||'JP-123456789',paymentKey:overridePaymentKey||'fake-payment-key-123',
    status,totalAmount:amount,balanceAmount:balance,currency,
    card:{number:'DO_NOT_COPY_CARD_DATA'},customerEmail:'DO_NOT_SAVE'
  })};
 };
 const v=createTossReadOnlyVerifier({enabled:true,secretKey:secret,fetchImpl});
 const input={orderId:'JP-123456789',paymentKey:'fake-payment-key-123',expectedAmountKrw:9900};
 const done=await v.verifyPayment(input);
 assert.deepEqual(done,{status:'APPROVED',...input,amountKrw:9900,currency:'KRW',expectedAmountKrw:undefined} && {status:'APPROVED',orderId:input.orderId,paymentKey:input.paymentKey,amountKrw:9900,currency:'KRW'});
 assert.equal(calls[0].init.method,'GET');assert(calls[0].url.startsWith('https://api.tosspayments.com/v1/payments/'));
 assert.equal(calls[0].init.headers.Authorization,'Basic '+Buffer.from(secret+':').toString('base64'));
 assert(calls.every(x=>x.init.method==='GET'));
 assert(!JSON.stringify(done).includes('DO_NOT_'));
 amount=9901;
 await assert.rejects(v.verifyPayment(input),code('TOSS_MISMATCH'));
 amount=9900;currency='USD';
 await assert.rejects(v.verifyPayment(input),code('TOSS_MISMATCH'));
 currency='KRW';overrideOrderId='other-order-id';
 await assert.rejects(v.verifyPayment(input),code('TOSS_MISMATCH'));
 overrideOrderId='';overridePaymentKey='other-payment-key';
 await assert.rejects(v.verifyPayment(input),code('TOSS_MISMATCH'));
 overridePaymentKey='';status='READY';
 await assert.rejects(v.verifyPayment(input),code('PAYMENT_NOT_SETTLED'));
 status='PARTIAL_CANCELED';balance=5000;
 await assert.rejects(v.verifyRefund(input),code('REFUND_NOT_FINAL'));
 status='CANCELED';balance=0;
 const cancelled=await v.verifyRefund(input);
 assert.equal(cancelled.status,'REFUNDED');
 assert.equal(cancelled.amountKrw,9900);
 balance=100;
 await assert.rejects(v.verifyRefund(input),code('REFUND_NOT_FINAL'));
 await assert.rejects(v.verifyPayment({...input,paymentKey:'bad key'}),code('INVALID_PAYMENT_KEY'));
 const unavailable=createTossReadOnlyVerifier({enabled:true,secretKey:secret,fetchImpl:async()=>{throw Error('network offline');}});
 await assert.rejects(unavailable.verifyPayment(input),code('TOSS_UNREACHABLE'));
 const failed=createTossReadOnlyVerifier({enabled:true,secretKey:secret,fetchImpl:async()=>({ok:false,json:async()=>({message:'denied'})})});
 await assert.rejects(failed.verifyPayment(input),code('TOSS_LOOKUP_FAILED'));
 console.log('TOSS_READ_ONLY_OK: provider GET only, no charges, test-key gate, amount/order/currency/refund validation');
})().catch(e=>{console.error(e);process.exitCode=1;});
