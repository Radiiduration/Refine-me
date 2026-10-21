# Refine for Android

Refine Keyboard is an Android input method (IME). It can be selected anywhere Android allows third-party keyboards. It has a compact QWERTY layout and a **✦ Refine** action above the keys. Select text in the current field, switch to Refine Keyboard, and tap Refine to paraphrase and replace the selection.

## Build and install

Build the debug APK:

```sh
make android-build
```

The APK is written to `apps/android/app/build/outputs/apk/debug/app-debug.apk`. Install it on a connected Android phone with `adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk`, or transfer the APK and open it on the phone. Android will ask you to confirm installation from that source.

Open Refine and save the Mac's private Wi-Fi address using port `8001` and the `REFINE_MOBILE_TOKEN` used by the API. Then tap **Enable Refine Keyboard**, enable it in Android's keyboard list, and select it from the globe/keyboard-switcher control. **Try the keyboard** opens a sample field for a quick local check.

## Start the private API

In a terminal on the Mac, create a private token and start the API:

```sh
export REFINE_MOBILE_TOKEN="$(openssl rand -hex 32)"
make mobile-api
```

The phone and Mac must be on the same trusted Wi-Fi network. Set the API address in Refine to `http://<your-Mac-Wi-Fi-IP>:8001`. Requests from other devices require the token; the model server stays bound to loopback. Keep the token private. The default `make api` command remains loopback-only on port 8000 for the desktop and web clients.

The keyboard sends only selected text to the configured API, which uses the local model. It refuses non-private network hosts. Password fields and apps that prohibit third-party keyboards are controlled by Android and may not allow Refine Keyboard. Android requires enabling/selecting the IME; Background App Refresh is an iPhone setting and is not involved.

This debug APK is signed with the Android debug key for local installation. A Google Play release needs the publisher's release signing key and store listing.
