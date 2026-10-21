PYTHON := .venv/bin/python
LLAMA_MODEL := Qwen/Qwen3-4B-GGUF:Q4_K_M
VERSION := 0.1.0

.PHONY: model-server api mobile-api web extension test desktop-build web-build extension-build ios-project ios-build android-build release
model-server:
	llama-server -hf $(LLAMA_MODEL) --alias qwen3-4b-q4km --host 127.0.0.1 --port 8080 --ctx-size 4096 --parallel 1 --threads 4 --cors-origins http://localhost:8000,http://127.0.0.1:8000,tauri://localhost

api:
	$(PYTHON) -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000

mobile-api:
	@test -n "$${REFINE_MOBILE_TOKEN:-}" || (echo "Set REFINE_MOBILE_TOKEN to a long random value before exposing the API to your phone."; exit 1)
	$(PYTHON) -m uvicorn apps.api.main:app --host 0.0.0.0 --port 8001

ios-project:
	cd apps/ios && xcodegen generate

ios-build: ios-project
	xcodebuild -project apps/ios/Refine.xcodeproj -scheme Refine -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build

android-build:
	cd apps/android && ./gradlew assembleDebug

web:
	cd apps/web && npm run dev

extension:
	cd apps/chrome-extension && npm run build

test:
	$(PYTHON) -m pytest apps/api/tests -q

web-build:
	cd apps/web && npm run build

extension-build:
	cd apps/chrome-extension && npm run build

desktop-build:
	cd apps/desktop && npm run tauri build

release: test web-build extension-build desktop-build
	mkdir -p release
	rm -f release/Refine-Chrome-Extension-$(VERSION).zip release/Refine-Web-Editor-$(VERSION).zip
	cp apps/desktop/src-tauri/target/release/bundle/dmg/Refine_$(VERSION)_aarch64.dmg release/
	cd apps/chrome-extension/dist && zip -qr ../../../release/Refine-Chrome-Extension-$(VERSION).zip .
	cd apps/web/dist && zip -qr ../../../release/Refine-Web-Editor-$(VERSION).zip .
