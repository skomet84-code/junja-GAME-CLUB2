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
- **Source changes in prototype:** retains the original glTF mesh geometry and authored coordinate transform, adds studio lighting, close-up camera presets and independently cloned exterior PBR materials (body clearcoat/secondary paint, four rim finishes, physically modeled hood-top satin-graphite grille and four brake components). Steering emblem and license-plate visuals are hidden. This is **not** original JUNJA car geometry. Original material/mesh data is not sold as owned.
- **Door and hood:** this exterior-first showroom intentionally hides and disables door/hood experiments; the glTF itself has no exported native animation clips. The separate historic design lab retains its own saved-draft features. The imported source uses **Z-up** mesh coordinates, but its glTF root `BodyUnderside` already contains the Y-up conversion. Preserve that root matrix; **do not rotate the loaded scene a second time**.
- **Renderer:** local Three.js `0.180.0`, MIT License; the official dependency's LICENSE is packaged.

## Validation and safety

`npm run build:premium-atelier` downloads the exact pinned GLB during CI/Docker and validates its Git blob digest; mismatches or source failure block the release. No third-party JavaScript CDN is required at runtime. The existing member design-saving system at `/premium-sovereign-lab.html` is unchanged. No payment, inventory, user assets, casino balance, banking or actual ownership endpoints are touched.

**Commercial quality gate:** an artist must still create or substantially reauthor JUNJA-exclusive 3D body/silhouette (front bumper, lamp geometry, vehicle proportions and original signature trim) before representing it as a unique premium collectible. Also require all logo/IP checks, measured iPhone GPU and memory performance, accessible controls, server-validated inventory and independent legal/PG approval before selling. Current exterior finish upgrades remain **development-only**.
