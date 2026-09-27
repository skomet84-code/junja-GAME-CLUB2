# Royal Sichuan — 2026-09-27 update

## Multiplayer ranked battles

- Public room list and one-tap joining; no room password or code entry. Existing account login is still required.
- 2–8 individual competitors; no teams. Everyone receives the host theme and identical seeded board.
- The selected capacity must be filled and every player must consent via Ready. Stakes are debited atomically once, at start.
- Stake: 1,000–100,000,000,000,000 G, in 1,000 G increments.
- Ranking: non-forfeited players first, then clear order, pairs connected, and server-computed score. Unfinished players continue after the first clear. The round settles when everyone finishes, one competitor remains, or the deadline passes.
- Prizes by non-forfeited count: 1–2 players 100% to first; 3 players 70/30; 4–8 players 60/30/10. Ties share the prizes for occupied positions. All payouts together equal all stakes. No house fee.
- Result displays every player's rank, verified score, own payout and individual net profit/loss. Host can advance to the next round, switch theme, or leave; other players follow host choices automatically.
- Each subsequent round cuts 12 seconds from that theme's base timer, down to 60 seconds. A theme change resets to round 1. Every new round requires consent again.
- Mid-round forfeits retain their stake in the prize pool. Leaving after a verified finish preserves the result. Restarted servers refund interrupted stakes once through atomic SQLite transactions using the existing persisted room_escrow table.
- Server replays legal moves/hints/shuffles; client score, pair count and clear claims are not trusted. Round IDs reject stale requests, and settlement is idempotent. Full bot detection is not claimed.
- Wallet arithmetic for this mode and rank promotion is exact BigInt-backed SQLite INTEGER arithmetic, including existing balances above JavaScript's safe integer range.

## Single player

Four chapters / 24 stages, daily KST puzzle, and relaxation mode retain device-local progress. Clearing the campaign unlocks the infinite tower from floor 25. High floors now shorten down to 60 seconds, with gravity and crown trials preserved.

## Traffic and persistence

No new remote service, streaming music, or database polling was added. Room list refresh is user-driven. Active room updates use non-overlapping 3-second polling; move batches are sent at most once per 2 seconds plus finish. Board state stays in memory; stakes/payouts use the existing persistence infrastructure. Timers stop on leaving the room.

## Revised promotion prices

| Rank | Cost G |
|---|---:|
| 평민 | 0 |
| 상인 | 10억 |
| 부호 | 100억 |
| 귀족 | 1,000억 |
| 남작 | 5,000억 |
| 자작 | 1조 |
| 백작 | 3조 |
| 후작 | 5조 |
| 공작 | 10조 |
| 왕 | 30조 |
| 황제 | 100조 |
| JUNJA ROYAL | 300조 |
| GOD JUNJA | 1,000조 |

These are per-step promotion prices. Existing ranks and perks remain intact; no retroactive charges.

## Verification

`npm run check`, `npm run test:treasure`, and optional Playwright gates `tests/sichuan-browser.cjs` and `tests/sichuan-multiplayer-browser.cjs`. The deployed Docker command is `node admin-unlimited-start.js`; local integration tests use that exact entry point.
