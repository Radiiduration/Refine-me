#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use arboard::Clipboard;
use std::{process::Command, thread, time::Duration};
use tauri::{GlobalShortcutManager, Manager};

#[tauri::command]
fn get_clipboard_text() -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
fn paste_text(text: String) -> Result<(), String> {
    // 1. Put the refined text on the clipboard
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;

    // 2. Use AppleScript to simulate Cmd+V on macOS
    #[cfg(target_os = "macos")]
    {
        let script = "tell application \"System Events\" to keystroke \"v\" using {command down}";
        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to execute osascript: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        return Err("Native replace is only implemented for macOS in this version.".to_string());
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn selected_text_from_frontmost_app() -> Result<Option<String>, String> {
    // Use a temporary marker so a selection identical to the previous clipboard still works.
    let mut clipboard =
        Clipboard::new().map_err(|_| "Could not access the clipboard.".to_string())?;
    let previous = clipboard.get_text().ok();
    let marker = format!("refine-selection-{}", std::process::id());
    clipboard
        .set_text(marker.clone())
        .map_err(|_| "Could not prepare the selection clipboard.".to_string())?;
    let output = Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\" to keystroke \"c\" using {command down}",
        ])
        .output();
    let output = match output {
        Ok(output) => output,
        Err(_) => {
            if let Some(old) = previous {
                let _ = clipboard.set_text(old);
            }
            return Err("Refine could not send the copy shortcut to the selected app.".to_string());
        }
    };
    if !output.status.success() {
        if let Some(old) = previous {
            let _ = clipboard.set_text(old);
        }
        return Err("macOS blocked selection capture. Allow Refine under System Settings → Privacy & Security → Accessibility, then relaunch Refine.".to_string());
    }
    thread::sleep(Duration::from_millis(180));
    let selected = clipboard
        .get_text()
        .ok()
        .filter(|value| !value.trim().is_empty() && value != &marker);
    if let Some(old) = previous {
        let _ = clipboard.set_text(old);
    }
    Ok(selected)
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
    .setup(|app| {
      let handle = app.handle();
      let mut shortcuts = app.global_shortcut_manager();
      shortcuts.register("Control+R", move || {
        #[cfg(target_os = "macos")]
        let capture = selected_text_from_frontmost_app();
        #[cfg(not(target_os = "macos"))]
        let capture: Result<Option<String>, String> = Ok(None);
        show_main_window(&handle);
        match capture {
          Ok(Some(text)) if !text.trim().is_empty() => { let _ = handle.emit_all("refine-selection", text); }
          Ok(_) => { let _ = handle.emit_all("refine-selection-status", "No selected text was captured. Select text in another app, then press Control+R."); }
          Err(message) => { let _ = handle.emit_all("refine-selection-error", message); }
        }
      })?;
      if let Some(window) = app.get_window("main") {
        let app_handle = app.handle();
        window.on_window_event(move |event| {
          if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Some(window) = app_handle.get_window("main") { let _ = window.hide(); }
          }
        });
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![get_clipboard_text, copy_text, paste_text])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
