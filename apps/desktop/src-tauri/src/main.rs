#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use arboard::Clipboard;
use std::{process::Command, thread, time::Duration};
use tauri::{
    CustomMenuItem, GlobalShortcutManager, LogicalPosition, LogicalSize, Manager, SystemTray,
    SystemTrayEvent, SystemTrayMenu,
};

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
    if !accessibility_trusted() {
        return Err("Enable the Refine app you opened under System Settings → Privacy & Security → Accessibility, then quit and reopen it.".into());
    }
    Ok(focused_editing_context()
        .and_then(|(_, _, selected)| (!selected.trim().is_empty()).then_some(selected)))
}

#[cfg(not(target_os = "macos"))]
fn selected_text_from_frontmost_app() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(target_os = "macos")]
fn accessibility_trusted() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> u8;
    }
    unsafe { AXIsProcessTrusted() != 0 }
}

#[cfg(not(target_os = "macos"))]
fn accessibility_trusted() -> bool {
    false
}

#[cfg(target_os = "macos")]
fn focused_editing_context() -> Option<(i32, String, String)> {
    use std::ffi::{c_char, c_void, CStr, CString};

    const UTF8_ENCODING: u32 = 0x0800_0100;
    type CfRef = *const c_void;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateSystemWide() -> CfRef;
        fn AXUIElementCopyAttributeValue(
            element: CfRef,
            attribute: CfRef,
            value: *mut CfRef,
        ) -> i32;
        fn AXUIElementGetPid(element: CfRef, pid: *mut i32) -> i32;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            allocator: CfRef,
            value: *const c_char,
            encoding: u32,
        ) -> CfRef;
        fn CFStringGetCString(value: CfRef, buffer: *mut c_char, size: isize, encoding: u32) -> u8;
        fn CFRelease(value: CfRef);
    }

    unsafe fn attribute_string(element: CfRef, name: &str) -> Option<String> {
        let name = CString::new(name).ok()?;
        let attribute = CFStringCreateWithCString(std::ptr::null(), name.as_ptr(), UTF8_ENCODING);
        if attribute.is_null() {
            return None;
        }
        let mut value = std::ptr::null();
        let result = AXUIElementCopyAttributeValue(element, attribute, &mut value);
        CFRelease(attribute);
        if result != 0 || value.is_null() {
            return None;
        }
        let mut buffer = [0 as c_char; 8192];
        let converted = CFStringGetCString(
            value,
            buffer.as_mut_ptr(),
            buffer.len() as isize,
            UTF8_ENCODING,
        ) != 0;
        CFRelease(value);
        if converted {
            Some(
                CStr::from_ptr(buffer.as_ptr())
                    .to_string_lossy()
                    .into_owned(),
            )
        } else {
            None
        }
    }

    unsafe {
        let system = AXUIElementCreateSystemWide();
        if system.is_null() {
            return None;
        }
        let mut focused = std::ptr::null();
        let attribute_name = CString::new("AXFocusedUIElement").ok()?;
        let focused_attribute =
            CFStringCreateWithCString(std::ptr::null(), attribute_name.as_ptr(), UTF8_ENCODING);
        let result = AXUIElementCopyAttributeValue(system, focused_attribute, &mut focused);
        CFRelease(focused_attribute);
        CFRelease(system);
        if result != 0 || focused.is_null() {
            return None;
        }
        let mut pid = 0;
        let pid_ok = AXUIElementGetPid(focused, &mut pid) == 0;
        let role = attribute_string(focused, "AXRole").unwrap_or_default();
        let selected = attribute_string(focused, "AXSelectedText").unwrap_or_default();
        CFRelease(focused);
        pid_ok.then_some((pid, role, selected))
    }
}

#[cfg(not(target_os = "macos"))]
fn focused_editing_context() -> Option<(i32, String, String)> {
    None
}

fn start_text_field_watcher(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    thread::spawn(move || {
        let mut was_active = false;
        let mut previous_text = String::new();
        let mut previous_pid = 0;
        loop {
            thread::sleep(Duration::from_millis(350));
            if !accessibility_trusted() {
                continue;
            }
            let context = focused_editing_context();
            let own_pid = std::process::id() as i32;
            let (is_active, pid, selected) = match context {
                Some((pid, role, selected)) if pid != own_pid => {
                    let editing_role = matches!(
                        role.as_str(),
                        "AXTextField"
                            | "AXTextArea"
                            | "AXTextView"
                            | "AXSearchField"
                            | "AXComboBox"
                    );
                    (editing_role || !selected.trim().is_empty(), pid, selected)
                }
                Some((pid, _, _)) if pid == own_pid => continue,
                _ => (false, 0, String::new()),
            };

            if is_active {
                if !was_active || pid != previous_pid || selected != previous_text {
                    if let Some(overlay) = app.get_window("overlay") {
                        if let Some((x, y)) = pointer_position() {
                            let _ = overlay.set_position(LogicalPosition::new(x as f64, y as f64));
                        }
                        let _ = overlay.set_size(LogicalSize::new(58.0, 58.0));
                        let _ = overlay.show();
                        let _ = overlay.emit("refine-selection", selected.clone());
                    }
                }
                previous_text = selected;
                previous_pid = pid;
            } else if was_active {
                if let Some(overlay) = app.get_window("overlay") {
                    let _ = overlay.hide();
                }
                previous_text.clear();
                previous_pid = 0;
            }
            was_active = is_active;
        }
    });
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
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("open", "Open Refine"))
        .add_item(CustomMenuItem::new("quit", "Quit Refine"));

    tauri::Builder::default()
        .system_tray(
            SystemTray::new()
                .with_icon(tauri::Icon::Rgba {
                    rgba: include_bytes!("../icons/tray.rgba").to_vec(),
                    width: 32,
                    height: 32,
                })
                .with_tooltip("Refine")
                .with_menu_on_left_click(true)
                .with_menu(tray_menu),
        )
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } if id == "open" => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } if id == "quit" => app.exit(0),
            _ => {}
        })
        .setup(|app| {
            let handle = app.handle();
            start_text_field_watcher(handle.clone());
            let mut shortcuts = app.global_shortcut_manager();
            shortcuts.register("Control+R", move || {
                let text = match selected_text_from_frontmost_app() {
                    Ok(Some(text)) if !text.trim().is_empty() => text,
                    Ok(_) => return,
                    Err(message) => {
                        if let Some(window) = handle.get_window("overlay") {
                            let _ = window.set_size(LogicalSize::new(352.0, 330.0));
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
                    let _ = overlay.set_size(LogicalSize::new(58.0, 58.0));
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
