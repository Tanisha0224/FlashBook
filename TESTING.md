# Functional verification

Run `node --test flow.test.cjs` and `node check.cjs` from this folder.

The expanded suite has 15 passing scenarios. It executes the actual application script with simulated DOM, camera, canvas, image-decoding, timer, and download APIs. It covers:

- Camera startup, permission denial, missing hardware, playback failure, and reconnect.
- Six/seven-shot bursts, all four timer options, mirror transforms, and capture cancellation.
- Grid independence and retaining unfiltered source frames.
- Upload limits, unreadable files, picker cancellation, portrait/landscape crop coordinates, and URL cleanup.
- Ordered selection, selection limits, changing the target count, and three/four-frame print dimensions.
- Filters, paper colors, captions, style presets, preview updates, retake, and reset.
- Printing during camera disconnection, reduced-motion timing, keyboard upload access, and page cleanup.
- Preview-before-download, modal buttons/backdrop, PNG MIME type and filename request, export-error recovery, and temporary link cleanup.

## Limits

The in-app browser reported no available browsers during verification. These tests do **not** verify real webcam pixels, browser canvas filter support, audio playback, layout, native Escape/focus behavior, or that the operating system saved a valid PNG. Canvas export and device input are simulated; a download request is not proof of a saved file.

## Real-browser acceptance check

1. Open http://localhost:4173 and allow camera access. Confirm the preview is mirrored.
2. Use Timer Off and then 3s, capture, and select favorites in a deliberately different order.
3. Build the strip, open its preview, download PNG, and open the saved image. Confirm the photo order, crop, filter, caption, and paper color. Expected dimensions: 464 × 1106 for 3 shots, or 464 × 1422 for 4.
4. Repeat with portrait and landscape image uploads. Check Noir and Duotone Pink in the actual downloaded image.
5. Close preview with Escape, backdrop, and both close controls. Confirm keyboard focus returns appropriately.
6. Retake while preserving the print, then Start over and confirm photos/caption clear while mode and beige/dark theme remain selected.
7. Check camera permission denial, phone-width layout, and reduced-motion mode.
