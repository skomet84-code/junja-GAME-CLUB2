'use strict';
// Requires a dedicated ephemeral PostgreSQL CI database; never run against production.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Pool}=require('pg');
const {createPremiumPgStore}=require('../premium-pg-core');
const url=process.env.TEST_DATABASE_URL;
if(!url||!(/(?:localhost|127\.0\.0\.1)/.test(url)))throw Error('TEST_DATABASE_URL must point to an ephemeral local Postgres test instance.');
const expectCode=code=>e=>e&&e.code===code;
(async()=>{
 const pool=new Pool({connectionString:url,max:8});
 const secondPool=new Pool({connectionString:url,max:2});
 try{
  await pool.query(fs.readFileSync(path.join(__dirname,'../premium-pg-schema.sql'),'utf8'));
  await pool.query('TRUNCATE premium_store_events,premium_store_entitlements,premium_store_orders RESTART IDENTITY CASCADE');
  let paymentStatus='APPROVED',refundStatus='REFUNDED',amountDelta=0,currency='KRW',adminAllowed=false,orderOverride=null;
  const mockPayment=async p=>({status:paymentStatus,orderId:orderOverride||p.orderId,paymentKey:p.paymentKey,amountKrw:p.expectedAmountKrw+amountDelta,currency});
  const mockRefund=async p=>({status:refundStatus,orderId:p.orderId,paymentKey:p.paymentKey,amountKrw:p.expectedAmountKrw,currency:'KRW'});
  const config={pool,verifyUser:async id=>id===1||id===2,verifyAdmin:async proof=>adminAllowed&&proof==='verified-admin',verifyPayment:mockPayment,verifyRefund:mockRefund,now:()=>1770010000000};
  const off=createPremiumPgStore(config);
  await assert.rejects(off.createOrder({userId:1,productId:'signature_identity',requestId:'request-11111111'}),expectCode('PAYMENTS_DISABLED'));
  const p=createPremiumPgStore({...config,enabled:true});
  assert.equal(p.getCatalog().length,6);
  assert(p.getCatalog().every(x=>x.transferable===false&&x.gameplayBenefit===false));
  await assert.rejects(p.createOrder({userId:999,productId:'signature_identity',requestId:'request-11111111'}),expectCode('USER_UNAVAILABLE'));
  await assert.rejects(p.getOwned(999),expectCode('USER_UNAVAILABLE'));
  const x=await p.createOrder({userId:1,productId:'imperial_watch_room',requestId:'request-11111111'});
  assert.equal(x.status,'PENDING');assert.equal(x.amountKrw,9900);
  assert.deepEqual(x,await p.createOrder({userId:1,productId:'imperial_watch_room',requestId:'request-11111111'}));
  assert.deepEqual(x,await p.createOrder({userId:1,productId:'imperial_watch_room',requestId:'request-22222222'}));
  await assert.rejects(p.createOrder({userId:1,productId:'royal_motor_lounge',requestId:'request-11111111'}),expectCode('REQUEST_CONFLICT'));
  amountDelta=1;
  await assert.rejects(p.fulfillApprovedOrder({orderId:x.orderId,paymentKey:'provider-123456'}),expectCode('PROVIDER_MISMATCH'));
  amountDelta=0;currency='USD';
  await assert.rejects(p.fulfillApprovedOrder({orderId:x.orderId,paymentKey:'provider-123456'}),expectCode('PROVIDER_MISMATCH'));
  currency='KRW';orderOverride='other-order';
  await assert.rejects(p.fulfillApprovedOrder({orderId:x.orderId,paymentKey:'provider-123456'}),expectCode('PROVIDER_MISMATCH'));
  orderOverride=null;paymentStatus='FAILED';
  await assert.rejects(p.fulfillApprovedOrder({orderId:x.orderId,paymentKey:'provider-123456'}),expectCode('PROVIDER_MISMATCH'));
  paymentStatus='APPROVED';
  const paid=await p.fulfillApprovedOrder({orderId:x.orderId,paymentKey:'provider-123456'});
  assert.equal(paid.alreadyApplied,false);assert.equal(paid.order.status,'PAID');
  const replay=await p.fulfillApprovedOrder({orderId:x.orderId,paymentKey:'provider-123456'});
  assert.equal(replay.alreadyApplied,true);
  await assert.rejects(p.fulfillApprovedOrder({orderId:x.orderId,paymentKey:'provider-999999'}),expectCode('PAYMENT_CONFLICT'));
  assert.equal((await p.getOwned(1)).length,1);
  await assert.rejects(p.createOrder({userId:1,productId:'imperial_watch_room',requestId:'request-33333333'}),expectCode('ALREADY_OWNED'));
  // A payment reference cannot be reassigned to another user or order.
  const y=await p.createOrder({userId:2,productId:'imperial_watch_room',requestId:'request-44444444'});
  await assert.rejects(p.fulfillApprovedOrder({orderId:y.orderId,paymentKey:'provider-123456'}),e=>e&&e.code==='23505');
  assert.equal((await p.getOwned(2)).length,0,'Atomic rollback after duplicate payment key');
  await p.fulfillApprovedOrder({orderId:y.orderId,paymentKey:'provider-222222'});
  // No cancellation can be assumed from a browser callback.
  refundStatus='FAILED';
  await assert.rejects(p.applyVerifiedRefund({orderId:x.orderId}),expectCode('PROVIDER_MISMATCH'));
  assert.equal((await p.getOwned(1)).length,1);
  refundStatus='REFUNDED';
  const refunded=await p.applyVerifiedRefund({orderId:x.orderId});
  assert.equal(refunded.order.status,'REFUNDED');
  assert.equal((await p.getOwned(1)).length,0);
  assert.equal((await p.applyVerifiedRefund({orderId:x.orderId})).alreadyApplied,true);
  await assert.rejects(p.fulfillApprovedOrder({orderId:x.orderId,paymentKey:'provider-123456'}),expectCode('ORDER_REFUNDED'));
  const repurchase=await p.createOrder({userId:1,productId:'imperial_watch_room',requestId:'request-55555555'});
  await p.fulfillApprovedOrder({orderId:repurchase.orderId,paymentKey:'provider-333333'});
  await p.applyVerifiedRefund({orderId:x.orderId});
  assert.equal((await p.getOwned(1)).length,1,'Old refund must not revoke current entitlement');
  // Concurrent orders for one item must reuse one pending order.
  const [a,b]=await Promise.all([
    p.createOrder({userId:1,productId:'royal_motor_lounge',requestId:'parallel-request-a'}),
    p.createOrder({userId:1,productId:'royal_motor_lounge',requestId:'parallel-request-b'})
  ]);
  assert.equal(a.orderId,b.orderId,'No duplicate pending orders under concurrency');
  const ct=await pool.query("SELECT COUNT(*)::int AS n FROM premium_store_orders WHERE user_id=1 AND product_id='royal_motor_lounge'");
  assert.equal(ct.rows[0].n,1);
  await assert.rejects(p.getAdminAudit('wrong-admin'),expectCode('ADMIN_FORBIDDEN'));
  adminAllowed=true;
  const audit=await p.getAdminAudit('verified-admin');
  assert.equal(audit.paidCount,2);
  assert.equal(audit.refundCount,1);
  assert(audit.pendingCount>=1);
  assert.match(audit.netCollectedKrw,/^\d+$/);
  await pool.query('UPDATE premium_store_orders SET created_ms=$1 WHERE order_id=$2',[1770010000000-2*86400000,a.orderId]);
  const aged=await p.getAdminAudit('verified-admin');
  assert(aged.alerts.some(z=>z.orderId===a.orderId&&z.issue==='PENDING_RECONCILE'));
  const counts=await pool.query('SELECT event_type,COUNT(*)::int AS n FROM premium_store_events GROUP BY event_type');
  const events=Object.fromEntries(counts.rows.map(x=>[x.event_type,x.n]));
  assert.equal(events.ORDER_CREATED,4);
  assert.equal(events.PAYMENT_APPROVED,3);
  assert.equal(events.REFUND_CONFIRMED,1);
  const again=createPremiumPgStore({...config,pool:secondPool});
  assert.equal((await again.getOwned(1)).length,1,'Permanent PG storage survives new pool / process boundary');
  const names=await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  assert(names.rows.every(x=>!['users','ledger','user_inventory','room_escrow'].includes(x.table_name)),'Test PG schema must not contain casino tables');
  console.log('PREMIUM_PG_OK: concurrent orders, unique payments, verified approvals, atomic grants, refunds, durable Postgres, audit and isolation');
 }finally{await secondPool.end();await pool.end();}
})().catch(e=>{console.error(e);process.exitCode=1});
