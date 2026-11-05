# Sovereign GT atelier — licensed car concept source

This is an isolated **preproduction** vehicle study. It is not a finished original JUNJA luxury collectible, and cannot be purchased or owned in the game.

## Licensed original

- **Model:** Car Concept (Khronos glTF Sample Assets), with a realistic car body, PBR clearcoat, metallic paint flakes, transparent glazing, interior, separate door parts, and optional material variants.
- **Artist:** Eric Chadwick, Darmstadt Graphics Group GmbH (2024). The source was initially derived from a public-domain Unity Fan base model, then prepared and retextured for glTF.
- **License:** **CC-BY-4.0**, permitting commercial and derivative work with attribution and other applicable conditions. The model's logos and trademarks are **not** licensed by CC-BY. We hide the model's named steering-badge and license-plate nodes in the JUNJA technical prototype; manual artist review is still required for all remaining visual marks.
- **Source:** https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept
- **Pinned upstream commit:** `8f492390ddc7a2ae221a1369ef560589cf8c70fb`
- **Pinned Git blob SHA-1:** `c0f38c989a78cc4ba63253b5338705e0afb0142f`
- **License details:** https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/CarConcept/LICENSE.md
- **Source changes in prototype:** scene coordinate-axis correction, studio-lit rendering, camera, selection controls, paint customization, manually animated native door/bonnet pivots; steering emblem and license plate hidden. Original material/mesh data is not sold as owned.
- **Door and hood:** the glTF includes two grouped doors and a grouped bonnet with proper pivots, but **no native animation clips**. JUNJA now adds its own easing-driven hinge rotations on the imported actual mesh hierarchy (left/right local Z and bonnet local X); WebKit and Chromium regression tests validate open/close. The imported source has **Z-up** mesh coordinates, but its glTF root `BodyUnderside` already includes a −90° X conversion to Y-up. Preserve that root matrix; **do not rotate the loaded scene a second time**.
- **Renderer:** local Three.js `0.180.0`, MIT License; the official dependency's LICENSE is packaged.

## Validation and safety

`npm run build:premium-atelier` downloads the exact pinned GLB during CI/Docker and validates its Git blob digest; mismatches or source failure block the release. No third-party JavaScript CDN is required at runtime. The existing member design-saving system at `/premium-sovereign-lab.html` is unchanged. No payment, inventory, user assets, casino balance, banking or actual ownership endpoints are touched.

**Commercial quality gate:** further original art-direction, all logo checks, measured mobile performance, accessible interaction, actual server-validated inventory and separate legal/PG approval are still required before enabling selling or declaring a premium asset finished.
