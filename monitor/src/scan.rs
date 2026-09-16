use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo};
use sysinfo::{Pid, ProcessesToUpdate, System};

use crate::proto::{Category, PortEntry, Protocol};

const LSOF_CACHE_TTL: Duration = Duration::from_secs(60);
const LSOF_CACHE_TTL_FAILED: Duration = Duration::from_secs(5);
const PARENT_CACHE_TTL: Duration = Duration::from_secs(30);
const MAX_PARENT_WALK: usize = 12;

pub struct Scanner {
    system: System,
    cwd_cache: HashMap<u32, (Instant, Option<String>)>,
    parent_cache: HashMap<u32, (Instant, Option<(u32, String)>)>,
}

impl Scanner {
    pub fn new() -> Self {
        Self {
            system: System::new(),
            cwd_cache: HashMap::new(),
            parent_cache: HashMap::new(),
        }
    }

    pub fn scan(&mut self) -> Result<Vec<PortEntry>, String> {
        let af = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
        let proto = ProtocolFlags::TCP | ProtocolFlags::UDP;
        let sockets = get_sockets_info(af, proto).map_err(|e| e.to_string())?;

        let mut out = Vec::with_capacity(sockets.len());
        for si in sockets {
            let pid = si.associated_pids.first().copied();
            match si.protocol_socket_info {
                ProtocolSocketInfo::Tcp(tcp) => out.push(PortEntry {
                    protocol: Protocol::Tcp,
                    local_addr: tcp.local_addr.to_string(),
                    local_port: tcp.local_port,
                    remote_addr: Some(tcp.remote_addr.to_string()),
                    remote_port: Some(tcp.remote_port),
                    state: Some(format!("{:?}", tcp.state).to_uppercase()),
                    pid,
                    process_name: None,
                    exe: None,
                    cwd: None,
                    parent_pid: None,
                    parent_name: None,
                    container_runtime: None,
                    container_id: None,
                    container_name: None,
                    container_image: None,
                    container_port: None,
                    category: Category::UserApp,
                }),
                ProtocolSocketInfo::Udp(udp) => out.push(PortEntry {
                    protocol: Protocol::Udp,
                    local_addr: udp.local_addr.to_string(),
                    local_port: udp.local_port,
                    remote_addr: None,
                    remote_port: None,
                    state: None,
                    pid,
                    process_name: None,
                    exe: None,
                    cwd: None,
                    parent_pid: None,
                    parent_name: None,
                    container_runtime: None,
                    container_id: None,
                    container_name: None,
                    container_image: None,
                    container_port: None,
                    category: Category::UserApp,
                }),
            }
        }

        self.system
            .refresh_processes(ProcessesToUpdate::All, true);
        for entry in &mut out {
            if let Some(pid) = entry.pid {
                if let Some(process) = self.system.process(Pid::from_u32(pid)) {
                    let pname = process.name().to_string_lossy().into_owned();
                    let pexe = process.exe().map(|p| p.to_path_buf());
                    entry.process_name = Some(pname.clone());
                    entry.exe = pexe.as_ref().map(|p| p.to_string_lossy().into_owned());
                    if let Some(runtime) = detect_runtime(&pname, pexe.as_deref()) {
                        entry.container_runtime = Some(runtime.to_string());
                        entry.category = Category::Container;
                    } else {
                        entry.category = classify(pexe.as_deref());
                    }
                    if entry.cwd.is_none() && entry.category != Category::System {
                        entry.cwd = self.resolve_cwd(pid);
                    }
                    let (ppid, pname) = self
                        .resolve_app_parent(pid)
                        .map(|(p, n)| (Some(p), Some(n)))
                        .unwrap_or((None, None));
                    entry.parent_pid = ppid;
                    entry.parent_name = pname;
                }
            }
        }

        out.sort_by(|a, b| {
            a.local_port
                .cmp(&b.local_port)
                .then(a.protocol.cmp(&b.protocol))
        });
        Ok(out)
    }

    fn resolve_app_parent(&mut self, pid: u32) -> Option<(u32, String)> {
        let now = Instant::now();
        if let Some((at, cached)) = self.parent_cache.get(&pid) {
            if now.duration_since(*at) < PARENT_CACHE_TTL {
                return cached.clone();
            }
        }
        let resolved = self.resolve_app_parent_inner(pid);
        self.parent_cache.insert(pid, (now, resolved.clone()));
        resolved
    }

