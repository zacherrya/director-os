//! File access for the video editor: importing footage and writing a render.
//!
//! The write path is the interesting one. A render is a few hundred megabytes of
//! MP4 produced in the webview, and the webview must not be able to write
//! wherever it likes — a compromised page with a "write these bytes to this path"
//! command owns the user's home folder. So there is no path argument at all:
//! `pick_export_path` remembers the one location the user just chose in a native
//! save dialog, and `write_export` writes only there, once.
//!
//! The bytes arrive as a raw IPC body rather than JSON, because a JSON array of a
//! few hundred million numbers is not a file format.

use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

/// The single destination the user most recently chose for a render.
#[derive(Default)]
pub struct ExportTarget(pub Mutex<Option<PathBuf>>);

fn applescript_safe(input: &str) -> String {
    input
        .chars()
        .filter(|c| !matches!(c, '"' | '\\' | '\n' | '\r'))
        .take(160)
        .collect()
}

fn run_osascript(script: &str) -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        // -128 is the user pressing Cancel: a choice, not a failure.
        if err.contains("-128") || err.to_lowercase().contains("cancel") {
            return Ok(None);
        }
        return Err(err.trim().to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if text.is_empty() { None } else { Some(text) })
}

/// A native chooser for footage and stills, several at once. An empty list means
/// the user cancelled.
#[tauri::command]
pub fn pick_media(prompt: String) -> Result<Vec<String>, String> {
    let script = format!(
        "set picked to choose file with prompt \"{}\" of type {{\"public.movie\", \"public.image\"}} with multiple selections allowed\n\
         set out to \"\"\n\
         repeat with f in picked\n\
           set out to out & POSIX path of f & linefeed\n\
         end repeat\n\
         return out",
        applescript_safe(&prompt)
    );
    Ok(run_osascript(&script)?
        .map(|s| s.lines().map(str::trim).filter(|l| !l.is_empty()).map(String::from).collect())
        .unwrap_or_default())
}

/// A native save dialog. The chosen path is remembered as the only place the next
/// `write_export` may write.
#[tauri::command]
pub fn pick_export_path(
    target: tauri::State<'_, ExportTarget>,
    suggested_name: String,
) -> Result<Option<String>, String> {
    let name = applescript_safe(&suggested_name);
    let script = format!("POSIX path of (choose file name with prompt \"Save the render\" default name \"{name}\")");
    let chosen = run_osascript(&script)?;
    let mut slot = target.0.lock().map_err(|_| "Export state is unavailable.".to_string())?;
    *slot = chosen.as_ref().map(PathBuf::from);
    Ok(chosen)
}

/// Writes a finished render to the path chosen in the last save dialog, then
/// forgets it — one dialog, one write.
#[tauri::command]
pub fn write_export(target: tauri::State<'_, ExportTarget>, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("The render arrived in the wrong shape.".into());
    };
    if bytes.is_empty() {
        return Err("The render is empty.".into());
    }
    let path = target
        .0
        .lock()
        .map_err(|_| "Export state is unavailable.".to_string())?
        .take()
        .ok_or_else(|| "Choose where to save the render first.".to_string())?;
    std::fs::write(&path, bytes).map_err(|e| format!("Could not write the render: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}
