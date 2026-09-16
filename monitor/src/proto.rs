use serde::{Deserialize, Serialize};

use crate::stats::SystemStats;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Tcp,
    Udp,
}

impl std::fmt::Display for Protocol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Protocol::Tcp => f.write_str("tcp"),
            Protocol::Udp => f.write_str("udp"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Category {
    System,
    UserApp,
    UserDev,
    Container,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortEntry {
    pub protocol: Protocol,
    pub local_addr: String,
    pub local_port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_addr: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exe: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_runtime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_port: Option<u16>,
    pub category: Category,
}

impl PortEntry {
    pub fn key(&self) -> (Protocol, u16, Option<u32>) {
        (self.protocol, self.local_port, self.pid)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    #[serde(default)]
    pub ports: Vec<ContainerPort>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContainerPort {
    #[serde(rename = "hostPort")]
    pub host_port: u16,
    #[serde(rename = "containerPort")]
    pub container_port: u16,
    pub protocol: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Event {
    Hello {
        version: u32,
        pid: u32,
    },
    Snapshot {
        seq: u64,
        ports: Vec<PortEntry>,
    },
    Delta {
        seq: u64,
        added: Vec<PortEntry>,
        removed: Vec<PortEntry>,
    },
    Ack {
        cmd: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        pid: Option<u32>,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Opened {
        pid: u32,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        terminal: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Error {
        message: String,
    },
    Stats {
        stats: SystemStats,
    },
    ContainersUpdated {
        containers: Vec<ContainerInfo>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum Command {
    SetInterval {
        ms: u64,
    },
    SetFilter {
        protocols: Option<Vec<Protocol>>,
        states: Option<Vec<String>>,
    },
    Kill {
        pid: u32,
        signal: Option<String>,
    },
    OpenTerminal {
        pid: u32,
        #[serde(default)]
        cwd: Option<String>,
    },
    StopContainer {
        id: String,
    },
    Shutdown,
}

#[derive(Debug, Default)]
pub struct Filter {
    pub protocols: Option<Vec<Protocol>>,
    pub states: Option<Vec<String>>,
}

impl Filter {
    pub fn apply(&self, ports: Vec<PortEntry>) -> Vec<PortEntry> {
        ports
            .into_iter()
            .filter(|p| {
                let proto_ok = self
                    .protocols
                    .as_ref()
                    .is_none_or(|ps| ps.contains(&p.protocol));
                let state_ok = match (&self.states, &p.state) {
                    (Some(ss), Some(s)) => ss.iter().any(|x| x.eq_ignore_ascii_case(s)),
                    (Some(_), None) => true,
                    (None, _) => true,
                };
                proto_ok && state_ok
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_OPEN_CWD: &str = "/Users/test/dev/project";
    const TEST_CWD: &str = "/Users/test/projects/project";
    const TEST_EXE: &str = "/Users/test/.nvm/versions/node/.../bin/node";

    fn entry() -> PortEntry {
        PortEntry {
            protocol: Protocol::Tcp,
            local_addr: "127.0.0.1".into(),
            local_port: 3000,
            remote_addr: None,
            remote_port: None,
            state: Some("LISTEN".into()),
            pid: Some(42),
            process_name: Some("node".into()),
            exe: None,
            cwd: None,
            parent_pid: None,
            parent_name: None,
            container_runtime: None,
            container_id: None,
            container_name: None,
            container_image: None,
            container_port: None,
            category: Category::UserDev,
        }
    }

    #[test]
    fn event_snapshot_roundtrip() {
        let evt = Event::Snapshot {
            seq: 7,
            ports: vec![entry()],
        };
        let json = serde_json::to_string(&evt).unwrap();
        assert!(json.contains("\"type\":\"snapshot\""));
        assert!(json.contains("\"localPort\":3000"));
        assert!(json.contains("\"processName\":\"node\""));
        assert!(json.contains("\"category\":\"user-dev\""));
    }

    #[test]
    fn category_serializes_kebab() {
        for (c, expected) in [
            (Category::System, "\"system\""),
            (Category::UserApp, "\"user-app\""),
            (Category::UserDev, "\"user-dev\""),
            (Category::Container, "\"container\""),
        ] {
            let json = serde_json::to_string(&c).unwrap();
            assert_eq!(json, expected);
        }
    }

    #[test]
    fn event_skips_none_fields() {
        let evt = Event::Ack {
            cmd: "kill".into(),
            pid: None,
            ok: true,
            error: None,
        };
        let json = serde_json::to_string(&evt).unwrap();
        assert!(!json.contains("\"pid\""));
        assert!(!json.contains("\"error\""));
    }

    #[test]
    fn command_parse_set_interval() {
        let cmd: Command = serde_json::from_str(r#"{"cmd":"set_interval","ms":2000}"#).unwrap();
        match cmd {
            Command::SetInterval { ms } => assert_eq!(ms, 2000),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn command_parse_kill_and_shutdown() {
        let cmd: Command =
            serde_json::from_str(r#"{"cmd":"kill","pid":42,"signal":"kill"}"#).unwrap();
        match cmd {
            Command::Kill { pid, signal } => {
                assert_eq!(pid, 42);
                assert_eq!(signal.as_deref(), Some("kill"));
            }
            _ => panic!("wrong variant"),
        }
        let cmd: Command = serde_json::from_str(r#"{"cmd":"shutdown"}"#).unwrap();
        assert!(matches!(cmd, Command::Shutdown));
    }

    #[test]
    fn command_parse_open_terminal() {
        let cmd: Command = serde_json::from_str(r#"{"cmd":"open_terminal","pid":4242}"#).unwrap();
        match cmd {
            Command::OpenTerminal { pid, cwd } => {
                assert_eq!(pid, 4242);
                assert!(cwd.is_none());
            }
            _ => panic!("wrong variant"),
        }

        let cmd: Command = serde_json::from_str(
            r#"{"cmd":"open_terminal","pid":7,"cwd":"/Users/test/dev/project"}"#,
        )
        .unwrap();
        match cmd {
            Command::OpenTerminal { pid, cwd } => {
                assert_eq!(pid, 7);
                assert_eq!(cwd.as_deref(), Some(TEST_OPEN_CWD));
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn event_opened_roundtrip() {
        let evt = Event::Opened {
            pid: 7,
            ok: true,
            terminal: Some("Orca".into()),
            error: None,
        };
        let json = serde_json::to_string(&evt).unwrap();
        assert!(json.contains("\"type\":\"opened\""));
        assert!(json.contains("\"terminal\":\"Orca\""));
        assert!(!json.contains("\"error\""));

        let evt_fail = Event::Opened {
            pid: 7,
            ok: false,
            terminal: None,
            error: Some("no match".into()),
        };
        let json = serde_json::to_string(&evt_fail).unwrap();
        assert!(json.contains("\"ok\":false"));
        assert!(!json.contains("\"terminal\""));
    }

    #[test]
    fn entry_serialization_includes_optional_cwd_exe() {
        let mut e = entry();
        e.cwd = Some(TEST_CWD.into());
        e.exe = Some(TEST_EXE.into());
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains(&format!("\"cwd\":\"{TEST_CWD}\"")));
        assert!(json.contains("\"exe\":"));

        let parsed: PortEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.cwd.as_deref(), Some(TEST_CWD));
        assert_eq!(parsed.exe.as_deref(), Some(TEST_EXE));
    }

    #[test]
    fn event_stats_roundtrip_skips_optional_fields() {
        let stats = SystemStats {
            host_label: "MacBook Air".into(),
            chip: "Apple M1".into(),
            gpu_cores: Some(7),
            total_memory_bytes: 8 * 1024 * 1024 * 1024,
            total_disk_bytes: 228 * 1024 * 1024 * 1024,
            os_version: "macOS 26.6.2".into(),
            battery_health_pct: None,
            battery_charge_pct: None,
            battery_state: None,
            uptime_secs: 6 * 86400 + 22 * 3600,
            collected_at_ms: 1_700_000_000_000,
        };
        let evt = Event::Stats { stats };
        let json = serde_json::to_string(&evt).unwrap();
        assert!(json.contains("\"type\":\"stats\""));
        assert!(json.contains("\"hostLabel\":\"MacBook Air\""));
        assert!(json.contains("\"gpuCores\":7"));
        assert!(json.contains("\"uptimeSecs\":"));
        assert!(!json.contains("\"batteryHealthPct\""));
        assert!(!json.contains("\"batteryChargePct\""));
        assert!(!json.contains("\"batteryState\""));
    }

    #[test]
    fn event_stats_roundtrip_includes_battery() {
        let stats = SystemStats {
            host_label: "MacBook Pro".into(),
            chip: "Apple M3 Pro".into(),
            gpu_cores: Some(18),
            total_memory_bytes: 18 * 1024 * 1024 * 1024,
            total_disk_bytes: 512 * 1024 * 1024 * 1024,
            os_version: "macOS 26.6.2".into(),
            battery_health_pct: Some(79),
            battery_charge_pct: Some(41),
            battery_state: Some("discharging".into()),
            uptime_secs: 3600,
            collected_at_ms: 1_700_000_000_000,
        };
        let evt = Event::Stats { stats };
        let json = serde_json::to_string(&evt).unwrap();
        assert!(json.contains("\"batteryHealthPct\":79"));
        assert!(json.contains("\"batteryChargePct\":41"));
        assert!(json.contains("\"batteryState\":\"discharging\""));
    }

    #[test]
    fn filter_by_protocol_and_state() {
        let tcp = entry();
        let mut udp = entry();
        udp.protocol = Protocol::Udp;
        udp.local_port = 5353;
        udp.state = None;

        let f = Filter {
            protocols: Some(vec![Protocol::Udp]),
            states: None,
        };
        let out = f.apply(vec![tcp.clone(), udp.clone()]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].local_port, 5353);

        let f = Filter {
            protocols: None,
            states: Some(vec!["listen".into()]),
        };
        let out = f.apply(vec![tcp, udp]);
        assert_eq!(out.len(), 2);
    }
}
