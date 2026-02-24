use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::models::game::LocalGameInfo;
use crate::utils::error::AppError;

/// A VDF value can be either a string or a nested section of key-value pairs.
#[derive(Debug, Clone)]
pub enum VdfValue {
    String(String),
    Section(HashMap<String, VdfValue>),
}

impl VdfValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            VdfValue::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_section(&self) -> Option<&HashMap<String, VdfValue>> {
        match self {
            VdfValue::Section(m) => Some(m),
            _ => None,
        }
    }
}

/// Parse a VDF/ACF text file into a HashMap of key-value pairs.
pub fn parse_vdf(content: &str) -> Result<HashMap<String, VdfValue>, AppError> {
    let mut chars = content.chars().peekable();
    parse_section(&mut chars)
}

fn parse_section(
    chars: &mut std::iter::Peekable<std::str::Chars>,
) -> Result<HashMap<String, VdfValue>, AppError> {
    let mut map = HashMap::new();

    loop {
        skip_whitespace(chars);

        match chars.peek() {
            None => break,
            Some('}') => {
                chars.next();
                break;
            }
            Some('"') => {
                let key = parse_quoted_string(chars)?;
                skip_whitespace(chars);

                match chars.peek() {
                    Some('"') => {
                        let value = parse_quoted_string(chars)?;
                        map.insert(key, VdfValue::String(value));
                    }
                    Some('{') => {
                        chars.next();
                        let section = parse_section(chars)?;
                        map.insert(key, VdfValue::Section(section));
                    }
                    other => {
                        return Err(AppError::Parse(format!(
                            "Expected '\"' or '{{' after key \"{}\", got {:?}",
                            key, other
                        )));
                    }
                }
            }
            Some(c) => {
                // Skip comments or unknown tokens
                if *c == '/' {
                    skip_line(chars);
                } else {
                    chars.next();
                }
            }
        }
    }

    Ok(map)
}

fn parse_quoted_string(
    chars: &mut std::iter::Peekable<std::str::Chars>,
) -> Result<String, AppError> {
    // Consume opening quote
    match chars.next() {
        Some('"') => {}
        other => {
            return Err(AppError::Parse(format!("Expected '\"', got {:?}", other)));
        }
    }

    let mut result = String::new();
    loop {
        match chars.next() {
            None => return Err(AppError::Parse("Unterminated string".to_string())),
            Some('"') => break,
            Some('\\') => {
                // Handle escape sequences
                match chars.next() {
                    Some('\\') => result.push('\\'),
                    Some('"') => result.push('"'),
                    Some('n') => result.push('\n'),
                    Some('t') => result.push('\t'),
                    Some(c) => {
                        result.push('\\');
                        result.push(c);
                    }
                    None => return Err(AppError::Parse("Unterminated escape".to_string())),
                }
            }
            Some(c) => result.push(c),
        }
    }

    Ok(result)
}

fn skip_whitespace(chars: &mut std::iter::Peekable<std::str::Chars>) {
    while let Some(c) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
        } else {
            break;
        }
    }
}

fn skip_line(chars: &mut std::iter::Peekable<std::str::Chars>) {
    for c in chars.by_ref() {
        if c == '\n' {
            break;
        }
    }
}

/// Represents a Steam library folder with its path and installed app IDs.
#[derive(Debug, Clone)]
pub struct LibraryFolder {
    pub path: String,
    #[allow(dead_code)]
    pub apps: Vec<u32>,
}

/// Parse libraryfolders.vdf to find all Steam library locations.
pub fn parse_library_folders(steam_path: &str) -> Result<Vec<LibraryFolder>, AppError> {
    // Try both known locations for the file
    let paths = [
        format!("{}\\steamapps\\libraryfolders.vdf", steam_path),
        format!("{}\\config\\libraryfolders.vdf", steam_path),
    ];

    let content = paths
        .iter()
        .find_map(|p| fs::read_to_string(p).ok())
        .ok_or_else(|| {
            AppError::NotFound("libraryfolders.vdf not found in Steam directory".to_string())
        })?;

    let vdf = parse_vdf(&content)?;

    // The root key is "libraryfolders" (case-insensitive check)
    let folders_section = vdf
        .iter()
        .find(|(k, _)| k.to_lowercase() == "libraryfolders")
        .and_then(|(_, v)| v.as_section())
        .ok_or_else(|| AppError::Parse("Missing 'libraryfolders' section in VDF".to_string()))?;

    let mut result = Vec::new();

    for (key, value) in folders_section {
        // Library folders are numbered "0", "1", "2", etc.
        if key.parse::<u32>().is_err() {
            continue;
        }

        if let Some(section) = value.as_section() {
            let path = section
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if path.is_empty() {
                continue;
            }

            let mut apps = Vec::new();
            if let Some(apps_section) = section.get("apps").and_then(|v| v.as_section()) {
                for appid_str in apps_section.keys() {
                    if let Ok(appid) = appid_str.parse::<u32>() {
                        apps.push(appid);
                    }
                }
            }

            result.push(LibraryFolder { path, apps });
        }
    }

    Ok(result)
}

