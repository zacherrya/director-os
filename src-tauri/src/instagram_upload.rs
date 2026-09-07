//! Sending a Reel's video bytes to Instagram.
//!
//! Only the binary transfer lives here. Creating the container, polling it and
//! publishing are ordinary JSON calls that belong in the front end where they can
//! be read and changed easily — this exists for the same reason the YouTube one
//! does: a video must not be marshalled across the IPC boundary into the webview.
//!
//! Meta's upload host is not the Graph host, and it does not take a bearer token.
//! `Authorization: OAuth <token>` with `offset` and `file_size` headers is the
//! whole protocol.

use std::path::Path;

use tokio_util::io::ReaderStream;

const UPLOAD_HOST: &str = "https://rupload.facebook.com/ig-api-upload";

fn describe_error(status: u16, body: &str) -> String {
    let parsed: Option<serde_json::Value> = serde_json::from_str(body).ok();
    let message = parsed
        .as_ref()
        .and_then(|v| v.pointer("/error/message"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let subcode = parsed
        .as_ref()
        .and_then(|v| v.pointer("/error/error_subcode"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    match subcode {
        2207026 => "Instagram rejected the video format. Reels want MP4 or MOV, H.264 video and AAC audio.".to_string(),
        _ if status == 401 || status == 403 => {
            "Instagram rejected the access token. Reconnect Instagram in Settings.".to_string()
        }
        _ if message.is_empty() => format!("Instagram refused the upload (HTTP {status})."),
        _ => message.to_string(),
    }
}

/// Streams `file_path` into an already-created media container.
#[tauri::command]
pub async fn instagram_upload_binary(
    access_token: String,
    api_version: String,
    container_id: String,
    file_path: String,
) -> Result<(), String> {
    // The version and container id are interpolated into a URL, so neither is
    // allowed to smuggle a path segment into it.
    if !api_version.chars().all(|c| c.is_ascii_alphanumeric() || c == '.') {
        return Err("Bad API version.".into());
    }
    if !container_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Bad container id.".into());
    }

    let path = Path::new(&file_path);
    if !path.is_file() {
        return Err("That cut is no longer at the path saved on the episode. Attach it again.".into());
    }
    let size = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
    if size == 0 {
        return Err("That file is empty.".into());
    }

    let file = tokio::fs::File::open(path)
        .await
        .map_err(|e| format!("Could not read that cut: {e}"))?;

    let res = reqwest::Client::new()
        .post(format!("{UPLOAD_HOST}/{api_version}/{container_id}"))
        // Not a bearer token — Meta's upload host wants this exact scheme.
        .header("Authorization", format!("OAuth {access_token}"))
        .header("offset", "0")
        .header("file_size", size.to_string())
        .header(reqwest::header::CONTENT_LENGTH, size)
        .body(reqwest::Body::wrap_stream(ReaderStream::new(file)))
        .send()
        .await
        .map_err(|e| format!("The upload was interrupted: {e}"))?;

    let status = res.status().as_u16();
    let text = res.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(describe_error(status, &text));
    }

    // A 200 carrying {"success": false} is Meta's way of failing quietly.
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
        if v.get("success").and_then(|s| s.as_bool()) == Some(false) {
            return Err(describe_error(status, &text));
        }
    }
    Ok(())
}
