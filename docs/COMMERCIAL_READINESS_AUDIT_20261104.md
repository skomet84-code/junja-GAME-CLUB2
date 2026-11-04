# JUNJA LAND — Commercial Readiness Technical Audit
As of 2026-11-04 KST. Based on connected Railway production read-only status/logs and GitHub current source. Audit only; no live deployment changes.

## Current Railway condition
- Railway project: `junja-land-migration`; Node service `junja-land-online` currently **online**, latest production deployment **SUCCESS**, one running replica, zero crashed replicas.
- Postgres service **online** with its own mounted volume. The Node app has no mounted volume; its local SQLite file is ephemeral across container replacement and is restored from the game's remote snapshot mechanism.
- Last 24h Railway counted **11 FAILED deployments**, but the active app is healthy. Observed historical build failures:
  - outdated static asset-version assertion: `tests/royal-motors-v6.cjs`;
  - `FORFEITED` vs `FORFEIT` in a bank/football reset test;
  - missing VM `CustomEvent` stub in a j-coin UI test.
  They are **not evidence that the current active deployment failed**, and the current main repo already includes a corrected `FORFEITED` assertion.
- Recent restore audits reported 59 users and 2273 restored rows. At least one wallet may be above JavaScript's safe integer range: strong reason to preserve exact integer handling in game money, especially in casino features.
- Review source of truth: production metrics/deploy status and logs. No live data writes were made during audit.

## High-priority launch risks
1. Local SQLite snapshot model is not an acceptable durable source of truth for real-money purchases. Production `premium_pg_*` tables must live directly in PostgreSQL and be replicated, backed up and independently recoverable.
2. The game currently uses mixed number handling. Exact settlement and ledger verification across all high-value games is a required P0 release gate.
3. `rouletteSpin` settles bets and payouts within one SQLite transaction and has black-payout smoke coverage, but a past individual screenshot is not by itself a verifiable transaction record. Check order/ledger history for an actual reported loss.
4. `bigWheelSpin` in the current main source calls `walletChange` separately for debit/payout and then updates stats; it is not a single atomic transaction. That creates a known partial-failure risk. Address in a separate isolated game-logic PR with exact BigInt wallet and failure-injection tests before any monetization.
5. `bigWheel` currently uses 77 segments in source/tests even though the original product request was 99; scope this visual/rules change separately and do not claim 99 is implemented.
6. Failed deployments from brittle test expectations can block rollout. Track checks to green before promotion, and add release smoke/rollback checklist.
7. This feature branch's PostgreSQL purchase engine is NOT mounted in the live game. Its Toss adapter performs test-key-gated GET verification only. No cash can flow.

## Immediate corrective path
- Green isolated real-PG test suite for orders, refund, replay, ownership and integration with read-only provider lookup.
- Build casino-transaction regressions in a separate branch, especially bigwheel payout/debit rollback, black-roulette ledger and all-in poker exit.
- Back up and recover full customer purchase records from PG independently of game snapshot.
- Introduce merchant, customer support, refund, legal review and PG underwriting before any live checkout.