    fn resolve_app_parent_inner(&self, pid: u32) -> Option<(u32, String)> {
        let mut current_pid = pid;
        let mut current_bundle: Option<PathBuf> = self
            .system
            .process(Pid::from_u32(current_pid))
            .and_then(|p| p.exe().map(|e| e.to_path_buf()))
            .as_deref()
            .and_then(app_bundle_root)
            .map(|p| p.to_path_buf());

        let mut visited: HashSet<u32> = HashSet::new();
        visited.insert(current_pid);

        for _ in 0..MAX_PARENT_WALK {
            let proc = self.system.process(Pid::from_u32(current_pid))?;
            let parent_pid = proc.parent()?.as_u32();
            if parent_pid <= 1 || parent_pid == current_pid || !visited.insert(parent_pid) {
                return None;
            }
            let parent = self.system.process(Pid::from_u32(parent_pid))?;
            let parent_name = parent.name().to_string_lossy().into_owned();
            let parent_bundle = parent
                .exe()
                .map(|e| e.to_path_buf())
                .as_deref()
                .and_then(app_bundle_root)
                .map(|p| p.to_path_buf());

            match (&current_bundle, &parent_bundle) {
                (Some(cb), Some(pb)) if cb == pb => {
                    if !name_is_helper(&parent_name) {
                        return Some((parent_pid, parent_name));
                    }
                    current_pid = parent_pid;
                    current_bundle = Some(pb.clone());
                }
                _ => return Some((parent_pid, parent_name)),
            }
        }
        None
    }

    fn resolve_cwd(&mut self, pid: u32) -> Option<String> {
        let now = Instant::now();
        if let Some((at, cached)) = self.cwd_cache.get(&pid) {
            let ttl = if cached.is_some() {
                LSOF_CACHE_TTL
            } else {
                LSOF_CACHE_TTL_FAILED
            };
            if now.duration_since(*at) < ttl {
                return cached.clone();
            }
        }
        let resolved = lsof_cwd(pid);
        self.cwd_cache.insert(pid, (now, resolved.clone()));
        resolved
    }
}

fn lsof_cwd(pid: u32) -> Option<String> {
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

fn classify(exe: Option<&Path>) -> Category {
    let Some(path) = exe else {
        return Category::UserApp;
    };
    let s = path.to_string_lossy();
    if s.starts_with("/System/")
        || s.starts_with("/usr/libexec/")
        || s.starts_with("/usr/sbin/")
        || s.starts_with("/usr/bin/")
        || s.starts_with("/sbin/")
        || s.starts_with("/bin/")
    {
        Category::System
    } else if s.contains("/Applications/") {
        Category::UserApp
    } else if s.starts_with('/') && s.contains("/Users/") {
        Category::UserDev
    } else {
        Category::UserApp
    }
}

fn detect_runtime(process_name: &str, exe: Option<&Path>) -> Option<&'static str> {
    if process_name == "OrbStack Helper" || exe.map(is_orbstack).unwrap_or(false) {
        return Some("orbstack");
    }
    if process_name == "com.docker.backend"
        || process_name == "com.docker.helper"
        || process_name == "com.docker.vpnkit"
        || exe.map(is_docker_desktop).unwrap_or(false)
    {
        return Some("docker");
    }
    if process_name == "gvproxy"
        || process_name == "vde_vmnet"
        || process_name.starts_with("qemu-system-")
    {
        return Some("lima");
    }
    if process_name == "colima" {
        return Some("colima");
    }
    if process_name == "com.apple.container.runtime" {
        return Some("apple");
    }
    None
}

fn is_orbstack(exe: &Path) -> bool {
    exe.to_string_lossy().contains("/OrbStack.app/")
}

fn is_docker_desktop(exe: &Path) -> bool {
    let s = exe.to_string_lossy();
    s.contains("/Docker.app/") || s.contains("com.docker.backend")
}

fn app_bundle_root(exe: &Path) -> Option<PathBuf> {
    let mut outermost: Option<PathBuf> = None;
    for ancestor in exe.ancestors() {
        if ancestor.extension().and_then(|e| e.to_str()) == Some("app") {
            outermost = Some(ancestor.to_path_buf());
        }
    }
    outermost
}

