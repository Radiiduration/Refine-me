# Refine

Refine is a local-first writing assistant for the web editor, Chrome, iPhone, Android, and macOS desktop. It asks for missing context, offers five writing tones, and streams a rewrite from a model you run on your own computer. You review the result before replacing any text.

Refine has no account, telemetry, cloud history, or third-party model API. Drafts are sent to the Refine API and the model endpoint you configure.

## First run

The website opens on the installation guide. Start with the **Mac** tab to run the model and local API, then choose the client you want to install. The **LOCAL FIRST** callout describes where draft text goes. Open the writing studio when setup is ready.

### Requirements

- macOS computer; 16 GB memory recommended for the default model
- Git, Python 3, Node.js, and llama.cpp
- Approximately 2.5 GB free for Qwen3 4B Q4_K_M weights, plus runtime memory and build space

### Run the local model and API

From the repository root, install llama.cpp and the Python dependencies:

```sh
brew install llama.cpp
python3 -m venv .venv
. .venv/bin/activate
pip install -r apps/api/requirements.lock
```

Start these in separate terminals:

```sh
make model-server  # downloads Qwen3 4B Q4_K_M on first run; listens on 127.0.0.1:8080
make api           # local Refine API at 127.0.0.1:8000
```

The model server binds to loopback. The normal API command also binds to loopback, so other devices cannot connect to it.

## Install a client

### Web editor

```sh
cd apps/web
npm ci
npm run dev
```

Open the address Vite prints. The local editor uses the Refine API on port 8000. The installation guide appears first; choose **Open writing studio** when ready.

### Chrome extension

```sh
cd apps/chrome-extension
npm ci
npm run build
```

In Chrome, visit `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select `apps/chrome-extension/dist`. The extension uses Chrome's active-tab permission when you invoke it. Its API setting only accepts a loopback HTTP address.

### iPhone keyboard

See [apps/ios/README.md](apps/ios/README.md) for Xcode signing and keyboard setup. The iOS app stores the device token in Keychain. The keyboard connects to the model-running Mac over HTTPS on trusted Wi-Fi. iOS requires **Allow Full Access** for keyboard network access.

### Android keyboard

Run `make android-build`, install the debug APK, and follow [apps/android/README.md](apps/android/README.md). The token is stored with Android Keystore. Android also requires HTTPS for a remote Mac connection.

### macOS desktop app

```sh
cd apps/desktop
npm ci
npm run tauri dev
```

The Tauri studio and writing popover use the same warm paper, ink, lavender, and coral palette as the web editor. macOS may ask for Accessibility access so Refine can paste a rewrite into the previously focused application.

A macOS Apple Silicon DMG can be produced with `make release`. The desktop app is currently unsigned and not notarized. A Windows desktop installer is not currently provided.

## Connect a phone or a hosted website

For access from another device, use `make mobile-api` with a trusted TLS certificate and a random token of at least 32 characters:

```sh
export REFINE_MOBILE_TOKEN="$(openssl rand -hex 32)"
export REFINE_TLS_CERTFILE="/path/to/trusted-cert.pem"
export REFINE_TLS_KEYFILE="/path/to/private-key.pem"
make mobile-api
```

This command binds the API to the network so devices on the trusted Wi-Fi can reach it. Do not expose the development API directly to the public internet. Install/trust the certificate on each client, keep the token secret, and use a trusted private network.

For a Vercel-hosted web editor, set `REFINE_ALLOWED_ORIGINS` to the exact HTTPS site origin and configure the same HTTPS API address and device token in **Your privacy**. The Vercel site is a static editor; it does not host the model. The token stays in browser memory and is cleared when the page closes or reloads.

## Security and privacy

- Drafts go to the configured Refine API; the model runtime is local by default.
- The model server and normal API bind to loopback. LAN mode requires HTTPS and a device token.
- CORS accepts configured HTTPS origins and the local development clients.
- `/rewrite` and `/clarify` are limited to 10 requests per minute per client address in one API process. Request bodies are capped at 256 KiB, generation concurrency at two, and text fields at 20,000 characters.
- The web editor accepts loopback HTTP(S) or remote HTTPS only. Remote connections require a 32-character token, held in memory rather than browser storage.
- iOS uses Keychain; Android uses Android Keystore. The Chrome extension only connects to a loopback API.
- Refine does not intentionally log submitted drafts. Model failure logs omit exception details that could echo draft content.

These controls reduce exposure but cannot guarantee that a device, operating system, local network, certificate, or configured server is completely secure. Keep devices updated, protect the TLS key and device token, and only connect to systems you trust.

## Evaluation

A live preliminary evaluation used the local **Qwen3-4B Q4_K_M** model through llama.cpp on 20 hand-labeled prompts. The clarification decision matched the labels on **11/20 (55%)**: all 11 vague examples were flagged, but all 9 examples labeled clear were also flagged (0/9 specificity). This shows the current clarification behavior over-asks and needs improvement.

All 20 rewrite requests returned non-empty text. Manual review found one unsupported detail (the model added “persistent” to a noise complaint), one unrequested emoji, and several lowercase sentence openings. This is a small preliminary sample, not a comprehensive quality or safety benchmark. Run the API tests with `make test`; run the local evaluation with `make eval` while the model server is running.

## Development checks

```sh
make test
make web-build
make extension-build
make desktop-build
make ios-build
make android-build
```

`make release` runs the API tests and builds the web, extension, desktop, and macOS release artifacts.

## Licensing

Refine's original source is licensed under MIT; see [LICENSE](LICENSE). Third-party packages and model weights remain under their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Qwen3 GGUF weights are downloaded separately and are not included in the repository.

Refine is an independent project and is not affiliated with Grammarly. It does not reverse engineer Grammarly account-only behavior.
