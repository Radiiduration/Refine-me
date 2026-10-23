# Third-party notices

Refine source code written for this repository is licensed under MIT; see [LICENSE](LICENSE). This file identifies important runtime and build components. Each component remains governed by its own license. Keep applicable copyright and license notices with redistributed binaries or source bundles. This inventory is based on the checked-in lockfiles and project manifests; regenerate/review it whenever dependencies change.

## Model and inference runtime

- **Qwen3-4B-GGUF, Q4_K_M** — Apache License 2.0. The model card identifies this license. The weights are downloaded by llama.cpp at runtime and are not included in this repository or Refine source releases. Preserve the model publisher attribution and license when redistributing model weights. [Qwen model card](https://huggingface.co/Qwen/Qwen3-4B-GGUF) · [Apache-2.0 text](https://www.apache.org/licenses/LICENSE-2.0).
- **llama.cpp** — MIT License. Installed separately by the user; it is not vendored in this repository. [Upstream license](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE).

## Direct application dependencies

| Component | License | Used by |
|---|---|---|
| React and React DOM | MIT | Web, desktop |
| Lucide React | ISC | Web and desktop icons |
| Vite, Tailwind CSS, clsx, tailwind-merge | MIT | Web and desktop build/runtime |
| TypeScript | Apache-2.0 | Web, extension, desktop build |
| Tauri, serde, serde_json, arboard | MIT OR Apache-2.0 | macOS desktop |
| FastAPI, Pydantic, AnyIO | MIT | API |
| Starlette, HTTPX, httpcore, python-dotenv, Uvicorn | BSD-3-Clause | API |
| Kotlin and Android Gradle Plugin | Apache-2.0 | Android build |
| Apple SwiftUI and UIKit | Apple platform SDK terms | iOS app and keyboard; supplied by Xcode, not bundled in this repository |

The precise resolved JavaScript package versions and SPDX license metadata are listed below from the checked-in `package-lock.json` files. Optional platform packages are included in that inventory because the package manager records them in the lockfile; they are not necessarily shipped in an app. Python pins are in [`apps/api/requirements.lock`](apps/api/requirements.lock), Rust pins in [`apps/desktop/src-tauri/Cargo.lock`](apps/desktop/src-tauri/Cargo.lock), and Android plugin versions in the Gradle build files. Transitive packages retain their upstream licenses.

## Locked JavaScript package inventory

### Web editor

| Package | Locked version | License metadata |
|---|---:|---|
| `@jridgewell/gen-mapping` | `0.3.13` | `MIT` |
| `@jridgewell/remapping` | `2.3.5` | `MIT` |
| `@jridgewell/resolve-uri` | `3.1.2` | `MIT` |
| `@jridgewell/sourcemap-codec` | `1.6.0` | `MIT` |
| `@jridgewell/trace-mapping` | `0.3.31` | `MIT` |
| `@oxc-project/types` | `0.154.0` | `MIT` |
| `@rolldown/binding-android-arm-eabi` | `1.2.14` | `MIT` |
| `@rolldown/binding-android-arm64` | `1.2.14` | `MIT` |
| `@rolldown/binding-darwin-arm64` | `1.2.14` | `MIT` |
| `@rolldown/binding-darwin-x64` | `1.2.14` | `MIT` |
| `@rolldown/binding-freebsd-x64` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-arm-gnueabihf` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-arm64-gnu` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-arm64-musl` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-ppc64-gnu` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-s390x-gnu` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-x64-gnu` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-x64-musl` | `1.2.14` | `MIT` |
| `@rolldown/binding-openharmony-arm64` | `1.2.14` | `MIT` |
| `@rolldown/binding-win32-arm64-msvc` | `1.2.14` | `MIT` |
| `@rolldown/binding-win32-x64-msvc` | `1.2.14` | `MIT` |
| `@rolldown/pluginutils` | `1.0.1` | `MIT` |
| `@tailwindcss/node` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-android-arm64` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-darwin-arm64` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-darwin-x64` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-freebsd-x64` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-linux-arm-gnueabihf` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-linux-arm64-gnu` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-linux-arm64-musl` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-linux-x64-gnu` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-linux-x64-musl` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-wasm32-wasi` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-win32-arm64-msvc` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-win32-x64-msvc` | `4.3.3` | `MIT` |
| `@tailwindcss/vite` | `4.3.3` | `MIT` |
| `@types/prop-types` | `15.7.15` | `MIT` |
| `@types/react` | `18.3.31` | `MIT` |
| `@types/react-dom` | `18.3.7` | `MIT` |
| `@vitejs/plugin-react` | `6.1.2` | `MIT` |
| `clsx` | `2.1.1` | `MIT` |
| `csstype` | `3.2.3` | `MIT` |
| `detect-libc` | `2.1.2` | `Apache-2.0` |
| `enhanced-resolve` | `5.26.0` | `MIT` |
| `fsevents` | `2.3.3` | `MIT` |
| `graceful-fs` | `4.2.11` | `ISC` |
| `jiti` | `2.7.0` | `MIT` |
| `js-tokens` | `4.0.0` | `MIT` |
| `lightningcss` | `1.32.0` | `MPL-2.0` |
| `lightningcss-android-arm64` | `1.32.0` | `MPL-2.0` |
| `lightningcss-darwin-arm64` | `1.32.0` | `MPL-2.0` |
| `lightningcss-darwin-x64` | `1.32.0` | `MPL-2.0` |
| `lightningcss-freebsd-x64` | `1.32.0` | `MPL-2.0` |
| `lightningcss-linux-arm-gnueabihf` | `1.32.0` | `MPL-2.0` |
| `lightningcss-linux-arm64-gnu` | `1.32.0` | `MPL-2.0` |
| `lightningcss-linux-arm64-musl` | `1.32.0` | `MPL-2.0` |
| `lightningcss-linux-x64-gnu` | `1.32.0` | `MPL-2.0` |
| `lightningcss-linux-x64-musl` | `1.32.0` | `MPL-2.0` |
| `lightningcss-win32-arm64-msvc` | `1.32.0` | `MPL-2.0` |
| `lightningcss-win32-x64-msvc` | `1.32.0` | `MPL-2.0` |
| `loose-envify` | `1.4.0` | `MIT` |
| `lucide-react` | `0.263.1` | `ISC` |
| `magic-string` | `0.30.21` | `MIT` |
| `nanoid` | `3.3.20` | `MIT` |
| `picocolors` | `1.1.1` | `ISC` |
| `picomatch` | `4.0.7` | `MIT` |
| `postcss` | `8.5.30` | `MIT` |
| `react` | `18.3.1` | `MIT` |
| `react-dom` | `18.3.1` | `MIT` |
| `rolldown` | `1.2.14` | `MIT` |
| `scheduler` | `0.23.2` | `MIT` |
| `source-map-js` | `1.2.2` | `BSD-3-Clause` |
| `tailwind-merge` | `1.14.0` | `MIT` |
| `tailwindcss` | `4.3.3` | `MIT` |
| `tapable` | `2.3.3` | `MIT` |
| `tinyglobby` | `0.2.17` | `MIT` |
| `tinyglobby/node_modules/fdir` | `6.5.0` | `MIT` |
| `typescript` | `5.9.3` | `Apache-2.0` |
| `vite` | `8.3.4` | `MIT` |
| `vite/node_modules/lightningcss` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-android-arm64` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-darwin-arm64` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-darwin-x64` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-freebsd-x64` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-linux-arm-gnueabihf` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-linux-arm64-gnu` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-linux-arm64-musl` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-linux-x64-gnu` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-linux-x64-musl` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-win32-arm64-msvc` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-win32-x64-msvc` | `1.33.0` | `MPL-2.0` |

### Chrome extension tooling

| Package | Locked version | License metadata |
|---|---:|---|
| `@types/chrome` | `0.0.230` | `MIT` |
| `@types/filesystem` | `0.0.36` | `MIT` |
| `@types/filewriter` | `0.0.33` | `MIT` |
| `@types/har-format` | `1.2.16` | `MIT` |
| `@types/webextension-polyfill` | `0.12.6` | `MIT` |
| `typescript` | `5.9.3` | `Apache-2.0` |

### macOS desktop app

| Package | Locked version | License metadata |
|---|---:|---|
| `@jridgewell/gen-mapping` | `0.3.13` | `MIT` |
| `@jridgewell/remapping` | `2.3.5` | `MIT` |
| `@jridgewell/resolve-uri` | `3.1.2` | `MIT` |
| `@jridgewell/sourcemap-codec` | `1.6.0` | `MIT` |
| `@jridgewell/trace-mapping` | `0.3.31` | `MIT` |
| `@oxc-project/types` | `0.154.0` | `MIT` |
| `@rolldown/binding-android-arm-eabi` | `1.2.14` | `MIT` |
| `@rolldown/binding-android-arm64` | `1.2.14` | `MIT` |
| `@rolldown/binding-darwin-arm64` | `1.2.14` | `MIT` |
| `@rolldown/binding-darwin-x64` | `1.2.14` | `MIT` |
| `@rolldown/binding-freebsd-x64` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-arm-gnueabihf` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-arm64-gnu` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-arm64-musl` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-ppc64-gnu` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-s390x-gnu` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-x64-gnu` | `1.2.14` | `MIT` |
| `@rolldown/binding-linux-x64-musl` | `1.2.14` | `MIT` |
| `@rolldown/binding-openharmony-arm64` | `1.2.14` | `MIT` |
| `@rolldown/binding-win32-arm64-msvc` | `1.2.14` | `MIT` |
| `@rolldown/binding-win32-x64-msvc` | `1.2.14` | `MIT` |
| `@rolldown/pluginutils` | `1.0.1` | `MIT` |
| `@tailwindcss/node` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-android-arm64` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-darwin-arm64` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-darwin-x64` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-freebsd-x64` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-linux-arm-gnueabihf` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-linux-arm64-gnu` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-linux-arm64-musl` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-linux-x64-gnu` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-linux-x64-musl` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-wasm32-wasi` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-win32-arm64-msvc` | `4.3.3` | `MIT` |
| `@tailwindcss/oxide-win32-x64-msvc` | `4.3.3` | `MIT` |
| `@tailwindcss/vite` | `4.3.3` | `MIT` |
| `@tauri-apps/api` | `1.6.0` | `Apache-2.0 OR MIT` |
| `@tauri-apps/cli` | `1.6.3` | `Apache-2.0 OR MIT` |
| `@tauri-apps/cli-darwin-arm64` | `1.6.3` | `MIT` |
| `@tauri-apps/cli-darwin-x64` | `1.6.3` | `MIT` |
| `@tauri-apps/cli-linux-arm-gnueabihf` | `1.6.3` | `MIT` |
| `@tauri-apps/cli-linux-arm64-gnu` | `1.6.3` | `MIT` |
| `@tauri-apps/cli-linux-arm64-musl` | `1.6.3` | `MIT` |
| `@tauri-apps/cli-linux-x64-gnu` | `1.6.3` | `MIT` |
| `@tauri-apps/cli-linux-x64-musl` | `1.6.3` | `MIT` |
| `@tauri-apps/cli-win32-arm64-msvc` | `1.6.3` | `MIT` |
| `@tauri-apps/cli-win32-ia32-msvc` | `1.6.3` | `MIT` |
| `@tauri-apps/cli-win32-x64-msvc` | `1.6.3` | `MIT` |
| `@types/prop-types` | `15.7.15` | `MIT` |
| `@types/react` | `18.3.31` | `MIT` |
| `@types/react-dom` | `18.3.7` | `MIT` |
| `@vitejs/plugin-react` | `6.1.2` | `MIT` |
| `clsx` | `2.1.1` | `MIT` |
| `csstype` | `3.2.3` | `MIT` |
| `detect-libc` | `2.1.2` | `Apache-2.0` |
| `enhanced-resolve` | `5.26.0` | `MIT` |
| `fsevents` | `2.3.3` | `MIT` |
| `graceful-fs` | `4.2.11` | `ISC` |
| `jiti` | `2.7.0` | `MIT` |
| `js-tokens` | `4.0.0` | `MIT` |
| `lightningcss` | `1.32.0` | `MPL-2.0` |
| `lightningcss-android-arm64` | `1.32.0` | `MPL-2.0` |
| `lightningcss-darwin-arm64` | `1.32.0` | `MPL-2.0` |
| `lightningcss-darwin-x64` | `1.32.0` | `MPL-2.0` |
| `lightningcss-freebsd-x64` | `1.32.0` | `MPL-2.0` |
| `lightningcss-linux-arm-gnueabihf` | `1.32.0` | `MPL-2.0` |
| `lightningcss-linux-arm64-gnu` | `1.32.0` | `MPL-2.0` |
| `lightningcss-linux-arm64-musl` | `1.32.0` | `MPL-2.0` |
| `lightningcss-linux-x64-gnu` | `1.32.0` | `MPL-2.0` |
| `lightningcss-linux-x64-musl` | `1.32.0` | `MPL-2.0` |
| `lightningcss-win32-arm64-msvc` | `1.32.0` | `MPL-2.0` |
| `lightningcss-win32-x64-msvc` | `1.32.0` | `MPL-2.0` |
| `loose-envify` | `1.4.0` | `MIT` |
| `lucide-react` | `0.263.1` | `ISC` |
| `magic-string` | `0.30.21` | `MIT` |
| `nanoid` | `3.3.20` | `MIT` |
| `picocolors` | `1.1.1` | `ISC` |
| `picomatch` | `4.0.7` | `MIT` |
| `postcss` | `8.5.30` | `MIT` |
| `react` | `18.3.1` | `MIT` |
| `react-dom` | `18.3.1` | `MIT` |
| `rolldown` | `1.2.14` | `MIT` |
| `scheduler` | `0.23.2` | `MIT` |
| `semver` | `7.8.5` | `ISC` |
| `source-map-js` | `1.2.2` | `BSD-3-Clause` |
| `tailwind-merge` | `1.14.0` | `MIT` |
| `tailwindcss` | `4.3.3` | `MIT` |
| `tapable` | `2.3.3` | `MIT` |
| `tinyglobby` | `0.2.17` | `MIT` |
| `tinyglobby/node_modules/fdir` | `6.5.0` | `MIT` |
| `typescript` | `5.9.3` | `Apache-2.0` |
| `vite` | `8.3.4` | `MIT` |
| `vite/node_modules/lightningcss` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-android-arm64` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-darwin-arm64` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-darwin-x64` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-freebsd-x64` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-linux-arm-gnueabihf` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-linux-arm64-gnu` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-linux-arm64-musl` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-linux-x64-gnu` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-linux-x64-musl` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-win32-arm64-msvc` | `1.33.0` | `MPL-2.0` |
| `vite/node_modules/lightningcss-win32-x64-msvc` | `1.33.0` | `MPL-2.0` |

## Notices for libraries included in client bundles

### React and React DOM

Copyright (c) Facebook, Inc. and its affiliates. Licensed under MIT. The MIT terms are in [LICENSE](LICENSE); this copyright notice applies to React and React DOM, not to Refine's original code.

### Lucide React

Lucide React is licensed under ISC. Portions of Lucide are Copyright (c) Cole Bemis 2013–2022 as part of Feather (MIT); other Lucide copyright is held by Lucide Contributors 2022.

```text
ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### Tailwind CSS

Tailwind CSS is MIT licensed. The project uses it as a stylesheet build dependency. Its generated stylesheet may be included in web and desktop client bundles. The general MIT terms are in [LICENSE](LICENSE); Tailwind's project and copyright notices remain those of Tailwind Labs.

## Model usage

The Qwen3 model's Apache-2.0 license applies to the weights and model materials from the publisher. The Refine MIT license does not replace or expand those model terms. Refine downloads the model separately and does not redistribute the weights in this repository.
