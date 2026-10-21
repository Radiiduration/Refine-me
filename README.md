# Refine

Refine is a privacy-first writing assistant for your browser, web editor, and desktop. It clarifies missing context, offers five tones, and streams rewrites from a model you run locally. It does not need an account, cloud API, analytics, or telemetry.

## Laptop setup (macOS, 16 GB RAM)

The default model is Qwen3 4B in Q4_K_M quantization. The server binds to loopback, uses one request slot, and limits context to 4,096 tokens to leave memory for the rest of the system.

Install [llama.cpp](https://github.com/ggml-org/llama.cpp) (Homebrew: `brew install llama.cpp`) and Python dependencies:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r apps/api/requirements.lock
```

Run these in separate terminals from the repository root:

```sh
make model-server  # downloads the GGUF on first run; listens only on 127.0.0.1:8080
make api           # local API at http://127.0.0.1:8000
```

## iPhone keyboard

The iOS keyboard runs as an app extension and uses the same local model on your Mac. Setup, HTTPS LAN token protection, Xcode signing, and keyboard installation steps are in [apps/ios/README.md](apps/ios/README.md). The default `make api` stays loopback-only; use `make mobile-api` only with a trusted TLS certificate and a long random token. Do not expose the development API directly to the public internet.

## Android keyboard

Build the installable debug APK with `make android-build`. Open Refine on the phone, save the Mac's HTTPS API address and `REFINE_MOBILE_TOKEN`, then enable **Refine Keyboard** under Android's keyboard/input-method settings and select it from the keyboard switcher. Android uses a system keyboard (IME), not a floating bubble, and does not need Background App Refresh. See [apps/android/README.md](apps/android/README.md) for installation and LAN setup.

The model server uses roughly 2.5 GB for the quantized weights; actual memory varies with context and runtime. Change the model and API settings in `apps/api/.env` if needed. `apps/api/llm.py` is the only module that interprets those backend settings.

## Web editor

```sh
cd apps/web
npm ci
npm run dev
```

Open the local address printed by Vite. The editor talks to the local Refine API at port 8000. You can paste text, refine it, choose a tone, regenerate, and copy the result.

### Deploy the web editor to Vercel

Import this repository in Vercel and set the project root to `apps/web`; the included `apps/web/vercel.json` configures the Vite build. The deployed editor is static and does not host an AI model. To use it with a self-hosted API, configure a trusted HTTPS endpoint, set `REFINE_ALLOWED_ORIGINS` to the exact HTTPS Vercel origin, and enter the device token in **Your privacy → Device token**. The token stays in page memory and is cleared when the page closes or reloads. The API requires the token for non-loopback clients and configured web origins, and accepts only configured CORS origins. Do not expose the development API directly to the public internet.

## Chrome extension

```sh
cd apps/chrome-extension
npm ci
npm run build
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/chrome-extension/dist`. Refine uses Chrome's temporary active-tab permission after you invoke its toolbar action, context menu, or shortcut; it does not run a content script across every website in the background. Select text in a browser writing field and invoke Refine to choose a context and tone, then review the rewrite before replacing the selection. The extension also adds a right-click action and `Ctrl+Shift+R` / `Command+Shift+R` shortcut. Its API setting accepts loopback HTTP only.

## Desktop app

```sh
cd apps/desktop
npm ci
npm run tauri dev
```

The desktop client uses the same API and prompts. On macOS, **Replace in App** copies the rewrite and pastes it into the previously focused application; macOS may ask you to grant Accessibility permission to the app.

## Release artifacts

Run `make release` on macOS to run the API tests, build all three clients, and create release ZIPs plus a macOS Apple Silicon DMG in `release/`. The desktop bundle is unsigned and not notarized; those steps require the distributor's Apple Developer credentials. The extension ZIP can be uploaded to the Chrome Web Store by its publisher. The web editor is built as static files and requires the local Refine API and model server.

## API check

```sh
curl http://127.0.0.1:8000/health
curl -N http://127.0.0.1:8000/rewrite \
  -H 'Content-Type: application/json' \
  -d '{"text":"hey can u send the report","tone":"formal"}'
```

## Privacy and scope

Draft text is sent only to the configured local or self-hosted model server through the Refine API. The mobile API requires HTTPS and a device token; it is intended for trusted private networks, not direct public exposure. No draft logging, telemetry, third-party model calls, user accounts, or cloud sync are included. The extension requests active-tab interaction, local storage, context menus, and access to the loopback API.

Refine is an independent project and is not affiliated with Grammarly. The implementation follows observed public behavior and the project specification; Grammarly account-only editor behavior was not reverse engineered.

## License

MIT. See [LICENSE](LICENSE).
