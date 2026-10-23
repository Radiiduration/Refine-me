import SwiftUI

private enum SharedSettings {
    static let group = "group.com.refine.writing"
    static let apiURL = "apiBaseURL"
    static let token = "mobileToken"
}

@main
struct RefineApp: App {
    var body: some Scene {
        WindowGroup { SettingsView() }
    }
}

struct SettingsView: View {
    @State private var apiURL = UserDefaults(suiteName: SharedSettings.group)?.string(forKey: SharedSettings.apiURL) ?? ""
    @State private var token = TokenStore.load(legacy: UserDefaults(suiteName: SharedSettings.group)?.string(forKey: SharedSettings.token))
    @State private var saved = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://refine.local:8001", text: $apiURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    SecureField("Device token", text: $token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button(saved ? "Saved" : "Save settings") {
                        let store = UserDefaults(suiteName: SharedSettings.group)
                        store?.set(apiURL.trimmingCharacters(in: .whitespacesAndNewlines), forKey: SharedSettings.apiURL)
                        let stored = TokenStore.save(token)
                        store?.removeObject(forKey: SharedSettings.token)
                        saved = stored
                    }
                } header: {
                    Text("Local-first setup")
                } footer: {
                    Text("Refine runs your model on your Mac. Use its private Wi-Fi address and the same REFINE_MOBILE_TOKEN used to start the API. Only selected text is sent to that server over HTTPS.")
                }

                Section("Enable the keyboard") {
                    Label("Open Settings → General → Keyboard → Keyboards", systemImage: "1.circle")
                    Label("Tap Add New Keyboard… → Refine", systemImage: "2.circle")
                    Label("Open Refine Keyboard and turn on Allow Full Access", systemImage: "3.circle")
                }

                Section {
                    Text("Background App Refresh is not required. iOS requires Allow Full Access because the keyboard needs network access to your local Refine server. Refine does not send text to a cloud service.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color(red: 0.969, green: 0.957, blue: 0.933))
            .tint(Color(red: 0.404, green: 0.322, blue: 0.639))
            .navigationTitle("Refine Keyboard")
        }
    }
}
