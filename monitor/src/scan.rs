use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo};
use sysinfo::{Pid, ProcessesToUpdate, System};

use crate::proto::{PortEntry, Protocol};

pub struct Scanner {
    system: System,
}

impl Scanner {
    pub fn new() -> Self {
        Self {
            system: System::new(),
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
                }),
            }
        }

        self.system
            .refresh_processes(ProcessesToUpdate::All, true);
        for entry in &mut out {
            if let Some(pid) = entry.pid {
                if let Some(process) = self.system.process(Pid::from_u32(pid)) {
                    entry.process_name = Some(process.name().to_string_lossy().into_owned());
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
}
