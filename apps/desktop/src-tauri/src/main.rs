#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use arboard::Clipboard;
use std::{process::Command, thread, time::Duration};
use tauri::{GlobalShortcutManager, LogicalPosition, Manager, PhysicalSize};

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
    let restore = |clipboard: &mut Clipboard, previous: &Option<String>| {
        if let Some(old) = previous {
            let _ = clipboard.set_text(old.clone());
        }
    };
    let output = match output {
        Ok(output) => output,
        Err(_) => {
            restore(&mut clipboard, &previous);
            return Err("Refine could not read the selected text. Allow Refine under System Settings → Privacy & Security → Accessibility.".into());
        }
    };
    if !output.status.success() {
        restore(&mut clipboard, &previous);
        return Err("macOS blocked selection capture. Allow Refine under System Settings → Privacy & Security → Accessibility.".into());
    }
    thread::sleep(Duration::from_millis(140));
    let selected = clipboard
        .get_text()
        .ok()
        .filter(|value| !value.trim().is_empty() && value != &marker);
    restore(&mut clipboard, &previous);
    Ok(selected)
}

#[cfg(not(target_os = "macos"))]
fn selected_text_from_frontmost_app() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(target_os = "macos")]
fn pointer_position() -> Option<(i32, i32)> {
    use std::ffi::c_void;
    #[repr(C)]
    struct CGPoint {
        x: f64,
        y: f64,
    }
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventCreate(source: *const c_void) -> *mut c_void;
        fn CGEventGetLocation(event: *mut c_void) -> CGPoint;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(value: *const c_void);
    }
    unsafe {
        let event = CGEventCreate(std::ptr::null());
        if event.is_null() {
            return None;
        }
        let point = CGEventGetLocation(event);
        CFRelease(event);
        Some((point.x as i32 + 12, point.y as i32 + 12))
    }
}

#[cfg(not(target_os = "macos"))]
fn pointer_position() -> Option<(i32, i32)> {
    None
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            let mut shortcuts = app.global_shortcut_manager();
            shortcuts.register("Control+R", move || {
                let text = match selected_text_from_frontmost_app() {
                    Ok(Some(text)) if !text.trim().is_empty() => text,
                    Ok(_) => return,
                    Err(message) => {
                        if let Some(window) = handle.get_window("overlay") {
                            let _ = window.set_size(PhysicalSize::new(352, 330));
                            let _ = window.show();
                            let _ = window.emit("refine-selection-error", message);
                        }
                        return;
                    }
                };
                if let Some(overlay) = handle.get_window("overlay") {
                    if let Some((x, y)) = pointer_position() {
                        let _ = overlay.set_position(LogicalPosition::new(x as f64, y as f64));
                    }
                    let _ = overlay.set_size(PhysicalSize::new(58, 58));
                    let _ = overlay.show();
                    let _ = overlay.emit("refine-selection", text);
                }
            })?;
            if let Some(window) = app.get_window("main") {
                let app_handle = app.handle();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(window) = app_handle.get_window("main") {
                            let _ = window.hide();
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_clipboard_text,
            copy_text,
            paste_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
