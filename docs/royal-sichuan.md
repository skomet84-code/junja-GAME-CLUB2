# Royal Sichuan — 왕관의 정원

A standalone first release integrated into the JUNJA LAND lobby. Four chapters,
24 progressive stages, 12 original vector tile symbols, a generated royal garden
background, 5-combo fever (12 seconds / 3×), hints, deterministic deadlock recovery,
up/down gravity, Korean-local-date daily puzzle, and untimed relaxation mode.

Reference review (2026-09-27):
- Anipang Sichuan: stage/mission variety, recognizable tiles.
  https://apps.apple.com/kr/app/id592065188
- Tantan Sichuan: chapter rewards and collectible progression (not its multiplayer).
  https://play.google.com/store/apps/details?id=com.neptune.tantan
- Simple Shisen: difficulty progression and usability.
  https://play.google.com/store/apps/details?id=jp.analogsoft.SimpleShisenSho
Original concept: royal botanical environments, gem/heraldic tile vocabulary,
chapter crown collection, and visible gold connection paths. No competitor art used.

## Scope and persistence

Single-player points only; no wallet awards or wagers. Progress and daily bests
are device-local, partitioned by the existing account ID; they are not server
rankings, cloud saves, or anti-cheat protected. The UI discloses local storage.
Daily layout is identical for a date, changes at midnight Asia/Seoul, and retries
retain its seed. Journey and relaxation retries generate a new layout.

The iframe is created lazily on first entry. Its CSS and JS have no effect on the
other games. Host navigation and document visibility pause the clock. No fetch,
DB writes, network polling, streamed music, or new runtime dependencies are added.
The existing service worker handles versioned static resources normally.

## Rules and verification

At most two turns, no occupied intermediate cell, outside border allowed. Board
construction records a valid removal order. After gravity, a deadlock causes a
free solvable re-layout preserving the remaining multiset. Timed input is locked
once the result has been produced. Stage rewards are stars and chapter emblems.

Run `node tests/sichuan-engine.cjs` (no dependencies). It compares the pathfinder
with an independent bounded-turn walk oracle and clears 288 stage/seed boards,
then checks gravity, deterministic generation and KST midnight.

Optional browser gate: `node tests/sichuan-browser.cjs` with Playwright installed,
or set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` to existing runtime paths. It checks
a full clear, saved progression, mobile widths, pause, timeout, daily retry,
relaxation, hints and multiset-preserving shuffle. Physical iOS Safari testing
remains a release follow-up; Chromium emulation is not a substitute for it.

## Art provenance

`public/sichuan/garden.webp` is a 368 KB optimized project asset generated using
the built-in image-generation tool. Prompt: lavish enchanted royal conservatory
at midnight; emerald/teal architecture, gilded arches, crescent moon, distant
palace, magnolia/peonies, reflective water and subtle gold dust; premium stylized
3D fantasy art; landscape composition, quiet central 60%, detail on edges/top;
no UI, tiles, text, characters or watermarks. The original PNG is not required
at runtime. Tile symbols are original code-native SVG for legibility.
