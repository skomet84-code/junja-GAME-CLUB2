# JUNJA PRIVATE COLLECTION — flagship physical quality gate (design to implementation)

> 2026-11-05 · 1차 우선순위: **로얄 모터 라운지 + 소버린 GT**, then watch, jewelry, palace. This is a **specification**; it is not a claim that photoreal 3D models are deployed.

## Why the existing six preview listings cannot go on sale

- Existing premium-preview storefront shows six *static showroom images*.
- No independently inspectable 3D vehicle model, physically convincing lighting/material system, camera orbit or interactive product interior.
- Live user purchases, entitlement activation, in-game gallery and refund application are still not joined end-to-end; this is separate from J-GOLD luxury gallery and its G-money collectibles.
- A clickable picture is not an interactive 3D collectible; do not relabel CSS transforms as 3D.
- No real-money checkout/PG launch until all external approvals.

## Flagship 1: Sovereign GT

**Separate original fictional supercar design, not a trademarked real manufacturer's replica.**

1. Exterior asset: licensed original PBR glTF/GLB, physically detailed body, wheels, lamps, glass, brake assembly and cockpit interior. No unlicensed commercial logos. Verify triangle count and mobile memory budget.
2. Interactive controls (real browser input): orbit around car, zoom, driver's door open, lights on/off, interior view, three paint finishes. Present only functions actually implemented.
3. Gallery display: cinematic black marble stage, warm gold spotlights, creator label, serial/owner plate, responsive frame. Users can save a *non-purchased draft preview* without implying ownership.
4. Quality control: compare model and preview in low-end phone + desktop at 360/390/768/1280 CSS pixels. Aim 30 FPS or better on representative phones, graceful fallback when WebGL unavailable, reduced-motion accommodation and keyboard controls.
5. Only verified premium ownership is allowed to activate cosmetics. No J-GOLD gain, no transferable asset value, no wager/loan/auction advantage.
6. All activation and retraction must be server authorized with optimistic concurrency; refund must revoke both ownership and active appearance.

## Flagship 2: Royal Motor Lounge

- Dedicated gallery interior with appropriate reflections/environment map; do not reuse the same single hero PNG across multiple expensive products.
- An owned car is placed in an actual configurable display slot (not a fake permanent showroom screenshot).
- Visitor mode: public gallery can see *only* items the owner chooses to display.
- Ownership marker, source, dated acquisition and truthful edition numbering; **no false scarcity**.
- UI exposes model loading/fallback status; image-only fallback is labeled appropriately, not advertised as a 3D product.

## Asset pipeline + visual quality blocking gate

| Stage | Must be true | Not sufficient |
|---|---|---|
| Asset | Original licensed physically based GLB; multi-angle inspection | Still image or product photo alone |
| Interaction | Actual user input changes 3D camera, material and scene | CSS scale or text-only controls |
| Ownership | Entitlement checked server-side and stored separately from G-money economy | Client-controlled localStorage 'owned' flag |
| Demonstration | Prospective user sees identical quality before/after acquiring | AI-generated one-off promotional image |
| Operations | Backup, revocation, rollback and support | Anecdotal claim that an item is now sold |
| Commerce | Independent PG approval and legal review completed | Developer-only simulated checkout |

## Expansion later, not premature catalog inflation

After first two flagship items pass, grow to 12 differentiated collection SKUs, with watch macro movement, rotating gemstone materials, actual palace slots, personal nameplates and appearance in profile/lobby/galleries. The 12-item plan is the product **roadmap**, not evidence of 12 complete goods today.

## Status as of 2026-11-05

- **Implemented:** 6-item static preview, legacy G-money royal gallery with ownership and certificates, isolated nontransferable premium entitlement prototype, payment disabled.
- **Not implemented:** the premium Sovereign GT GLB, complete WebGL showroom, real user-facing ownership/profiles integration, commercial-grade mobile asset QA.
- **Next code milestone:** secure an original commercial-use GLB asset, implement a physically based WebGL viewer *with a truthful fallback*, then prove its functionality in automatic browser tests and only subsequently ship it to production.
