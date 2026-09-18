use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::proto::{ContainerInfo, ContainerPort, PortEntry};

const POLL_INTERVAL: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_millis(1500);

pub struct ContainerStore {
    socket: Option<PathBuf>,
    cache: HashMap<String, ContainerInfo>,
    by_host_port: HashMap<(String, u16), (String, u16)>,
    last_poll: Option<Instant>,
    last_attempt: Option<Instant>,
    last_warning: bool,
}

impl ContainerStore {
    pub fn new() -> Self {
        Self {
            socket: None,
            cache: HashMap::new(),
            by_host_port: HashMap::new(),
            last_poll: None,
            last_attempt: None,
            last_warning: false,
        }
    }

    pub fn attach(&self, mut ports: Vec<PortEntry>) -> Vec<PortEntry> {
        if self.cache.is_empty() {
            return ports;
        }
        for p in &mut ports {
            if p.container_runtime.is_none() {
                continue;
            }
            if let Some((proto, port)) = host_lookup_key(p) {
                if let Some((cid, cport)) = self.by_host_port.get(&(proto, port)) {
                    if let Some(info) = self.cache.get(cid) {
                        p.container_id = Some(info.id.clone());
                        p.container_name = Some(info.name.clone());
                        p.container_image = Some(info.image.clone());
                        p.container_port = Some(*cport);
                    }
                } else if let Some(c) = self.cache.values().find(|c| {
                    c.ports
                        .iter()
                        .any(|cp| cp.host_port == port && cp.protocol.eq_ignore_ascii_case(&p.protocol.to_string()))
                }) {
                    let cp = c
                        .ports
                        .iter()
                        .find(|cp| cp.host_port == port && cp.protocol.eq_ignore_ascii_case(&p.protocol.to_string()))
                        .unwrap();
                    p.container_id = Some(c.id.clone());
                    p.container_name = Some(c.name.clone());
                    p.container_image = Some(c.image.clone());
                    p.container_port = Some(cp.container_port);
                }
            }
        }
        ports
    }

    pub fn poll(&mut self) -> bool {
        let now = Instant::now();
        let due = match self.last_poll {
            Some(t) => now.duration_since(t) >= POLL_INTERVAL,
            None => true,
        };
        if !due {
            return false;
        }
        if let Some(t) = self.last_attempt {
            if now.duration_since(t) < Duration::from_secs(2) {
                return false;
            }
        }
        self.last_attempt = Some(now);

        if self.socket.is_none() {
            self.socket = discover_socket();
            if self.socket.is_none() {
                return false;
            }
        }

        let socket = self.socket.as_ref().unwrap();
        match fetch_containers(socket) {
            Ok(list) => {
                self.last_poll = Some(now);
                self.last_warning = false;
                let changed = list != self.cached_snapshot();
                self.rebuild_indexes(list);
                changed
            }
            Err(e) => {
                if !self.last_warning {
                    self.last_warning = true;
                    eprintln!("[portmon] container enrichment disabled: {e}");
                }
                self.socket = None;
                false
            }
        }
    }

    pub fn snapshot(&self) -> Vec<ContainerInfo> {
        self.cached_snapshot()
    }

    pub fn stop(&self, id: &str) -> Result<(), String> {
        let socket = self
            .socket
            .as_ref()
            .ok_or_else(|| "no container runtime socket".to_string())?;
        let path = format!("/containers/{id}/stop?t=5");
        let req = docker_request("POST", &path);
        let mut stream = UnixStream::connect(socket).map_err(|e| e.to_string())?;
        stream.set_read_timeout(Some(REQUEST_TIMEOUT)).ok();
        stream.set_write_timeout(Some(REQUEST_TIMEOUT)).ok();
        stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        if buf.starts_with(b"HTTP/1.1 2") || buf.starts_with(b"HTTP/1.0 2") || buf.starts_with(b"HTTP/2 2") {
            Ok(())
        } else {
            let body = String::from_utf8_lossy(&buf);
            Err(format!("stop failed: {}", body.lines().last().unwrap_or("?").trim()))
        }
    }

    fn cached_snapshot(&self) -> Vec<ContainerInfo> {
        let mut v: Vec<ContainerInfo> = self.cache.values().cloned().collect();
        v.sort_by(|a, b| a.name.cmp(&b.name));
        v
    }

