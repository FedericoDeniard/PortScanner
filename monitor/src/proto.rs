use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Tcp,
    Udp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Category {
    System,
    UserApp,
    UserDev,
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
    pub category: Category,
}

impl PortEntry {
    pub fn key(&self) -> (Protocol, u16, Option<u32>) {
        (self.protocol, self.local_port, self.pid)
    }
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
    Error {
        message: String,
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
