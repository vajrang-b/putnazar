# Gaze Burn

A minimal webcam gaze-controlled photo-burning experiment. A demo image appears
on load; allow camera access and follow 16 targets in a 4×4 grid to calibrate.
After confirmation, the demo itself is ready to burn; choose another photo at
any time. Hold your gaze steady to burn images away with on-screen fire and
smoke. One saved calibration is reused across photos and page reloads;
recalibrate when needed or clear the locally stored features.

## Run locally

From this folder, start the static HTTP server:

```sh
node server.js
```

Open <http://127.0.0.1:4173> in a modern browser. Press `Ctrl+C` in the server
terminal to stop it. To use another port, for example:

```sh
PORT=4174 node server.js
```

### Testing on other local machines / phones over HTTPS

Webcam access requires a secure context (HTTPS, or `localhost`). When testing from
other devices on your Wi-Fi or local network (phones, tablets, laptops), serve the
app over HTTPS:

```sh
node server.js --https
# or
npm run serve:https
```

On first run, the server automatically generates a self-signed TLS certificate in
`.https/` configured with Subject Alternative Names (SAN) matching `localhost`,
`127.0.0.1`, and all detected local network IPv4 addresses (such as `10.0.0.104`).

1. Ensure the testing device is connected to the same Wi-Fi / local network.
2. Open `https://<server-lan-ip>:4173` on the device (e.g. `https://10.0.0.104:4173`).
3. Accept the self-signed certificate warning:
   - **Chrome / Edge**: Click **Advanced** &rarr; **Proceed to ... (unsafe)**. (If Chrome blocks with no link, type `thisisunsafe` on the page).
   - **Safari (iOS / macOS)**: Tap **Show Details** &rarr; **visit this website** &rarr; **Visit Website**.
   - **Firefox**: Click **Advanced** &rarr; **Accept the Risk and Continue**.
4. Allow camera permissions when prompted to calibrate and start burning.

Custom certificates can be passed via `--cert <path>` and `--key <path>` (or `SSL_CERT` and `SSL_KEY` environment variables). To force certificate regeneration for new IP addresses, use `--regen-cert`. Do not expose this development server to an untrusted network. The first camera start downloads the pinned MediaPipe runtime and face-landmarker model from public CDNs, so internet access is required. Webcam gaze and uploaded-photo processing run locally in the app. Microsoft Clarity is loaded on all pages and may collect usage, interaction, and page data; see the compliance page for details.

## Try the sample

The included `assets/portrait-demo.jpg` is shown as the
demo. Select **Start burning**, follow the 16 targets, then choose
a photo after calibration is confirmed. The selected photo remains in browser
memory only. The same calibration is reused for every photo; saved training
also works after reloading the app. Use **Recalibrate** to redo it.
If a spot won't burn, quick recalibration triggers automatically on up to four
clear spots on the remaining image. Burning resumes with the refined model and the
existing burn progress intact. The webcam preview is disabled to provide a
clean, distraction-free gaze experience.

Gaze is estimated from webcam face and iris landmarks, not measured by a
dedicated eye tracker. Accuracy varies with lighting, camera placement, and
individual differences. Each calibration adds averaged gaze features to
browser-local training data. Use **Clear training** to remove those stored
features.
There is intentionally no mouse or touch play mode. Fire and smoke are visual
effects only.

## Tests

Run the feature tests:

```sh
node --test tests/gaze.test.js
```

Run the existing repository test suite from the parent folder:

```sh
cd ..
npm test
```
