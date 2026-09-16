use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenResult {
    Opened { terminal: String },
    NoMatch { reason: String },
}

pub fn open_for_pid(pid: u32, cwd: Option<&str>) -> OpenResult {
    let cwd = cwd
        .map(str::to_string)
        .or_else(|| resolve_cwd_via_lsof(pid));

    if let Some(OpenResult::Opened { terminal }) = try_orca(cwd.as_deref()) {
        return OpenResult::Opened { terminal };
    }

    let tty = resolve_tty(pid);
    if let Some(tty) = tty.as_ref().and_then(|p| p.to_str()) {
        if let Some(OpenResult::Opened { terminal }) = try_by_tty(tty) {
            return OpenResult::Opened { terminal };
        }
    }

    let tty_str = tty
        .as_ref()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "none".into());
    let cwd_str = cwd.as_deref().unwrap_or("none");
    OpenResult::NoMatch {
        reason: format!("no terminal matched (tty={tty_str}, cwd={cwd_str})"),
    }
}

fn resolve_cwd_via_lsof(pid: u32) -> Option<String> {
    let out = Command::new("/usr/sbin/lsof")
        .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-F", "n"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        if let Some(rest) = line.strip_prefix('n') {
            let path = rest.trim();
            if !path.is_empty() && path != "/" {
                return Some(path.to_string());
            }
        }
    }
    None
}

