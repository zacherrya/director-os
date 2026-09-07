//! Uploading a finished cut to YouTube.
//!
//! Runs entirely in Rust for one reason: the file. A video serialised across the
//! IPC boundary would be copied into the webview's memory as a JS array first,
//! which is untenable for anything longer than a Short. Here it is streamed off
//! disk straight into the request body, so a two-gigabyte file costs about as
//! much memory as a two-megabyte one.
//!
//! Uses YouTube's resumable protocol — initiate a session, then send the bytes to
//! the URL it hands back. The session is what makes Google's error responses
//! specific enough to act on; a plain multipart POST tends to fail with a bare
//! 400.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tokio_util::io::ReaderStream;

const INITIATE_URL: &str =
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

#[derive(Deserialize)]
pub struct UploadMeta {
    title: String,
    description: String,
    tags: Vec<String>,
    /// One of "private", "unlisted", "public".
    privacy: String,
    /// YouTube requires an explicit answer; there is no safe default it infers.
    made_for_kids: bool,
    /// Mandatory. An upload without it is rejected outright.
    category_id: String,
    /// ISO 8601. Only honoured when `privacy` is "private" on a video that has
    /// never been published — YouTube then publishes it itself at that moment,
    /// with nothing running on this machine.
    publish_at: Option<String>,
}

#[derive(Serialize)]
struct Snippet {
    title: String,
    description: String,
    tags: Vec<String>,
    #[serde(rename = "categoryId")]
    category_id: String,
}

#[derive(Serialize)]
struct Status {
    #[serde(rename = "privacyStatus")]
    privacy_status: String,
    #[serde(rename = "selfDeclaredMadeForKids")]
    self_declared_made_for_kids: bool,
    #[serde(rename = "publishAt", skip_serializing_if = "Option::is_none")]
    publish_at: Option<String>,
}

#[derive(Serialize)]
struct VideoBody {
    snippet: Snippet,
    status: Status,
}

/// Pulls the human-readable half out of Google's error envelope.
fn describe_error(status: u16, body: &str) -> String {
    let parsed: Option<serde_json::Value> = serde_json::from_str(body).ok();
    let reason = parsed
        .as_ref()
        .and_then(|v| v.pointer("/error/errors/0/reason"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let message = parsed
        .as_ref()
        .and_then(|v| v.pointer("/error/message"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match reason {
        "youtubeSignupRequired" => {
            "That Google account has no YouTube channel attached.".to_string()
        }
        "uploadLimitExceeded" => {
            "This channel has hit its upload limit for today. It resets on a rolling 24-hour basis.".to_string()
        }
        "quotaExceeded" => {
            "The daily upload quota for this Google Cloud project is used up. It resets at midnight Pacific.".to_string()
        }
        "forbidden" | "insufficientPermissions" => {
            "The saved Google permission does not cover uploads. Reconnect YouTube in Settings to grant it.".to_string()
        }
        "invalidTitle" => "YouTube rejected the title — check it for < or > characters.".to_string(),
        "invalidCategoryId" | "invalidVideoMetadata" => {
            "YouTube rejected the category for this video.".to_string()
        }
        "invalidPublishAt" => {
            "YouTube rejected the scheduled time — it has to be in the future.".to_string()
        }
        "invalidDescription" => {
            "YouTube rejected the description — check it for < or > characters.".to_string()
        }
        _ if status == 401 => {
            "Google rejected the access token. Reconnect YouTube in Settings.".to_string()
        }
        _ if message.is_empty() => format!("YouTube refused the upload (HTTP {status})."),
        _ => message.to_string(),
    }
}

/// Uploads `file_path` and returns the new video's id.
#[tauri::command]
pub async fn youtube_upload(
    access_token: String,
    file_path: String,
    meta: UploadMeta,
) -> Result<String, String> {
    if !matches!(meta.privacy.as_str(), "private" | "unlisted" | "public") {
        return Err(format!("Unknown privacy setting \"{}\".", meta.privacy));
    }
    if meta.category_id.is_empty() {
        return Err("YouTube requires a category.".into());
    }
    // Scheduling only works on a private video; a mismatch here is silently
    // ignored by YouTube, which would publish immediately instead of waiting.
    if meta.publish_at.is_some() && meta.privacy != "private" {
        return Err("A scheduled video has to be uploaded as private.".into());
    }

    let path = Path::new(&file_path);
    if !path.is_file() {
        return Err("That cut is no longer at the path saved on the episode. Attach it again.".into());
    }
    let size = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
    if size == 0 {
        return Err("That file is empty.".into());
    }

    let client = reqwest::Client::new();

    // 1. Open a resumable session. The metadata goes here; the bytes do not.
    let body = VideoBody {
        snippet: Snippet {
            title: meta.title,
            description: meta.description,
            tags: meta.tags,
            category_id: meta.category_id,
        },
        status: Status {
            privacy_status: meta.privacy,
            self_declared_made_for_kids: meta.made_for_kids,
            publish_at: meta.publish_at,
        },
    };

    let initiate = client
        .post(INITIATE_URL)
        .bearer_auth(&access_token)
        .header("Content-Type", "application/json; charset=UTF-8")
        .header("X-Upload-Content-Length", size.to_string())
        .header("X-Upload-Content-Type", "video/*")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Could not reach YouTube: {e}"))?;

    if !initiate.status().is_success() {
        let status = initiate.status().as_u16();
        let text = initiate.text().await.unwrap_or_default();
        return Err(describe_error(status, &text));
    }

    let session_url = initiate
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .ok_or("YouTube accepted the details but did not open an upload session.")?
        .to_string();

    // 2. Stream the file into the session.
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|e| format!("Could not read that cut: {e}"))?;
    let stream = ReaderStream::new(file);

    let upload = client
        .put(&session_url)
        .bearer_auth(&access_token)
        .header("Content-Type", "video/*")
        .header(reqwest::header::CONTENT_LENGTH, size)
        .body(reqwest::Body::wrap_stream(stream))
        .send()
        .await
        .map_err(|e| format!("The upload was interrupted: {e}"))?;

    let status = upload.status().as_u16();
    let text = upload.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(describe_error(status, &text));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "YouTube returned an unreadable response.")?;
    parsed
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "The upload finished but YouTube did not return a video id.".to_string())
}
