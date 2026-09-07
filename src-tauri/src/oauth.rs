//! Loopback OAuth helper for the YouTube Analytics API.
//!
//! Google retired the out-of-band redirect flow, so a desktop app has to catch
//! the authorization code on a local socket. The sequence is deliberately split
//! into three commands because the redirect URI has to carry the port, and the
//! port isn't known until the socket is bound:
//!
//!   1. `oauth_bind`  — bind 127.0.0.1:0, hand the port back
//!   2. `oauth_open`  — open the consent screen in the real browser
//!   3. `oauth_await` — accept exactly one request and return its `code`
//!
//! Nothing here ever sees the client secret; the token exchange happens in the
//! front end over the normal HTTP plugin.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::State;

/// How long to wait for the user to finish consenting before giving up.
const CONSENT_TIMEOUT: Duration = Duration::from_secs(300);
const POLL_INTERVAL: Duration = Duration::from_millis(200);

#[derive(Default)]
pub struct OauthListener(Mutex<Option<TcpListener>>);

/// Percent-decoding, enough for an authorization code or an error slug.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn page(title: &str, body: &str) -> String {
    let html = format!(
        "<!doctype html><meta charset=\"utf-8\"><title>Director OS</title>\
         <body style=\"margin:0;display:grid;place-items:center;height:100vh;\
         background:#141316;color:#eee8db;font:15px -apple-system,system-ui,sans-serif\">\
         <div style=\"text-align:center;max-width:22rem;padding:2rem\">\
         <div style=\"font-size:20px;margin-bottom:.5rem\">{title}</div>\
         <div style=\"color:#ada79f;line-height:1.6\">{body}</div></div>"
    );
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    )
}

/**
 * Binds the loopback socket.
 *
 * `port` 0 lets the OS choose, which is what Google's loopback flow wants — it
 * accepts any port on 127.0.0.1. Meta does not: its redirect URI has to match a
 * registered string exactly, port included, so that flow asks for a fixed one
 * and has to be told plainly when something else already holds it.
 */
#[tauri::command]
pub fn oauth_bind_on(port: u16, state: State<'_, OauthListener>) -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| {
        if port != 0 {
            format!(
                "Port {port} is already in use, so the sign-in cannot be caught. Quit whatever is using it and try again."
            )
        } else {
            e.to_string()
        }
    })?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?.port();
    *state.0.lock().map_err(|e| e.to_string())? = Some(listener);
    Ok(bound)
}

#[tauri::command]
pub fn oauth_bind(state: State<'_, OauthListener>) -> Result<u16, String> {
    oauth_bind_on(0, state)
}

/// Hosts whose consent screens this is allowed to open. Kept as an explicit list
/// so the command can never become a general "open any URL" primitive.
const CONSENT_HOSTS: [&str; 2] = ["https://accounts.google.com/", "https://www.facebook.com/"];

#[tauri::command]
pub fn oauth_open(url: String) -> Result<(), String> {
    if !CONSENT_HOSTS.iter().any(|h| url.starts_with(h)) {
        return Err("Refusing to open a URL that isn't a known consent screen.".into());
    }
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn oauth_await(state: State<'_, OauthListener>) -> Result<String, String> {
    let listener = state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("No authorization is in progress.")?;

    tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + CONSENT_TIMEOUT;

        loop {
            if Instant::now() > deadline {
                // By far the most common cause is Google refusing the consent
                // screen outright, in which case no redirect is ever sent and
                // the only symptom here is silence.
                return Err(
                    "No response from Google. If you saw \"Access blocked: has not completed the \
                     Google verification process\", add your Google account under Test users on the \
                     OAuth consent screen and make sure the app is in Testing, not production."
                        .to_string(),
                );
            }

            let mut stream = match listener.accept() {
                Ok((s, _)) => s,
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(POLL_INTERVAL);
                    continue;
                }
                Err(e) => return Err(e.to_string()),
            };

            stream.set_read_timeout(Some(Duration::from_secs(5))).ok();

            let mut request_line = String::new();
            if BufReader::new(&stream).read_line(&mut request_line).is_err() {
                continue;
            }

            // "GET /?code=… HTTP/1.1"
            let target = request_line.split_whitespace().nth(1).unwrap_or("");
            let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");

            let mut code: Option<String> = None;
            let mut error: Option<String> = None;
            for pair in query.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    match k {
                        "code" => code = Some(percent_decode(v)),
                        "error" => error = Some(percent_decode(v)),
                        _ => {}
                    }
                }
            }

            // Browsers open speculative connections to a host they're about to
            // hit; anything without a code or error isn't the redirect.
            if code.is_none() && error.is_none() {
                continue;
            }

            let response = if code.is_some() {
                page("Connected", "You can close this tab and go back to Director OS.")
            } else {
                page("Not connected", "Director OS didn't receive permission. You can close this tab.")
            };
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();

            return match (code, error) {
                (Some(c), _) => Ok(c),
                (_, Some(e)) if e == "access_denied" => {
                    Err("You declined the permission request.".to_string())
                }
                (_, Some(e)) => Err(format!("Google returned an error: {e}")),
                _ => unreachable!(),
            };
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
