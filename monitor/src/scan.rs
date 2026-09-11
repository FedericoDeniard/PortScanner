use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo};
use sysinfo::{Pid, ProcessesToUpdate, System};

use crate::proto::{Category, PortEntry, Protocol};

const LSOF_CACHE_TTL: Duration = Duration::from_secs(60);
const LSOF_CACHE_TTL_FAILED: Duration = Duration::from_secs(5);

pub struct Scanner {
    system: System,
    cwd_cache: HashMap<u32, (Instant, Option<String>)>,
}

impl Scanner {
    pub fn new() -> Self {
        Self {
            system: System::new(),
            cwd_cache: HashMap::new(),
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
                    category: Category::UserApp,
                }),
            }
        }

        self.system
            .refresh_processes(ProcessesToUpdate::All, true);
        for entry in &mut out {
            if let Some(pid) = entry.pid {
                if let Some(process) = self.system.process(Pid::from_u32(pid)) {
                    entry.process_name = Some(process.name().to_string_lossy().into_owned());
                    entry.exe = process
                        .exe()
                        .map(|p| p.to_string_lossy().into_owned());
                    entry.category = classify(process.exe());
                    if entry.cwd.is_none() && entry.category != Category::System {
                        entry.cwd = self.resolve_cwd(pid);
                    }
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
            "/Users/federicodeniard/Applications/Some.app/Contents/MacOS/Some",
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
            "/Users/federicodeniard/projects/hub/node_modules/.bin/vite",
            "/Users/federicodeniard/.cargo/bin/cargo",
            "/Users/fede/dev/something/target/debug/server",
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
}
