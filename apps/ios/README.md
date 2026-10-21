# Refine for iPhone

The iOS app contains a custom QWERTY keyboard with a **Refine** toolbar button. Select text in a text field, switch to Refine Keyboard, and tap the button to paraphrase the selection in a friendly tone. The result replaces the selection.

## Requirements

- A Mac with the full Xcode app and iOS SDK installed. Command Line Tools alone cannot build or sign an iOS app.
- iPhone and Mac connected to the same trusted Wi-Fi network.
- The local Refine model server and API running on the Mac.
- An Apple development team to install on a physical iPhone. Register `group.com.refine.writing` as an App Group for device signing.

## Run the local API for the iPhone

The regular `make api` command remains bound to loopback for local clients. For iPhone use, set a random shared token and start the separate LAN command:

```bash
export REFINE_MOBILE_TOKEN="$(openssl rand -hex 32)"
make mobile-api
```

The API listens on the Mac's network interfaces, but rejects non-local requests unless they include the configured token. Keep the token private and use a trusted Wi-Fi network. macOS may ask you to allow incoming connections. Find the Mac's Wi-Fi IP address in **System Settings → Wi-Fi → Details**.

## Configure and enable

1. Generate the Xcode project and open it:

   ```bash
   make ios-project
   open apps/ios/Refine.xcodeproj
   ```

2. In Xcode, select your development team for both targets. For device installation, register the App Group in your Apple Developer account, and make sure its identifier matches the entitlements. If needed, update the bundle IDs and group ID consistently in `project.yml`, the two `.entitlements` files, and the two Swift `SharedSettings` definitions.
3. Build and install the **Refine** app on your iPhone. Open it and save `http://<your-Mac-Wi-Fi-IP>:8001` and the same `REFINE_MOBILE_TOKEN` from the API terminal.
4. On iPhone, go to **Settings → General → Keyboard → Keyboards → Add New Keyboard… → Refine**.
5. Open **Refine Keyboard** in that list and enable **Allow Full Access**. iOS requires this because the keyboard makes a network request to your configured local API. **Background App Refresh is not needed.**
6. In a text field, select a passage, switch keyboards with the globe key, and tap **Refine**.

The keyboard sends only the selected passage to the configured private Refine API, which forwards it to the local model. The keyboard refuses non-private API hostnames and IP ranges. Some apps disable third-party keyboards or selected-text access; those fields cannot use this keyboard.

## Build check

With full Xcode installed:

```bash
make ios-build
```

The keyboard requests iOS **Allow Full Access** so it can reach the local API and share its settings with the containing app. It does not use Background App Refresh, analytics, or a cloud model.