fn try_orca(cwd: Option<&str>) -> Option<OpenResult> {
    if which("orca").is_none() {
        return None;
    }
    let output = Command::new("orca")
        .args(["terminal", "list", "--json"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let body = String::from_utf8_lossy(&output.stdout);
    let parsed: OrcaListResponse = match serde_json::from_str(&body) {
        Ok(p) => p,
        Err(_) => return None,
    };

    let candidates = parsed
        .result
        .terminals
        .into_iter()
        .filter(|t| !t.orphaned && t.connected)
        .filter(|t| match cwd {
            Some(c) => t
                .worktree_path
                .as_deref()
                .map(|wt| cwd_inside(c, wt))
                .unwrap_or(false),
            None => true,
        })
        .collect::<Vec<_>>();

    if candidates.is_empty() {
        return Some(OpenResult::NoMatch {
            reason: format!(
                "no Orca terminal for cwd={}",
                cwd.unwrap_or("(unknown)")
            ),
        });
    }

    let mut best = candidates.into_iter().max_by_key(|t| t.last_output_at)?;
    let title = best
        .title
        .clone()
        .unwrap_or_else(|| "Orca terminal".into());

    let switch = Command::new("orca")
        .args(["terminal", "switch", "--terminal", &best.handle, "--json"])
        .output()
        .ok();
    match switch {
        Some(out) if out.status.success() => Some(OpenResult::Opened {
            terminal: format!("Orca · {title}"),
        }),
        Some(out) => {
            let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            best.worktree_path = None;
            Some(OpenResult::NoMatch {
                reason: format!("orca switch failed: {err}"),
            })
        }
        None => Some(OpenResult::NoMatch {
            reason: "failed to invoke orca terminal switch".into(),
        }),
    }
}

fn try_by_tty(tty: &str) -> Option<OpenResult> {
    if let Some(result) = try_iterm2(tty) {
        return Some(result);
    }
    if let Some(result) = try_wezterm(tty) {
        return Some(result);
    }
    if let Some(result) = try_kitty(tty) {
        return Some(result);
    }
    None
}

fn try_iterm2(tty: &str) -> Option<OpenResult> {
    if !has_app("iTerm") {
        return None;
    }
    let script = format!(
        r#"tell application "iTerm2"
  set targetTty to "{}"
  set matched to missing value
  repeat with w in windows
    repeat with s in sessions of w
      if tty of s is targetTty then
        set matched to s
        select s
        exit repeat
      end if
    end repeat
    if matched is not missing value then exit repeat
  end repeat
  activate
end tell"#,
        tty
    );
    let out = Command::new("osascript").args(["-e", &script]).output().ok()?;
    if out.status.success() {
        Some(OpenResult::Opened {
            terminal: "iTerm2".into(),
        })
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Some(OpenResult::NoMatch {
            reason: format!("iTerm2: {stderr}"),
        })
    }
}

fn try_wezterm(tty: &str) -> Option<OpenResult> {
    let wez = which("wezterm")?;
    let list = Command::new(&wez)
        .args(["cli", "list", "--format", "json"])
        .output()
        .ok()?;
    if !list.status.success() {
        return None;
    }
    let panes: Vec<WezPane> = match serde_json::from_slice(&list.stdout) {
        Ok(v) => v,
        Err(_) => return None,
    };
    let pane = panes
        .into_iter()
        .find(|p| p.tty.as_deref() == Some(tty) || p.tty_name.as_deref() == Some(tty))?;
    let activate = Command::new(&wez)
        .args(["cli", "activate", "--pane-id", &pane.pane_id.to_string()])
        .output()
        .ok()?;
    if activate.status.success() {
        Some(OpenResult::Opened {
            terminal: "WezTerm".into(),
        })
    } else {
        Some(OpenResult::NoMatch {
            reason: "wezterm activate failed".into(),
        })
    }
}

fn try_kitty(tty: &str) -> Option<OpenResult> {
    let kitty = which("kitty")?;
    let ls = Command::new(&kitty)
        .args(["@", "ls"])
        .output()
        .ok()?;
    if !ls.status.success() {
        return None;
    }
    let parsed: Vec<KittyOsWindow> = match serde_json::from_slice(&ls.stdout) {
        Ok(v) => v,
        Err(_) => return None,
    };
    let mut target: Option<u32> = None;
    for w in &parsed {
        for tab in &w.tabs {
            for pane in &tab.panes {
                if pane.tty.as_deref() == Some(tty) {
                    target = Some(w.id);
                    break;
                }
            }
            if target.is_some() {
                break;
            }
        }
        if target.is_some() {
            break;
        }
    }
    let id = target?;
    let focus = Command::new(&kitty)
        .args(["@", "focus-window", "--match", &format!("id:{id}")])
        .output()
        .ok()?;
    if focus.status.success() {
        Some(OpenResult::Opened {
            terminal: "kitty".into(),
        })
    } else {
        Some(OpenResult::NoMatch {
            reason: "kitty focus-window failed".into(),
        })
    }
}

fn resolve_tty(pid: u32) -> Option<PathBuf> {
    let out = Command::new("ps")
        .args(["-o", "tty=", "-p", &pid.to_string()])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    parse_tty(&raw)
}

fn parse_tty(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "?" || trimmed.starts_with("??") {
        return None;
    }
    if trimmed.starts_with('/') {
        return Some(PathBuf::from(trimmed));
    }
    Some(PathBuf::from(format!("/dev/{trimmed}")))
}

fn which(cmd: &str) -> Option<PathBuf> {
    let out = Command::new("/usr/bin/which").arg(cmd).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(PathBuf::from(path))
    }
}

#[cfg(target_os = "macos")]
fn has_app(name: &str) -> bool {
    Command::new("/usr/bin/mdfind")
        .args(["-count", &format!("kMDItemKind=='{name}'")])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
fn has_app(_name: &str) -> bool {
    false
}

#[derive(serde::Deserialize)]
struct OrcaListResponse {
    result: OrcaListResult,
}

#[derive(serde::Deserialize)]
struct OrcaListResult {
    terminals: Vec<OrcaTerminal>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrcaTerminal {
    handle: String,
    #[serde(default)]
    orphaned: bool,
    #[serde(default)]
    connected: bool,
    #[serde(default)]
    worktree_path: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    last_output_at: i64,
}

fn cwd_inside(cwd: &str, worktree: &str) -> bool {
    if cwd == worktree {
        return true;
    }
    let prefix = worktree.strip_suffix('/').unwrap_or(worktree);
    cwd.starts_with(prefix) && cwd.as_bytes().get(prefix.len()) == Some(&b'/')
}

#[derive(serde::Deserialize)]
struct WezPane {
    pane_id: u64,
    #[serde(default)]
    tty: Option<String>,
    #[serde(default)]
    tty_name: Option<String>,
}

#[derive(serde::Deserialize)]
struct KittyOsWindow {
    id: u32,
    tabs: Vec<KittyTab>,
}

#[derive(serde::Deserialize)]
struct KittyTab {
    panes: Vec<KittyPane>,
}

#[derive(serde::Deserialize)]
struct KittyPane {
    #[serde(default)]
    tty: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_BASE: &str = "/Users/test/dev/project";

    #[test]
    fn parse_tty_short_name() {
        assert_eq!(parse_tty("ttys003\n"), Some(PathBuf::from("/dev/ttys003")));
    }

    #[test]
    fn parse_tty_absolute_path() {
        assert_eq!(
            parse_tty("/dev/ttys007\n"),
            Some(PathBuf::from("/dev/ttys007"))
        );
    }

    #[test]
    fn parse_tty_pts() {
        assert_eq!(parse_tty("pts/5\n"), Some(PathBuf::from("/dev/pts/5")));
    }

    #[test]
    fn parse_tty_empty_or_question_mark() {
        assert_eq!(parse_tty("?\n"), None);
        assert_eq!(parse_tty("??\n"), None);
        assert_eq!(parse_tty("\n"), None);
        assert_eq!(parse_tty("   \n"), None);
    }

    #[test]
    fn open_for_pid_without_match_returns_no_match() {
        let result = open_for_pid(999_999, Some("/this/path/does/not/exist/at/all"));
        match result {
            OpenResult::NoMatch { reason } => {
                assert!(!reason.is_empty());
            }
            other => panic!("expected NoMatch, got {other:?}"),
        }
    }

    #[test]
    fn cwd_inside_exact_match() {
        assert!(cwd_inside(TEST_BASE, TEST_BASE));
    }

    #[test]
    fn cwd_inside_subdirectory() {
        assert!(cwd_inside(
            &format!("{TEST_BASE}/apps/api"),
            TEST_BASE
        ));
    }

    #[test]
    fn cwd_inside_rejects_sibling_with_shared_prefix() {
        assert!(!cwd_inside(
            &format!("{TEST_BASE}-extra"),
            TEST_BASE
        ));
    }

    #[test]
    fn cwd_inside_rejects_parent() {
        assert!(!cwd_inside(
            "/Users/test/dev",
            TEST_BASE
        ));
    }
}
