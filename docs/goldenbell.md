# 준자 골든벨

- 15 categories, 470 original Korean questions; four choices and O/X. The expansion adds 60 level-4 questions across history, people, science, sports, film, music, food, geography, games, language, entertainment, animals and math.
- Mixed mode: 30 questions balanced across categories; category mode: up to 30 available questions. One question cannot repeat in the same round. Every round now follows a difficulty curve of 4 easy, 8 normal, 12 hard and 6 extreme questions whenever that category has enough questions.
- Solo: 3 lives, 20-second questions. First 3 starts per KST day are rewarded, subsequent plays are practice. Each correct answer pays 10,000 G, 10/20 correct adds 50,000/100,000 G, a perfect run adds 500,000 G. Paid once on finish/quit; beginning a run consumes the daily allowance.
- Multiplayer: 2–12 players, host starts once everyone is ready. Score mode or survival; questions 10 and 20 revive eliminated players who answer correctly. If all living players are wrong, elimination is waived for that question.
- Entry: free or 1,000 G increments up to 1 billion G. Deducted atomically when starting; no charge for a waiting room. Survivor status, last surviving round, correct count and server-measured answer time determine survival ranking. Score mode uses correct count and server-measured answer time. All exact ties split occupied prizes.
- Prize pool: one remaining participant 100%, two 70/30%, three or more 60/30/10%. Voluntary departures forfeit eligibility; if everyone leaves, entries are refunded.
- Server owns shuffled questions, correct answers, deadlines, ranks and money. Responses never include future questions or correct answers before reveal. Answer submission is one-shot and tied to the question token.
- BigInt wallet arithmetic; balances and ledger, escrow deletion and statistics are in the same SQLite transaction. Uses existing game_state persistence, without changing DB configuration or adding services.
- In-progress rounds live in memory. Restart cancels them and refunds all held entries atomically, before general room recovery. Quiz records and solo daily limits persist through existing DB snapshots.
- Existing SSE sends participant-only refresh events; no frequent polling. One server timeout per active room and one client deadline refresh; client countdown itself is local. Waiting/completed rooms expire after 20 minutes. Returning from background or reconnecting refreshes state.
- Main lobby entry and existing /api/my-room recovery are connected. Multiplayer cross-membership with poker, baccarat, treasure and Sichuan is blocked.

## Verification

`npm run test:goldenbell` covers question structure and arithmetic, private answers, duplicate submission, solo completion/reward limits/KST rollover, 12-player capacity, survival revival and grace, timer expiry, atomic insufficient-balance failure, tied prizes, forfeits, balances above Number.MAX_SAFE_INTEGER, restart refund and saved records. HTTP tests launch the actual admin-unlimited-start entrypoint in an isolated temporary data directory and check authentication, assets, room membership, debit, reveal and refund.

Existing `npm run check` and `npm run test:treasure` passed during implementation. Browser visual and two-browser UI tests could not run in the implementation environment because the Chromium download failed; live mobile UI verification remains necessary.

No deployment/database/environment changes are included. Existing accounts are not reset.
