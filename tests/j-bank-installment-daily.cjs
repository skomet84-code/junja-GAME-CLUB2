'use strict';
const assert=require('node:assert/strict');
const {view,transact}=require('../j-bank-installment');
const ts=s=>Date.parse(s);
const openedAt=ts('2026-10-31T03:59:44Z'); // 12:59:44 KST
const id='installment_daily_guard_test_01',amount='1000000000000';
const a={installment:null},wallet=100000000000000n;
const pay=(when,key)=>transact(a,'installmentPay',id,key,when,0n,wallet);
transact(a,'installmentOpen',JSON.stringify({days:7,amount}),id,openedAt,0n,wallet);
assert.equal(view(a.installment,openedAt).paidCount,1);
assert.equal(view(a.installment,openedAt).canPay,false);
assert.throws(()=>pay(openedAt+3600000,'duplicate_open_day_01'),/이미 납입/);
const second=ts('2026-11-01T04:00:00Z');
assert.equal(view(a.installment,second).canPay,true);
pay(second,'second_kst_date_001');
assert.equal(view(a.installment,second+60000).paidToday,true);
assert.equal(view(a.installment,second+60000).canPay,false);
assert.throws(()=>pay(second+60000,'duplicate_second_001'),/하루 1회/);
const third=ts('2026-11-02T00:00:00Z'); // 09:00 KST, before previous signup time of day
assert.equal(view(a.installment,third).canPay,true);
pay(third,'third_kst_date_001');
assert.equal(view(a.installment,third).paidCount,3);
const crossedAnchor=ts('2026-11-02T04:00:00Z'); // 13:00 same KST day
assert.equal(view(a.installment,crossedAnchor).canPay,false);
assert.throws(()=>pay(crossedAnchor,'duplicate_anchor_001'),/하루 1회/);
assert.equal(view(a.installment,crossedAnchor).principal,'3000000000000');
assert.equal(view(a.installment,crossedAnchor).missedCount,0);
assert(BigInt(view(a.installment,crossedAnchor).accruedInterest)>BigInt(view(a.installment,third).accruedInterest),'interest rises only with elapsed time here');
const fourth=ts('2026-11-03T00:00:00Z');
pay(fourth,'fourth_kst_date_001');
assert.equal(view(a.installment,fourth).missedCount,0);
const sixth=ts('2026-11-05T00:00:00Z');
pay(sixth,'sixth_kst_date_001');
assert.equal(view(a.installment,sixth).missedCount,1);
assert.equal(view(a.installment,sixth).effectiveDailyInterestPct,'0.05');
const mature=openedAt+7*86400000;
assert.equal(view(a.installment,mature).matured,true);
assert.equal(view(a.installment,mature).canPay,false);
console.log('JBANK_INSTALLMENT_KST_DAILY_OK: one payment per KST date, no extra principal, correct missed days and maturity');
