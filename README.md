# AirNav

A webcam-driven, one-index-finger navigation demo. Built with plain JavaScript, HTML, CSS, Canvas, and MediaPipe Hand Landmarker. No build step or npm packages required.

## Run locally

Install Node.js, then run from this directory:

```powershell
node server.mjs
```

Open http://localhost:3000 in a recent Chrome or Edge browser. Click **Enable camera**, grant camera access, and wait for the model to load. Internet access is required for the version-pinned MediaPipe runtime, WASM, model, and optional web fonts. A system font fallback works if fonts are unavailable.

## Publish on GitHub Pages

The included `.github/workflows/pages.yml` publishes the website in `dist/` automatically whenever you push to the `main` branch.

1. Create an empty repository on GitHub, such as `airnav`.
2. Add this folder (`D:\Medapipe\airnav`) to GitHub Desktop, choose **Publish repository**, and push the `main` branch.
3. In the repository on GitHub, open **Settings → Pages → Build and deployment → Source**, then choose **GitHub Actions**.
4. Open the **Actions** tab and wait for **Publish AirNav to GitHub Pages** to finish. Your public link will then appear under **Settings → Pages**.

After that, commit and push changes to `main` to publish an update. GitHub Pages uses HTTPS, which allows the browser to request webcam access. Visitors must click **Enable camera** and allow that permission themselves. The first visit also needs an internet connection to load the MediaPipe model and runtime.

## Use your hand

1. Face your palm toward your webcam, keeping the full hand visible.
2. Extend only your index finger, curling the middle, ring, and little fingers.
3. Move your index finger to move the mirrored pointer.
4. Hold over a link or button for 1.1 seconds to activate it. Move away to activate it again.
5. Use the on-screen scroll buttons for longer pages. Preferences let you adjust dwell duration and smoothing with gesture-accessible buttons.

The first camera permission requires a physical click/tap. Navigation after setup works using one finger. This app controls its own four pages, buttons, gallery dialogs, and settings. It cannot control browser chrome, other browser tabs, or unrelated websites.

Camera frames are processed in the browser and are not uploaded. Stop camera releases webcam tracks. The tracker falls back from GPU to CPU if initialization fails. Model loading and camera errors appear in the control room.

## Pages

- Overview: start tracking and find the other pages.
- Playground: four targets with reset and click counters.
- Gallery: six CSS illustrations, category filters, and artwork dialogs.
- How it works: setup and demo guidance.

## Check

```powershell
npm.cmd run check
npm.cmd test
```

Tests cover dwell activation/rearming, camera-to-screen mapping, and index-only gesture geometry. A real webcam test is still required to validate accuracy under your demo lighting and hand position.

## Files

`dist/app.js`: camera lifecycle, MediaPipe loading, pointer, routing, UI.

`dist/gestures.js`: gesture geometry, screen mapping, and dwell state machine.

`dist/style.css`: responsive layout and gallery illustrations.

`server.mjs`: dependency-free localhost static server.

MediaPipe API reference: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
