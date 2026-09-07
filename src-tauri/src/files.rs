//! Attaching a finished cut to the episode it belongs to.
//!
//! Uses the system dialog and Finder rather than pulling in a plugin — the app
//! is macOS-only, and this keeps the surface to two commands that each do one
//! thing.

use std::path::Path;
use std::process::Command;

/// Strips anything that could break out of the AppleScript string literal.
fn applescript_safe(input: &str) -> String {
    input
        .chars()
        .filter(|c| !matches!(c, '"' | '\\' | '\n' | '\r'))
        .take(160)
        .collect()
}

/// Opens a native file chooser. `Ok(None)` means the user cancelled, which is a
/// normal outcome rather than an error.
///
/// `default_dir` just positions the dialog — usually the folder the last cut for
/// this project came from, so the second attachment is one click instead of a
/// navigation.
#[tauri::command]
pub fn pick_file(prompt: String, default_dir: Option<String>) -> Result<Option<String>, String> {
    let safe_prompt = applescript_safe(&prompt);

    let location = default_dir
        .filter(|d| Path::new(d).is_dir())
        .map(|d| format!(" default location (POSIX file \"{}\")", applescript_safe(&d)))
        .unwrap_or_default();

    let script = format!("POSIX path of (choose file with prompt \"{safe_prompt}\"{location})");
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        // Cancelling is error -128; treat it as "no choice made", not a failure.
        if err.contains("-128") || err.to_lowercase().contains("cancel") {
            return Ok(None);
        }
        return Err(err.trim().to_string());
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Ok(None);
    }
    Ok(Some(path))
}

/// Shows a file in Finder, selected but not opened.
///
/// `open -R` on purpose rather than plain `open`: revealing a file is what you
/// want before uploading it, and it also means this command can never launch an
/// application or hand a file to whatever app claims its extension.
#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err("That file has moved or been deleted. Attach it again.".into());
    }
    Command::new("open")
        .arg("-R")
        .arg(target)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Whether an attached cut is still where it was, so the UI can flag a broken link.
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Lets the webview load one specific file through the asset protocol.
///
/// The static scope in `tauri.conf.json` is empty on purpose: rather than
/// granting the front end blanket read access to the disk, each attached cut is
/// allowed individually, at the moment it is about to be shown. Scope grants are
/// per-session, so this is called again on every load.
#[tauri::command]
pub fn allow_video(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri::Manager;

    let target = Path::new(&path);
    if !target.is_file() {
        return Err("That cut is no longer where the episode says it is.".into());
    }
    app.asset_protocol_scope()
        .allow_file(target)
        .map_err(|e| e.to_string())
}