fn name_is_helper(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    let lower = name.to_ascii_lowercase();
    for suffix in [
        " helper (renderer)",
        " helper (gpu)",
        " helper (plugin)",
        " helper",
        " gpu process",
        " renderer",
        " utility",
    ] {
        if lower.ends_with(suffix) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn system_paths() {
        for p in [
            "/System/Library/CoreServices/ControlCenter.app/Contents/MacOS/ControlCenter",
            "/usr/libexec/rapportd",
            "/usr/sbin/something",
            "/usr/bin/something",
            "/sbin/launchd",
            "/bin/sh",
        ] {
            assert_eq!(
                classify(Some(&PathBuf::from(p))),
                Category::System,
                "expected System for {p}"
            );
        }
    }

    #[test]
    fn user_app_paths() {
        for p in [
            "/Applications/Spotify.app/Contents/MacOS/Spotify",
            "/Applications/OrbStack.app/Contents/MacOS/OrbStack Helper",
            "/Users/test/Applications/Some.app/Contents/MacOS/Some",
        ] {
            assert_eq!(
                classify(Some(&PathBuf::from(p))),
                Category::UserApp,
                "expected UserApp for {p}"
            );
        }
    }

    #[test]
    fn user_dev_paths() {
        for p in [
            "/Users/test/projects/project/node_modules/.bin/vite",
            "/Users/test/.cargo/bin/cargo",
            "/Users/test/dev/project/target/debug/server",
        ] {
            assert_eq!(
                classify(Some(&PathBuf::from(p))),
                Category::UserDev,
                "expected UserDev for {p}"
            );
        }
    }

    #[test]
    fn fallback_when_path_unknown() {
        assert_eq!(classify(None), Category::UserApp);
        assert_eq!(classify(Some(&PathBuf::from(""))), Category::UserApp);
    }

    #[test]
    fn app_bundle_root_macos() {
        let exe = PathBuf::from(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome Helper (Renderer)",
        );
        assert_eq!(
            app_bundle_root(&exe),
            Some(PathBuf::from("/Applications/Google Chrome.app"))
        );
    }

    #[test]
    fn app_bundle_root_walks_past_nested_helper_bundle() {
        let exe = PathBuf::from(
            "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/152.0.7977.76/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper",
        );
        assert_eq!(
            app_bundle_root(&exe),
            Some(PathBuf::from("/Applications/Google Chrome.app"))
        );
    }

    #[test]
    fn app_bundle_root_returns_none_outside_macos() {
        let exe = PathBuf::from("/usr/bin/node");
        assert_eq!(app_bundle_root(&exe), None);
    }

    #[test]
    fn name_is_helper_detects_helper_variants() {
        assert!(name_is_helper("Google Chrome Helper"));
        assert!(name_is_helper("Google Chrome Helper (Renderer)"));
        assert!(name_is_helper("Google Chrome Helper (GPU)"));
        assert!(name_is_helper("node GPU Process"));
        assert!(!name_is_helper("Google Chrome"));
        assert!(!name_is_helper("Spotify"));
        assert!(!name_is_helper(""));
    }

    #[test]
    fn detect_runtime_orbstack() {
        assert_eq!(
            detect_runtime("OrbStack Helper", None),
            Some("orbstack")
        );
        assert_eq!(
            detect_runtime(
                "OrbStack Helper",
                Some(&PathBuf::from(
                    "/Applications/OrbStack.app/Contents/Frameworks/OrbStack Helper.app/Contents/MacOS/OrbStack Helper"
                )),
            ),
            Some("orbstack")
        );
        assert_eq!(
            detect_runtime(
                "OrbStack",
                Some(&PathBuf::from("/Applications/OrbStack.app/Contents/MacOS/OrbStack")),
            ),
            Some("orbstack")
        );
    }

    #[test]
    fn detect_runtime_docker_desktop() {
        assert_eq!(detect_runtime("com.docker.backend", None), Some("docker"));
        assert_eq!(detect_runtime("com.docker.helper", None), Some("docker"));
        assert_eq!(detect_runtime("com.docker.vpnkit", None), Some("docker"));
        assert_eq!(
            detect_runtime(
                "com.docker.backend",
                Some(&PathBuf::from(
                    "/Applications/Docker.app/Contents/MacOS/com.docker.backend"
                )),
            ),
            Some("docker")
        );
    }

    #[test]
    fn detect_runtime_lima_family() {
        assert_eq!(detect_runtime("gvproxy", None), Some("lima"));
        assert_eq!(detect_runtime("vde_vmnet", None), Some("lima"));
        assert_eq!(detect_runtime("qemu-system-aarch64", None), Some("lima"));
        assert_eq!(detect_runtime("qemu-system-x86_64", None), Some("lima"));
        assert_eq!(detect_runtime("colima", None), Some("colima"));
    }

    #[test]
    fn detect_runtime_apple_container() {
        assert_eq!(
            detect_runtime("com.apple.container.runtime", None),
            Some("apple")
        );
    }

    #[test]
    fn detect_runtime_returns_none_for_normal_apps() {
        assert_eq!(detect_runtime("node", None), None);
        assert_eq!(
            detect_runtime(
                "node",
                Some(&PathBuf::from("/Users/test/dev/project/node_modules/.bin/node")),
            ),
            None
        );
        assert_eq!(detect_runtime("", None), None);
    }
}
