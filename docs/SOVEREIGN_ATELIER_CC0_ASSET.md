# Sovereign GT Atelier — third-party asset provenance

- **What this is:** an isolated technical showroom replacing handcrafted toy-like geometry with a genuine 3D asset. It is **not** a completed JUNJA-exclusive model or sellable premium collectible.
- **Model:** Spectral GT RS, created by JaronKBragg7337.
- **Source:** https://github.com/JaronKBragg7337/spectral-gt-rs
- **Pinned source commit:** `34499c501908818a2b08e589a7aecf963343cee7`
- **Pinned source GLB Git object SHA-1:** `f5b814848453a6c75a48f5047fdadaa7bdc78969`
- **Model license:** CC0 1.0 Universal. The upstream repository includes an explicit CC0 dedication for the 3D model, source and screenshots. CC0 generally permits copying, modifying and commercial uses without attribution, subject to other rights. We still voluntarily credit the creator on the page.
- **Renderer:** Three.js `0.180.0`, MIT License, with a local copy of the official LICENSE file and only required runtime modules.
- **Material:** the GLB includes native clearcoat paint, glass, carbon, interior and lights; these are not photos or AI-generated CSS approximations.
- **Motion:** the GLB declares door / hood / steering clips. The atelier demonstrates clips but does not yet guarantee persistent door-open state.
- **Reproducible packaging:** `npm run build:premium-atelier` copies the pinned local Three.js modules and downloads the GLB from the pinned upstream commit if it is not already present. It validates the exact Git blob digest before accepting the asset. Docker must build successfully before Railway deploys this page.
- **User-data separation:** no ownership, purchase, balance, bank, auction, PG or inventory endpoints are touched. Existing `/premium-sovereign-lab.html` draft storage/share endpoints remain intact.
- **Commercial quality gate:** still requires original licensed re-art-direction, independent artist QA, mobile screenshot comparison, performance monitoring and server-backed ownership integration before allowing paid acquisition. Do not represent this preview as an owned member item.
- **Trademark caution:** Spectral GT RS is a third-party original fictional model. This integration does not imply affiliation, approval, sponsorship or a real car maker's license.
