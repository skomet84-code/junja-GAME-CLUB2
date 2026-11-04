# JUNJA LAND Premium Commerce — Pre-Launch Integration Contract
Status: prototype / NOT APPROVED FOR REAL PAYMENTS
Updated: 2026-11-04

## What is delivered
- `premium-purchase-core.js`: isolated direct-purchase bookkeeping for six non-transferable cosmetics/decor items.
- `tests/premium-purchase-core.cjs`: runnable local SQLite regression tests.
- `public/premium-preview.html`: mobile-ready, six-card premium showroom concept, all purchasing disabled.
- `.github/workflows/premium-readiness.yml`: checks the new code and preview on eligible PR changes.
- This prototype is NOT imported by `server.js`; no routes, payment gateway, external transfers or new cash balance exist.

## Security invariants
1. All paid products are outside legacy `users.balance`, `ledger`, `user_inventory`, `royal-market.js`, auctions, bank loan collateral, games and player transfers.
2. `enabled=false` by default. Order creation, fulfillment and refund operations refuse calls unless explicitly enabled by a future approved integration.
3. Prices are server-defined and cannot be selected by a browser.
4. `user_id + request_id` protects order creation from double-clicks. `provider_payment_key` must be unique across all orders.
5. Fulfillment only occurs after an external `verifyPayment` callback has checked provider-confirmed status, order ID, payment key, KRW currency and exact price. Browser redirect success is never sufficient.
6. PG-authorized payment and entitlement writes are one local SQLite transaction. Repeated callbacks cannot grant duplicates.
7. Refund revocation requires a separately verified provider refund callback. Old refund events cannot revoke newer repurchases.
8. Historical transactions are kept; refund does not simply delete an order.
9. No personal payment card, bank account or PCI cardholder details are stored by this module.

## Testing
```sh
node --check premium-purchase-core.js
node tests/premium-purchase-core.cjs
node tests/premium-preview-safe.cjs
```
The unit test asserts disabled defaults, six-item catalog, request idempotency, PG approval mismatches, exact amount check, replay/duplicate payment key handling, refunds, repurchase, disabled users, SQLite close/reopen persistence, and no modifications to existing game balances/ledger.

## Blockers before first KRW charge
**LEGAL/PG:** explicit written review of the game’s total experience (casino-style games and player-to-player transfers included), business and online-sales requirements, game classification, consumer terms, refunds, age gates and payment provider approval. A separate checkout screen must not be used to hide the actual product from review.

**DATA DURABILITY:** Current `persistent-db.js` uses local SQLite with remote PostgreSQL snapshot replication and a fixed list of snapshot tables. The two new `premium_*` tables are not in that snapshot list. Their local persistence test does NOT establish durability across Railway redeployment, instance replacement, multi-replica or disaster recovery. Until a production Postgres transaction-based store is implemented and tested, the module MUST NOT be wired to payment systems.

**PROVIDER INTEGRATION:** implement official server-to-server PG API verification (credentials in protected environment variables), authentication and owner checks, webhook signature/replay validation, reconciliation for payment-approved-but-not-granted orders, recovery on payment/refund timeouts, duplicate charges/chargebacks, idempotent refunds, audit trails, alerts and customer support. Do not use simulated `verifyPayment` callbacks in production.

**GAME SAFETY:** resolve and regression-test roulette black settlement, bigwheel payouts, hold'em all-in settlement, bank refunds, and balance serialization; ensure paid cosmetics cannot be sold/converted or gifted in any legacy subsystem.

**RELEASE GATE:** only then wire authenticated routes and show payment buttons. Explicit admin switch must remain OFF by default. Never auto-activate live payment processing after merging this branch.

## Prototype calling contract (test-only; not HTTP API)
```js
const {createPremiumPurchaseCore}=require('./premium-purchase-core');
const premium=createPremiumPurchaseCore({
  db,
  enabled: false, // keep false until every approval and durability gate passes
  verifyPayment: async ({orderId,paymentKey,expectedAmountKrw}) => { throw Error('PG integration not installed'); },
  verifyRefund: async ({orderId,paymentKey,expectedAmountKrw}) => { throw Error('PG integration not installed'); }
});
```
