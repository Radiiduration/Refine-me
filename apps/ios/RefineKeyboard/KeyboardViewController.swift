import UIKit

private enum SharedSettings {
    static let group = "group.com.refine.writing"
    static let apiURL = "apiBaseURL"
    static let token = "mobileToken"
}

final class KeyboardViewController: UIInputViewController {
    private let statusLabel = UILabel()
    private let refineButton = UIButton(type: .system)
    private let retryButton = UIButton(type: .system)
    private var upperCase = false
    private var numberMode = false
    private var isWorking = false
    private var pendingSource: String?
    private var pendingRewrite: String?
    private var letterButtons: [UIButton] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.91, green: 0.92, blue: 0.95, alpha: 1)
        buildKeyboard()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        updateAccessStatus()
    }

    private func buildKeyboard() {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 5),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -5),
            stack.topAnchor.constraint(equalTo: view.topAnchor, constant: 6),
            stack.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -8)
        ])

        let toolbar = UIStackView()
        toolbar.axis = .horizontal
        toolbar.alignment = .center
        toolbar.spacing = 10
        refineButton.configuration = .filled()
        refineButton.configuration?.title = "✦  Refine"
        refineButton.configuration?.cornerStyle = .capsule
        refineButton.configuration?.baseBackgroundColor = UIColor(red: 0.02, green: 0.48, blue: 0.36, alpha: 1)
        refineButton.configuration?.baseForegroundColor = .white
        refineButton.addTarget(self, action: #selector(refineSelection), for: .touchUpInside)
        refineButton.setContentHuggingPriority(.required, for: .horizontal)

        retryButton.configuration = .tinted()
        retryButton.configuration?.title = "↻"
        retryButton.configuration?.cornerStyle = .capsule
        retryButton.configuration?.baseForegroundColor = UIColor(red: 0.02, green: 0.48, blue: 0.36, alpha: 1)
        retryButton.accessibilityLabel = "Try another rewrite"
        retryButton.addTarget(self, action: #selector(retryRewrite), for: .touchUpInside)
        retryButton.isHidden = pendingRewrite == nil
        retryButton.widthAnchor.constraint(equalToConstant: 38).isActive = true

        statusLabel.font = .systemFont(ofSize: 11)
        statusLabel.textColor = .secondaryLabel
        statusLabel.text = pendingRewrite ?? "Select text, then tap Refine"
        statusLabel.numberOfLines = 2
        statusLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        toolbar.addArrangedSubview(refineButton)
        toolbar.addArrangedSubview(retryButton)
        toolbar.addArrangedSubview(statusLabel)
        stack.addArrangedSubview(toolbar)
        toolbar.heightAnchor.constraint(equalToConstant: 52).isActive = true

        let letterRows = numberMode
            ? [Array("1234567890"), Array("@#$&*()-+")]
            : [Array("qwertyuiop"), Array("asdfghjkl")]
        for (index, letters) in letterRows.enumerated() {
            let row = UIStackView()
            row.axis = .horizontal
            row.spacing = 4
            row.distribution = .fillEqually
            if index == 1 && !numberMode {
                row.layoutMargins = UIEdgeInsets(top: 0, left: 17, bottom: 0, right: 17)
                row.isLayoutMarginsRelativeArrangement = true
            }
            let buttons = letters.map { makeKey(upperCase ? String($0).uppercased() : String($0), action: #selector(letterPressed(_:))) }
            buttons.forEach { row.addArrangedSubview($0) }
            if !numberMode { letterButtons.append(contentsOf: buttons) }
            stack.addArrangedSubview(row)
            row.heightAnchor.constraint(equalToConstant: 43).isActive = true
        }

        let commandRow = UIStackView()
        commandRow.axis = .horizontal
        commandRow.spacing = 4
        commandRow.distribution = .fill
        let shift = makeKey(numberMode ? "ABC" : "⇧", action: #selector(toggleMode))
        shift.widthAnchor.constraint(equalToConstant: 48).isActive = true
        commandRow.addArrangedSubview(shift)
        if !numberMode {
            let thirdRow = Array("zxcvbnm").map { makeKey(upperCase ? String($0).uppercased() : String($0), action: #selector(letterPressed(_:))) }
            letterButtons.append(contentsOf: thirdRow)
            thirdRow.forEach { commandRow.addArrangedSubview($0) }
        } else {
            [".", ",", "?", "!"].forEach { symbol in
                commandRow.addArrangedSubview(makeKey(symbol, action: #selector(symbolPressed(_:))))
            }
        }
        let delete = makeKey("⌫", action: #selector(deletePressed))
        delete.widthAnchor.constraint(equalToConstant: 48).isActive = true
        commandRow.addArrangedSubview(delete)
        stack.addArrangedSubview(commandRow)
        commandRow.heightAnchor.constraint(equalToConstant: 43).isActive = true

        let bottom = UIStackView()
        bottom.axis = .horizontal
        bottom.spacing = 4
        let mode = makeKey(numberMode ? "ABC" : "123", action: #selector(toggleNumberMode))
        mode.widthAnchor.constraint(equalToConstant: 52).isActive = true
        let globe = makeKey("🌐", action: #selector(nextKeyboard))
        globe.widthAnchor.constraint(equalToConstant: 42).isActive = true
        let space = makeKey("space", action: #selector(spacePressed))
        space.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let enter = makeKey("return", action: #selector(returnPressed))
        enter.widthAnchor.constraint(equalToConstant: 66).isActive = true
        [mode, globe, space, enter].forEach { bottom.addArrangedSubview($0) }
        stack.addArrangedSubview(bottom)
        bottom.heightAnchor.constraint(equalToConstant: 43).isActive = true
    }

    private func makeKey(_ title: String, action: Selector) -> UIButton {
        let button = UIButton(type: .system)
        var config = UIButton.Configuration.filled()
        config.title = title
        config.cornerStyle = .small
        config.baseBackgroundColor = title == "space" ? UIColor(white: 1, alpha: 0.88) : .white
        config.baseForegroundColor = .label
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var updated = attributes
            updated.font = .systemFont(ofSize: title.count > 1 ? 14 : 21)
            return updated
        }
        button.configuration = config
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    private func updateAccessStatus() {
        guard hasFullAccess else {
            statusLabel.text = "Enable Allow Full Access in Settings"
            refineButton.isEnabled = false
            retryButton.isEnabled = false
            return
        }
        refineButton.isEnabled = true
        retryButton.isEnabled = true
        if let pendingRewrite {
            statusLabel.text = pendingRewrite
            refineButton.configuration?.title = "Insert"
            retryButton.isHidden = false
        } else {
            statusLabel.text = "Select text, then tap Refine"
            refineButton.configuration?.title = "✦  Refine"
            retryButton.isHidden = true
        }
    }

    @objc private func letterPressed(_ sender: UIButton) {
        guard let title = sender.configuration?.title else { return }
        textDocumentProxy.insertText(upperCase ? title.uppercased() : title)
        if upperCase { upperCase = false; updateLetterTitles() }
    }

    @objc private func symbolPressed(_ sender: UIButton) {
        if let title = sender.configuration?.title { textDocumentProxy.insertText(title) }
    }

    @objc private func spacePressed() { textDocumentProxy.insertText(" ") }
    @objc private func returnPressed() { textDocumentProxy.insertText("\n") }
    @objc private func deletePressed() { textDocumentProxy.deleteBackward() }
    @objc private func nextKeyboard() { advanceToNextInputMode() }

    @objc private func toggleMode() {
        if numberMode { numberMode = false; rebuild() }
        else { upperCase.toggle(); updateLetterTitles() }
    }

    @objc private func toggleNumberMode() {
        numberMode.toggle()
        upperCase = false
        rebuild()
    }

    private func rebuild() {
        view.subviews.forEach { $0.removeFromSuperview() }
        letterButtons.removeAll()
        buildKeyboard()
        updateAccessStatus()
    }

    private func updateLetterTitles() {
        let letters = Array(upperCase ? "QWERTYUIOPASDFGHJKLZXCVBNM" : "qwertyuiopasdfghjklzxcvbnm")
        for (index, button) in letterButtons.enumerated() where index < letters.count {
            button.configuration?.title = String(letters[index])
        }
    }

    @objc private func refineSelection() {
        guard !isWorking else { return }
        guard hasFullAccess else { statusLabel.text = "Enable Allow Full Access in Settings"; return }
        if let pendingSource, let pendingRewrite {
            guard textDocumentProxy.selectedText == pendingSource else {
                statusLabel.text = "Select the original text to insert this version"
                return
            }
            textDocumentProxy.insertText(pendingRewrite)
            self.pendingSource = nil
            self.pendingRewrite = nil
            statusLabel.text = "Draft updated"
            refineButton.configuration?.title = "✦  Refine"
            retryButton.isHidden = true
            return
        }
        guard let selected = textDocumentProxy.selectedText, !selected.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            statusLabel.text = "Select text in the field first"
            return
        }
        pendingSource = selected
        Task { await rewrite(selected) }
    }

    @objc private func retryRewrite() {
        guard !isWorking, let source = pendingSource else { return }
        Task { await rewrite(source) }
    }

    @MainActor
    private func rewrite(_ selected: String) async {
        guard let store = UserDefaults(suiteName: SharedSettings.group),
              let configured = store.string(forKey: SharedSettings.apiURL),
              let url = URL(string: configured.trimmingCharacters(in: .whitespacesAndNewlines) + "/rewrite"),
              isPrivateEndpoint(url),
              let token = store.string(forKey: SharedSettings.token), !token.isEmpty else {
            statusLabel.text = "Set a private API URL and token in Refine"
            return
        }

        isWorking = true
        refineButton.isEnabled = false
        retryButton.isEnabled = false
        statusLabel.text = "Rewriting locally…"
        defer {
            isWorking = false
            refineButton.isEnabled = true
            retryButton.isEnabled = true
        }

        do {
            var request = URLRequest(url: url, timeoutInterval: 120)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(token, forHTTPHeaderField: "X-Refine-Token")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "text": selected,
                "tone": "kind",
                "answers": [
                    "audience": "a colleague or work contact",
                    "goal": "Rewrite this as a clear, tactful workplace message."
                ],
                "seed": Int.random(in: 0...99_999)
            ])
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                let message = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["detail"]
                throw KeyboardError.server(message ?? "Refine API returned an error")
            }
            let output = dataSSEText(data)
            guard !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw KeyboardError.empty }
            pendingSource = selected
            pendingRewrite = output
            refineButton.configuration?.title = "Insert"
            retryButton.isHidden = false
            statusLabel.text = output
        } catch {
            statusLabel.text = error.localizedDescription
        }
    }

    private func isPrivateEndpoint(_ url: URL) -> Bool {
        guard url.scheme == "http" || url.scheme == "https", let host = url.host?.lowercased() else { return false }
        if host == "localhost" || host.hasSuffix(".local") { return true }
        let parts = host.split(separator: ".").compactMap { UInt8($0) }
        guard parts.count == 4 else { return false }
        return parts[0] == 10 || parts[0] == 192 && parts[1] == 168 || parts[0] == 172 && (16...31).contains(parts[1])
    }

    private func dataSSEText(_ data: Data) -> String {
        guard let body = String(data: data, encoding: .utf8) else { return "" }
        return body.components(separatedBy: "\n\n").compactMap { event -> String? in
            guard event.hasPrefix("data: ") else { return nil }
            let chunk = String(event.dropFirst(6))
            return chunk == "[DONE]" ? nil : chunk.replacingOccurrences(of: "\\n", with: "\n")
        }.joined()
    }
}

private enum KeyboardError: LocalizedError {
    case server(String)
    case empty
    var errorDescription: String? {
        switch self {
        case .server(let message): return message
        case .empty: return "No paraphrase returned"
        }
    }
}
