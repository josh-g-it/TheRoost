use std::path::Path;

use crate::models::game::GameSource;

use super::ScannedGame;

/// Default manifest directory for Epic Games Store.
const DEFAULT_MANIFESTS_DIR: &str = r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests";

/// Scan for installed Epic Games Store games by reading JSON manifest files.
pub fn scan() -> Result<Vec<ScannedGame>, String> {
    scan_from(Path::new(DEFAULT_MANIFESTS_DIR))
}

/// Testable variant that accepts a custom manifest directory path.
pub fn scan_from(manifests_dir: &Path) -> Result<Vec<ScannedGame>, String> {
    if !manifests_dir.exists() {
        tracing::debug!("Epic Games manifests directory not found, skipping");
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(manifests_dir)
        .map_err(|e| format!("Cannot read Epic manifests directory: {}", e))?;

    let mut games = Vec::new();

    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !file_name.ends_with(".item") {
            continue;
        }

        let content = match std::fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(file = %file_name, error = %e, "Cannot read Epic manifest");
                continue;
            }
        };

        let manifest: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(file = %file_name, error = %e, "Cannot parse Epic manifest");
                continue;
            }
        };

        // Skip incomplete installs
        if manifest
            .get("bIsIncompleteInstall")
            .and_then(|v| v.as_bool())
            == Some(true)
        {
            continue;
        }

        let display_name = manifest.get("DisplayName").and_then(|v| v.as_str());
        let app_name = manifest.get("AppName").and_then(|v| v.as_str());
        let install_location = manifest.get("InstallLocation").and_then(|v| v.as_str());
        let launch_executable = manifest.get("LaunchExecutable").and_then(|v| v.as_str());

        if let (Some(name), Some(app_id)) = (display_name, app_name) {
            let exe_path = match (install_location, launch_executable) {
                (Some(loc), Some(exe)) => Some(format!("{}\\{}", loc, exe)),
                _ => None,
            };

            games.push(ScannedGame {
                source: GameSource::Epic,
                source_id: app_id.to_string(),
                name: name.to_string(),
                install_path: install_location.map(|s| s.to_string()),
                executable_path: exe_path,
            });
        }
    }

    Ok(games)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_manifest(name: &str, app_name: &str, install_loc: &str, exe: &str) -> String {
        serde_json::json!({
            "FormatVersion": 0,
            "bIsIncompleteInstall": false,
            "AppName": app_name,
            "DisplayName": name,
            "InstallLocation": install_loc,
            "LaunchExecutable": exe,
            "bIsApplication": true
        })
        .to_string()
    }

    #[test]
    fn test_scan_valid_game() {
        let dir = tempfile::tempdir().unwrap();
        let manifest = make_manifest(
            "Fortnite",
            "Fortnite",
            r"C:\Epic\Fortnite",
            "FortniteClient-Win64-Shipping.exe",
        );
        fs::write(dir.path().join("abc123.item"), &manifest).unwrap();

        let games = scan_from(dir.path()).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].name, "Fortnite");
        assert_eq!(games[0].source_id, "Fortnite");
        assert_eq!(games[0].install_path.as_deref(), Some(r"C:\Epic\Fortnite"));
        assert_eq!(
            games[0].executable_path.as_deref(),
            Some(r"C:\Epic\Fortnite\FortniteClient-Win64-Shipping.exe")
        );
    }

    #[test]
    fn test_scan_skips_incomplete_install() {
        let dir = tempfile::tempdir().unwrap();
        let manifest = serde_json::json!({
            "bIsIncompleteInstall": true,
            "AppName": "PartialGame",
            "DisplayName": "Partial Game",
            "InstallLocation": r"C:\Epic\Partial"
        })
        .to_string();
        fs::write(dir.path().join("partial.item"), &manifest).unwrap();

        let games = scan_from(dir.path()).unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn test_scan_skips_malformed_json() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("bad.item"), "not valid json {{{").unwrap();

        let games = scan_from(dir.path()).unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn test_scan_empty_directory() {
        let dir = tempfile::tempdir().unwrap();
        let games = scan_from(dir.path()).unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn test_scan_nonexistent_directory() {
        let games = scan_from(Path::new(r"C:\NonExistent\Path\12345")).unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn test_scan_ignores_non_item_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("readme.txt"), "not a manifest").unwrap();
        fs::write(dir.path().join("data.json"), "{}").unwrap();

        let games = scan_from(dir.path()).unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn test_scan_missing_fields_skipped() {
        let dir = tempfile::tempdir().unwrap();
        // Missing DisplayName
        let manifest = serde_json::json!({
            "AppName": "SomeApp",
            "InstallLocation": r"C:\Epic\Some"
        })
        .to_string();
        fs::write(dir.path().join("noname.item"), &manifest).unwrap();

        let games = scan_from(dir.path()).unwrap();
        assert!(games.is_empty());
    }
}
