'use strict';
// E2E test of PG bookkeeping + read-only Toss stub. No real money, no outbound HTTP.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Pool}=require('pg');
const {createPremiumPgStore}=require('../premium-pg-core');
const {createTossReadOnlyVerifier}=require('../premium-toss-readonly');
const url=process.env.TEST_DATABASE_URL;
if(!url||!/localhost|127\.0\.0\.1/.test(url))throw Error('Use only ephemeral localhost PostgreSQL for this test.');
const code=c=>e=>e?.code===c;
(async()=>{
 const pool=new Pool({connectionString:url});
 try{
  await pool.query(fs.readFileSync(path.join(__dirname,'../premium-pg-schema.sql'),'utf8'));
  await pool.query('TRUNCATE premium_store_appearance,premium_store_events,premium_store_entitlements,premium_store_orders RESTART IDENTITY CASCADE');
  let status='DONE',balance=14900,total=14900,providerOrderId=null,providerKey='fake-payment-key-xyz-123';
  const calls=[];
  const adapter=createTossReadOnlyVerifier({
   enabled:true,secretKey:'test_sk_notreal_sandbox_123456',
   fetchImpl:async(url,options)=>{
    calls.push({url,method:options.method});
    return {ok:true,json:async()=>({
     status,totalAmount:total,balanceAmount:balance,
     currency:'KRW',orderId:providerOrderId,paymentKey:providerKey,
     customerName:'SENSITIVE_DO_NOT_STORE',card:{number:'NEVER_STORE_CARD'}
    })};
   }
  });
  const service=createPremiumPgStore({
   pool,enabled:true,verifyUser:async id=>id===1,
   verifyPayment:adapter.verifyPayment,verifyRefund:adapter.verifyRefund
  });
  const order=await service.createOrder({userId:1,productId:'marina_suite',requestId:'checkout-intg-000001'});
  providerOrderId=order.orderId;
  total=14901;
  await assert.rejects(service.fulfillApprovedOrder({orderId:order.orderId,paymentKey:providerKey}),code('TOSS_MISMATCH'));
  assert.equal((await service.getOwned(1)).length,0);
  total=14900;
  await service.fulfillApprovedOrder({orderId:order.orderId,paymentKey:providerKey});
  assert.equal((await service.getOwned(1))[0].id,'marina_suite');
  assert.equal((await service.fulfillApprovedOrder({orderId:order.orderId,paymentKey:providerKey})).alreadyApplied,true);
  status='PARTIAL_CANCELED';balance=1000;
  await assert.rejects(service.applyVerifiedRefund({orderId:order.orderId}),code('REFUND_NOT_FINAL'));
  assert.equal((await service.getOwned(1)).length,1);
  status='CANCELED';balance=0;
  await service.applyVerifiedRefund({orderId:order.orderId});
  assert.equal((await service.getOwned(1)).length,0);
  const audit=await pool.query('SELECT COUNT(*)::int n FROM premium_store_events');
  assert.equal(audit.rows[0].n,3);
  assert(calls.every(x=>x.method==='GET'&&x.url.startsWith('https://api.tosspayments.com/v1/payments/')));
  assert(!JSON.stringify(await service.getOrders(1)).includes('SENSITIVE_DO_NOT_STORE'));
  console.log('PREMIUM_TOSS_PG_E2E_OK: verified lookups -> PG grant -> full refund; no POST/money movement, no sensitive details stored');
 }finally{await pool.end();}
})().catch(e=>{console.error(e);process.exitCode=1});
