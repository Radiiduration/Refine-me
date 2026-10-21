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
    @State private var token = UserDefaults(suiteName: SharedSettings.group)?.string(forKey: SharedSettings.token) ?? ""
    @State private var saved = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Local Refine server") {
                    TextField("http://192.168.1.20:8001", text: $apiURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    SecureField("Device token", text: $token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button(saved ? "Saved" : "Save settings") {
                        let store = UserDefaults(suiteName: SharedSettings.group)
                        store?.set(apiURL.trimmingCharacters(in: .whitespacesAndNewlines), forKey: SharedSettings.apiURL)
                        store?.set(token, forKey: SharedSettings.token)
                        saved = true
                    }
                } footer: {
                        Text("Use your Mac’s private Wi-Fi address and the same REFINE_MOBILE_TOKEN used to start the API. Refine sends only the selected text to this server, with a goal of making it clear and tactful for work.")
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
            .navigationTitle("Refine Keyboard")
        }
    }
}
