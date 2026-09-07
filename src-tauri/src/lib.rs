mod files;
mod oauth;
mod instagram_upload;
mod youtube_upload;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .manage(oauth::OauthListener::default())
    .invoke_handler(tauri::generate_handler![
      oauth::oauth_bind,
      oauth::oauth_bind_on,
      oauth::oauth_open,
      oauth::oauth_await,
      files::pick_file,
      files::reveal_in_finder,
      files::path_exists,
      files::allow_video,
      youtube_upload::youtube_upload,
      instagram_upload::instagram_upload_binary
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
