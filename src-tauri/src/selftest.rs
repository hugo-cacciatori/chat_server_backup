//! Standalone release checks behind `--self-test` (SPEC §6.4, AGENTS.md rule 9).
//! Each check is a pure function so `cargo test` can exercise it without a release build.

use std::path::Path;

const DEV_SERVER_MARKERS: [&str; 2] = ["localhost:1420", "127.0.0.1:1420"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckResult {
    pub name: &'static str,
    pub passed: bool,
    pub detail: String,
}

impl CheckResult {
    pub fn new(name: &'static str, passed: bool, detail: impl Into<String>) -> Self {
        Self {
            name,
            passed,
            detail: detail.into(),
        }
    }

    pub fn report_line(&self) -> String {
        let verdict = if self.passed { "PASS" } else { "FAIL" };
        format!("{verdict} {}: {}", self.name, self.detail)
    }
}

/// Every `"/assets/<file>"` the page references through `src="…"` or `href="…"`.
pub fn referenced_assets(index_html: &str) -> Vec<String> {
    let mut refs = Vec::new();
    for quote in ['"', '\''] {
        let opener = format!("{quote}/assets/");
        let mut rest = index_html;
        while let Some(start) = rest.find(&opener) {
            let after = &rest[start + 1..];
            let Some(end) = after.find(quote) else { break };
            refs.push(after[1..end].to_string());
            rest = &after[end..];
        }
    }
    refs.sort();
    refs.dedup();
    refs
}

/// `get_asset` takes a path relative to the frontend root, e.g. `index.html` or `assets/index-x.js`.
pub fn check_embedded_ui(get_asset: impl Fn(&str) -> Option<Vec<u8>>) -> Vec<CheckResult> {
    let Some(index_bytes) = get_asset("index.html") else {
        return vec![CheckResult::new(
            "embedded index.html",
            false,
            "index.html is not embedded in the executable",
        )];
    };
    let index_html = String::from_utf8_lossy(&index_bytes);
    let mut results = vec![CheckResult::new(
        "embedded index.html",
        true,
        format!("{} bytes", index_bytes.len()),
    )];

    let dev_marker = DEV_SERVER_MARKERS
        .iter()
        .find(|marker| index_html.contains(*marker));
    results.push(CheckResult::new(
        "no dev server reference",
        dev_marker.is_none(),
        match dev_marker {
            Some(marker) => format!("index.html references {marker}"),
            None => "index.html loads only embedded files".to_string(),
        },
    ));

    let refs = referenced_assets(&index_html);
    let missing: Vec<&String> = refs.iter().filter(|r| get_asset(r).is_none()).collect();
    results.push(CheckResult::new(
        "referenced assets embedded",
        !refs.is_empty() && missing.is_empty(),
        if refs.is_empty() {
            "index.html references no /assets/ files".to_string()
        } else if missing.is_empty() {
            format!("{} file(s): {}", refs.len(), refs.join(", "))
        } else {
            format!(
                "missing: {}",
                missing
                    .iter()
                    .map(|s| s.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        },
    ));
    results
}

pub fn check_default_paths(
    exe_dir: &Path,
    history_dir: &Path,
    settings_file: &Path,
    local_app_data: Option<&Path>,
) -> Vec<CheckResult> {
    let expected_history = exe_dir.join("history");
    let settings_root = local_app_data
        .unwrap_or(exe_dir)
        .join("ChatServerBackup");
    vec![
        CheckResult::new(
            "default backup folder",
            history_dir == expected_history,
            format!(
                "{} (expected {})",
                history_dir.display(),
                expected_history.display()
            ),
        ),
        CheckResult::new(
            "settings file location",
            settings_file.is_absolute() && settings_file.starts_with(&settings_root),
            format!(
                "{} (expected under {})",
                settings_file.display(),
                settings_root.display()
            ),
        ),
    ]
}

pub fn check_bot_script(script: &str) -> CheckResult {
    let ok = script.contains("CHAT_BACKUP_BOT_TOKEN") && script.contains("[EXPORT_COMPLETE]");
    CheckResult::new(
        "embedded export bot",
        ok,
        format!("{} bytes", script.len()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::path::PathBuf;

    const INDEX: &str = r#"<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-AbC123.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-XyZ789.css">
</head><body><div id="root"></div></body></html>"#;

    fn store(files: &[(&str, &str)]) -> HashMap<String, Vec<u8>> {
        files
            .iter()
            .map(|(k, v)| (k.to_string(), v.as_bytes().to_vec()))
            .collect()
    }

    #[test]
    fn finds_script_and_stylesheet_references() {
        assert_eq!(
            referenced_assets(INDEX),
            vec!["assets/index-AbC123.js", "assets/index-XyZ789.css"]
        );
    }

    #[test]
    fn embedded_ui_passes_when_every_reference_is_present() {
        let files = store(&[
            ("index.html", INDEX),
            ("assets/index-AbC123.js", "js"),
            ("assets/index-XyZ789.css", "css"),
        ]);
        let results = check_embedded_ui(|p| files.get(p).cloned());
        assert!(results.iter().all(|r| r.passed), "{results:?}");
    }

    #[test]
    fn embedded_ui_fails_on_missing_asset_dev_server_or_no_index() {
        let files = store(&[("index.html", INDEX), ("assets/index-AbC123.js", "js")]);
        let results = check_embedded_ui(|p| files.get(p).cloned());
        let missing = results.iter().find(|r| r.name == "referenced assets embedded").unwrap();
        assert!(!missing.passed);
        assert!(missing.detail.contains("index-XyZ789.css"));

        let dev = store(&[(
            "index.html",
            r#"<script src="http://localhost:1420/src/main.tsx"></script>"#,
        )]);
        let results = check_embedded_ui(|p| dev.get(p).cloned());
        assert!(results.iter().any(|r| r.name == "no dev server reference" && !r.passed));
        assert!(results.iter().any(|r| r.name == "referenced assets embedded" && !r.passed));

        let empty: HashMap<String, Vec<u8>> = HashMap::new();
        let results = check_embedded_ui(|p| empty.get(p).cloned());
        assert_eq!(results.len(), 1);
        assert!(!results[0].passed);
    }

    #[test]
    fn default_paths_must_sit_beside_exe_or_under_local_app_data() {
        let exe_dir = PathBuf::from(r"C:\Temp\csb-selftest");
        let lad = PathBuf::from(r"C:\Users\u\AppData\Local");
        let settings = lad.join("ChatServerBackup").join("settings.json");

        let ok = check_default_paths(&exe_dir, &exe_dir.join("history"), &settings, Some(&lad));
        assert!(ok.iter().all(|r| r.passed), "{ok:?}");

        let cwd_history = check_default_paths(
            &exe_dir,
            Path::new("history"),
            &settings,
            Some(&lad),
        );
        assert!(!cwd_history[0].passed);

        let relative_settings = check_default_paths(
            &exe_dir,
            &exe_dir.join("history"),
            Path::new(r"ChatServerBackup\settings.json"),
            None,
        );
        assert!(!relative_settings[1].passed);
    }

    #[test]
    fn report_lines_start_with_verdict() {
        assert_eq!(
            CheckResult::new("x", true, "fine").report_line(),
            "PASS x: fine"
        );
        assert_eq!(
            CheckResult::new("y", false, "broken").report_line(),
            "FAIL y: broken"
        );
    }
}
