// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::path::Path;

use chat_server_backup_lib::loader::load_backup;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("ChatServerBackup {}", env!("CARGO_PKG_VERSION"));
        return;
    }

    if let Some(pos) = args.iter().position(|a| a == "--verify-backup") {
        if let Some(target) = args.get(pos + 1) {
            match load_backup(Path::new(target), true) {
                Ok(b) => {
                    let posts: usize = b.channels.iter().map(|c| c.posts.len()).sum();
                    let msgs: usize = b
                        .channels
                        .iter()
                        .flat_map(|c| c.posts.iter())
                        .map(|p| p.messages.len())
                        .sum();
                    println!(
                        "Verified '{}' ({}): {} channel(s), {} post(s), {} message(s)",
                        b.name,
                        b.date_label,
                        b.channels.len(),
                        posts,
                        msgs
                    );
                    return;
                }
                Err(err) => {
                    eprintln!("Backup verification failed: {err}");
                    std::process::exit(1);
                }
            }
        }
    }

    chat_server_backup_lib::run()
}