/// Parse a single appmanifest_*.acf file to get game info.
pub fn parse_app_manifest(manifest_path: &Path) -> Result<LocalGameInfo, AppError> {
    let content = fs::read_to_string(manifest_path)?;
    let vdf = parse_vdf(&content)?;

    // The root key is "AppState"
    let app_state = vdf
        .iter()
        .find(|(k, _)| k.to_lowercase() == "appstate")
        .and_then(|(_, v)| v.as_section())
        .ok_or_else(|| AppError::Parse("Missing 'AppState' in manifest".to_string()))?;

    let appid = app_state
        .get("appid")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u32>().ok())
        .ok_or_else(|| AppError::Parse("Missing or invalid appid".to_string()))?;

    let name = app_state
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown Game")
        .to_string();

    let install_dir = app_state
        .get("installdir")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let size_on_disk = app_state
        .get("SizeOnDisk")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    let last_updated = app_state
        .get("LastUpdated")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    Ok(LocalGameInfo {
        appid,
        name,
        install_dir,
        size_on_disk,
        last_updated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_key_value() {
        let input = r#""key" "value""#;
        let result = parse_vdf(input).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result.get("key").unwrap().as_str().unwrap(), "value");
    }

    #[test]
    fn test_multiple_keys() {
        let input = r#"
            "name" "Half-Life 2"
            "appid" "220"
            "installdir" "Half-Life 2"
        "#;
        let result = parse_vdf(input).unwrap();
        assert_eq!(result.len(), 3);
        assert_eq!(result.get("name").unwrap().as_str().unwrap(), "Half-Life 2");
        assert_eq!(result.get("appid").unwrap().as_str().unwrap(), "220");
        assert_eq!(
            result.get("installdir").unwrap().as_str().unwrap(),
            "Half-Life 2"
        );
    }

    #[test]
    fn test_nested_section() {
        let input = r#"
            "outer"
            {
                "inner" "val"
            }
        "#;
        let result = parse_vdf(input).unwrap();
        let outer = result.get("outer").unwrap().as_section().unwrap();
        assert_eq!(outer.get("inner").unwrap().as_str().unwrap(), "val");
    }

    #[test]
    fn test_deeply_nested() {
        let input = r#"
            "level1"
            {
                "level2"
                {
                    "level3"
                    {
                        "deep" "value"
                    }
                }
            }
        "#;
        let result = parse_vdf(input).unwrap();
        let l1 = result.get("level1").unwrap().as_section().unwrap();
        let l2 = l1.get("level2").unwrap().as_section().unwrap();
        let l3 = l2.get("level3").unwrap().as_section().unwrap();
        assert_eq!(l3.get("deep").unwrap().as_str().unwrap(), "value");
    }

    #[test]
    fn test_escape_backslash() {
        let input = r#""path" "C:\\Program Files\\Steam""#;
        let result = parse_vdf(input).unwrap();
        assert_eq!(
            result.get("path").unwrap().as_str().unwrap(),
            "C:\\Program Files\\Steam"
        );
    }

    #[test]
    fn test_escape_quote() {
        let input = r#""msg" "He said \"hello\"""#;
        let result = parse_vdf(input).unwrap();
        assert_eq!(
            result.get("msg").unwrap().as_str().unwrap(),
            "He said \"hello\""
        );
    }

    #[test]
    fn test_escape_newline_tab() {
        let input = r#""text" "line1\nline2\tcol""#;
        let result = parse_vdf(input).unwrap();
        assert_eq!(
            result.get("text").unwrap().as_str().unwrap(),
            "line1\nline2\tcol"
        );
    }

    #[test]
    fn test_unknown_escape() {
        let input = r#""val" "test\xdata""#;
        let result = parse_vdf(input).unwrap();
        assert_eq!(result.get("val").unwrap().as_str().unwrap(), "test\\xdata");
    }

    #[test]
    fn test_comments_skipped() {
        let input = r#"
            // This is a comment
            "key1" "value1"
            // Another comment
            "key2" "value2"
        "#;
        let result = parse_vdf(input).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result.get("key1").unwrap().as_str().unwrap(), "value1");
        assert_eq!(result.get("key2").unwrap().as_str().unwrap(), "value2");
    }

    #[test]
    fn test_real_libraryfolders() {
        let input = r#"
            "libraryfolders"
            {
                "0"
                {
                    "path"      "C:\\Program Files (x86)\\Steam"
                    "label"     ""
                    "apps"
                    {
                        "228980"    "29735269"
                        "620"       "1636614"
                    }
                }
                "1"
                {
                    "path"      "D:\\SteamLibrary"
                    "label"     ""
                    "apps"
                    {
                        "570"       "23681708777"
                        "730"       "32589248082"
                        "1172470"   "67493527879"
                    }
                }
            }
        "#;
        let result = parse_vdf(input).unwrap();
        let folders = result.get("libraryfolders").unwrap().as_section().unwrap();
        assert_eq!(folders.len(), 2);

        let folder0 = folders.get("0").unwrap().as_section().unwrap();
        assert_eq!(
            folder0.get("path").unwrap().as_str().unwrap(),
            "C:\\Program Files (x86)\\Steam"
        );
        let apps0 = folder0.get("apps").unwrap().as_section().unwrap();
        assert_eq!(apps0.len(), 2);
        assert_eq!(apps0.get("228980").unwrap().as_str().unwrap(), "29735269");

        let folder1 = folders.get("1").unwrap().as_section().unwrap();
        assert_eq!(
            folder1.get("path").unwrap().as_str().unwrap(),
            "D:\\SteamLibrary"
        );
        let apps1 = folder1.get("apps").unwrap().as_section().unwrap();
        assert_eq!(apps1.len(), 3);
        assert!(apps1.get("570").is_some());
        assert!(apps1.get("730").is_some());
        assert!(apps1.get("1172470").is_some());
    }

    #[test]
    fn test_real_appmanifest() {
        let input = r#"
            "AppState"
            {
                "appid"         "440"
                "Universe"      "1"
                "name"          "Team Fortress 2"
                "StateFlags"    "4"
                "installdir"    "Team Fortress 2"
                "LastUpdated"   "1696012345"
                "SizeOnDisk"    "23456789012"
                "buildid"       "12345678"
                "LastOwner"     "76561198012345678"
                "BytesToDownload"   "0"
                "BytesDownloaded"   "0"
            }
        "#;
        let result = parse_vdf(input).unwrap();
        let app_state = result.get("AppState").unwrap().as_section().unwrap();
        assert_eq!(app_state.get("appid").unwrap().as_str().unwrap(), "440");
        assert_eq!(
            app_state.get("name").unwrap().as_str().unwrap(),
            "Team Fortress 2"
        );
        assert_eq!(
            app_state.get("installdir").unwrap().as_str().unwrap(),
            "Team Fortress 2"
        );
        assert_eq!(
            app_state.get("SizeOnDisk").unwrap().as_str().unwrap(),
            "23456789012"
        );
        assert_eq!(
            app_state.get("LastUpdated").unwrap().as_str().unwrap(),
            "1696012345"
        );
    }

    #[test]
    fn test_empty_input() {
        let result = parse_vdf("").unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_unterminated_string() {
        let input = r#""key" "unterminated"#;
        let result = parse_vdf(input);
        assert!(result.is_err());
    }

    #[test]
    fn test_vdf_value_as_str() {
        let string_val = VdfValue::String("hello".to_string());
        assert_eq!(string_val.as_str(), Some("hello"));
        assert!(string_val.as_section().is_none());

        let section_val = VdfValue::Section(HashMap::new());
        assert!(section_val.as_str().is_none());
    }

    #[test]
    fn test_vdf_value_as_section() {
        let mut inner = HashMap::new();
        inner.insert("key".to_string(), VdfValue::String("val".to_string()));
        let section_val = VdfValue::Section(inner);
        assert!(section_val.as_section().is_some());
        assert_eq!(
            section_val
                .as_section()
                .unwrap()
                .get("key")
                .unwrap()
                .as_str()
                .unwrap(),
            "val"
        );

        let string_val = VdfValue::String("hello".to_string());
        assert!(string_val.as_section().is_none());
    }
}
