mod diff;
mod kill;
mod proto;
mod scan;
mod stats;
mod terminal;

use std::io::{BufRead, BufReader, Write};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use proto::{Command, Event, Filter};
use scan::Scanner;
use stats::StatsCollector;

const PROTOCOL_VERSION: u32 = 3;
const DEFAULT_INTERVAL_MS: u64 = 1000;
const MIN_INTERVAL_MS: u64 = 50;

fn emit(evt: &Event) {
    let stdout = std::io::stdout();
    let mut lock = stdout.lock();
    if let Ok(line) = serde_json::to_string(evt) {
        let _ = writeln!(lock, "{line}");
        let _ = lock.flush();
    }
}

fn spawn_stdin_reader(tx: mpsc::Sender<Command>) {
    thread::spawn(move || {
        let stdin = std::io::stdin();
        for line in BufReader::new(stdin.lock()).lines() {
            let Ok(line) = line else { break };
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<Command>(line) {
                Ok(cmd) => {
                    if tx.send(cmd).is_err() {
                        break;
                    }
                }
                Err(e) => emit(&Event::Error {
                    message: format!("invalid command: {e}"),
                }),
            }
        }
    });
}

fn main() {
    let (tx, rx) = mpsc::channel::<Command>();
    spawn_stdin_reader(tx);

    let mut interval = Duration::from_millis(DEFAULT_INTERVAL_MS);
    let mut filter = Filter::default();
    let mut differ = diff::Diff::new();
    let mut scanner = Scanner::new();
    let mut stats = StatsCollector::new();
    let mut seq: u64 = 0;

    emit(&Event::Hello {
        version: PROTOCOL_VERSION,
        pid: std::process::id(),
    });

    loop {
        match scanner.scan() {
            Ok(ports) => {
                let ports = filter.apply(ports);
                seq += 1;
                if differ.is_first() {
                    differ.update(ports.clone());
                    emit(&Event::Snapshot { seq, ports });
                } else {
                    let delta = differ.update(ports);
                    emit(&Event::Delta {
                        seq,
                        added: delta.added,
                        removed: delta.removed,
                    });
                }
            }
            Err(e) => emit(&Event::Error { message: e }),
        }

        emit(&Event::Stats {
            stats: stats.snapshot(),
        });

        match rx.recv_timeout(interval) {
            Ok(Command::SetInterval { ms }) => {
                interval = Duration::from_millis(ms.max(MIN_INTERVAL_MS));
            }
            Ok(Command::SetFilter { protocols, states }) => {
                filter = Filter { protocols, states };
                differ = diff::Diff::new();
            }
            Ok(Command::Kill { pid, signal }) => {
                let sigkill = signal.as_deref() == Some("kill");
                let (ok, error) = match kill::kill_process(pid, sigkill) {
                    Ok(()) => (true, None),
                    Err(e) => (false, Some(e)),
                };
                emit(&Event::Ack {
                    cmd: "kill".into(),
                    pid: Some(pid),
                    ok,
                    error,
                });
            }
            Ok(Command::OpenTerminal { pid, cwd }) => {
                let result = terminal::open_for_pid(pid, cwd.as_deref());
                let (ok, terminal, error) = match result {
                    terminal::OpenResult::Opened { terminal } => (true, Some(terminal), None),
                    terminal::OpenResult::NoMatch { reason } => (false, None, Some(reason)),
                };
                emit(&Event::Opened {
                    pid,
                    ok,
                    terminal,
                    error,
                });
            }
            Ok(Command::Shutdown) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
}
