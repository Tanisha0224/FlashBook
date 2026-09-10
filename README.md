# Flashbox

A retro photo booth built with plain HTML, CSS, and JavaScript. Capture, styling, and direct PNG downloads run locally without a build step. Optional QR sharing uses the included Python server and temporary in-memory photo storage; no database is required.

Open `index.html` to use photo uploads. For the full app, install `requirements.txt`, run `python server.py`, and visit `http://localhost:4174`. QR sharing needs `PUBLIC_BASE_URL` and HTTPS hosting; see [SHARING.md](SHARING.md). The older `python -m http.server 4173` command supports local camera and direct downloads only. Deployed camera access requires HTTPS and browser permission.

Capture timed bursts, keep taking more photos, or upload up to 8 images. Select 3 or 4 favorites in order, choose layouts, frames, filters and paper colors, then preview and download the PNG. Create QR explicitly uploads a snapshot for one hour so another device can save it. Google Fonts supplies the optional display fonts; system font fallbacks work offline.

Includes beige (default) and dark themes, camera grid, synthesized sounds, responsive layouts, reduced-motion support, and a keyboard-accessible preview dialog. Retake preserves your existing print; Start over clears photos and caption while preserving your mode, theme, and style choices.

See [TESTING.md](TESTING.md) for automated verification coverage and remaining real-browser acceptance checks.