    fn rebuild_indexes(&mut self, list: Vec<ContainerInfo>) {
        self.cache.clear();
        self.by_host_port.clear();
        for info in list {
            for p in &info.ports {
                self.by_host_port
                    .insert((p.protocol.to_ascii_lowercase(), p.host_port), (info.id.clone(), p.container_port));
            }
            self.cache.insert(info.id.clone(), info);
        }
    }
}

fn host_lookup_key(p: &PortEntry) -> Option<(String, u16)> {
    if p.state.as_deref() != Some("LISTEN") {
        return None;
    }
    Some((p.protocol.to_string(), p.local_port))
}

fn discover_socket() -> Option<PathBuf> {
    if let Ok(dh) = env::var("DOCKER_HOST") {
        if let Some(path) = dh.strip_prefix("unix://") {
            return Some(PathBuf::from(path));
        }
        return None;
    }
    if let Some(home) = dirs_home() {
        for candidate in [
            home.join(".orbstack/run/docker.sock"),
            home.join(".docker/run/docker.sock"),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    let default = PathBuf::from("/var/run/docker.sock");
    if default.exists() {
        return Some(default);
    }
    None
}

fn dirs_home() -> Option<PathBuf> {
    env::var_os("HOME").map(PathBuf::from)
}

fn fetch_containers(socket: &Path) -> Result<Vec<ContainerInfo>, String> {
    let req = docker_request("GET", "/containers/json?all=0");
    let mut stream = UnixStream::connect(socket).map_err(|e| format!("connect {}: {e}", socket.display()))?;
    stream.set_read_timeout(Some(REQUEST_TIMEOUT)).ok();
    stream.set_write_timeout(Some(REQUEST_TIMEOUT)).ok();
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    let (status, body) = read_http_response(&buf)?;
    if !status.starts_with("HTTP/") || !status.contains(" 2") {
        return Err(format!("docker api returned {status}"));
    }
    parse_containers_body(&body)
}

fn docker_request(method: &str, path: &str) -> String {
    format!(
        "{method} {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nAccept-Encoding: identity\r\n\r\n"
    )
}

fn read_http_response(raw: &[u8]) -> Result<(&str, Vec<u8>), String> {
    let text = std::str::from_utf8(raw).map_err(|e| e.to_string())?;
    let header_end = text
        .find("\r\n\r\n")
        .ok_or_else(|| "malformed response".to_string())?;
    let headers = &text[..header_end];
    let body = raw[header_end + 4..].to_vec();
    let status = headers.lines().next().unwrap_or("");
    if headers
        .lines()
        .any(|l| l.eq_ignore_ascii_case("Transfer-Encoding: chunked"))
    {
        let decoded = decode_chunked(&body)?;
        return Ok((status, decoded));
    }
    Ok((status, body))
}

fn decode_chunked(input: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < input.len() {
        let line_end = input[i..]
            .windows(2)
            .position(|w| w == b"\r\n")
            .ok_or_else(|| "chunked: missing size line".to_string())?;
        let size_line = std::str::from_utf8(&input[i..i + line_end])
            .map_err(|e| e.to_string())?
            .trim();
        let size_str = size_line.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_str, 16)
            .map_err(|e| format!("chunked: bad size {size_str:?}: {e}"))?;
        i += line_end + 2;
        if size == 0 {
            break;
        }
        if i + size > input.len() {
            return Err("chunked: truncated body".to_string());
        }
        out.extend_from_slice(&input[i..i + size]);
        i += size;
        if i + 2 > input.len() || &input[i..i + 2] != b"\r\n" {
            return Err("chunked: missing trailing CRLF".to_string());
        }
        i += 2;
    }
    Ok(out)
}

fn parse_containers_body(body: &[u8]) -> Result<Vec<ContainerInfo>, String> {
    let arr: Vec<serde_json::Value> = serde_json::from_slice(body).map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(arr.len());
    for v in arr {
        let id = v
            .get("Id")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .chars()
            .take(12)
            .collect::<String>();
        let name = v
            .get("Names")
            .and_then(|x| x.as_array())
            .and_then(|arr| arr.first())
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim_start_matches('/')
            .to_string();
        let image = v
            .get("Image")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if id.is_empty() || name.is_empty() {
            continue;
        }
        let ports_raw = v
            .get("Ports")
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default();
        let mut ports = Vec::new();
        for p in ports_raw {
            let host_port = p.get("PublicPort").and_then(|x| x.as_u64()).unwrap_or(0) as u16;
            let container_port = p.get("PrivatePort").and_then(|x| x.as_u64()).unwrap_or(0) as u16;
            let proto = p
                .get("Type")
                .and_then(|x| x.as_str())
                .unwrap_or("tcp")
                .to_string();
            if host_port == 0 {
                continue;
            }
            ports.push(ContainerPort {
                host_port,
                container_port,
                protocol: proto,
            });
        }
        out.push(ContainerInfo {
            id,
            name,
            image,
            ports,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::{Category, PortEntry, Protocol};

    fn sample(name: &str, port: u16, proto: Protocol) -> PortEntry {
        PortEntry {
            protocol: proto,
            local_addr: "0.0.0.0".into(),
            local_port: port,
            remote_addr: None,
            remote_port: None,
            state: Some("LISTEN".into()),
            pid: Some(1),
            process_name: Some(name.into()),
            exe: None,
            cwd: None,
            parent_pid: None,
            parent_name: None,
            container_runtime: Some("orbstack".into()),
            container_id: None,
            container_name: None,
            container_image: None,
            container_port: None,
            cpu_percent: None,
            memory_bytes: None,
            category: Category::Container,
        }
    }

    #[test]
    fn parses_list_response() {
        let body = r#"[{"Id":"abcdef1234567890","Names":["/supabase_kong_53s"],"Image":"kong:2.8.1","Ports":[{"PublicPort":8000,"PrivatePort":8000,"Type":"tcp"}]}]"#;
        let parsed = parse_containers_body(body.as_bytes()).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "abcdef123456");
        assert_eq!(parsed[0].name, "supabase_kong_53s");
        assert_eq!(parsed[0].image, "kong:2.8.1");
        assert_eq!(parsed[0].ports.len(), 1);
        assert_eq!(parsed[0].ports[0].host_port, 8000);
    }

    #[test]
    fn parses_chunked_response() {
        let body = br#"[{"Id":"abcdef1234567890","Names":["/c1"],"Image":"nginx","Ports":[{"PublicPort":12345,"PrivatePort":80,"Type":"tcp"}]}]"#;
        let mut chunked = format!("{:x}\r\n", body.len()).into_bytes();
        chunked.extend_from_slice(body);
        chunked.extend_from_slice(b"\r\n0\r\n\r\n");

        let raw = format!(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n"
        );
        let mut full = raw.into_bytes();
        full.extend_from_slice(&chunked);

        let (status, decoded) = read_http_response(&full).unwrap();
        assert!(status.contains("200"));
        let parsed = parse_containers_body(&decoded).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].ports[0].host_port, 12345);
    }

    #[test]
    fn read_http_rejects_non_2xx() {
        let raw = b"HTTP/1.1 500 Internal\r\nContent-Length: 0\r\n\r\n";
        let (status, _) = read_http_response(raw).unwrap();
        assert!(!status.contains(" 2"));
    }

    #[test]
    fn attach_resolves_known_port() {
        let mut store = ContainerStore::new();
        store.rebuild_indexes(vec![ContainerInfo {
            id: "abc123".into(),
            name: "kong".into(),
            image: "kong:2.8.1".into(),
            ports: vec![ContainerPort {
                host_port: 8000,
                container_port: 8000,
                protocol: "tcp".into(),
            }],
        }]);
        let mut ports = vec![sample("OrbStack Helper", 8000, Protocol::Tcp)];
        ports = store.attach(ports);
        assert_eq!(ports[0].container_id.as_deref(), Some("abc123"));
        assert_eq!(ports[0].container_name.as_deref(), Some("kong"));
        assert_eq!(ports[0].container_image.as_deref(), Some("kong:2.8.1"));
        assert_eq!(ports[0].container_port, Some(8000));
    }

    #[test]
    fn attach_leaves_non_listen_alone() {
        let mut store = ContainerStore::new();
        store.rebuild_indexes(vec![ContainerInfo {
            id: "abc".into(),
            name: "n".into(),
            image: "i".into(),
            ports: vec![ContainerPort {
                host_port: 8000,
                container_port: 8000,
                protocol: "tcp".into(),
            }],
        }]);
        let mut p = sample("OrbStack Helper", 8000, Protocol::Tcp);
        p.state = Some("ESTABLISHED".into());
        let out = store.attach(vec![p]);
        assert!(out[0].container_id.is_none());
    }
}
