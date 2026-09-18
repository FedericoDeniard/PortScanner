use std::process::Command;

use battery::units::ratio::percent;
use battery::{Battery, Manager, State as BatteryState};
use serde::Serialize;
use sysinfo::{Disks, System};

const MODEL_PREFIXES: &[(&str, &str)] = &[
    ("MacBookAir", "MacBook Air"),
    ("MacBookPro", "MacBook Pro"),
    ("MacBook", "MacBook"),
    ("iMacPro", "iMac Pro"),
    ("iMac", "iMac"),
    ("Macmini", "Mac mini"),
    ("MacPro", "Mac Pro"),
    ("MacStudio", "Mac Studio"),
];

const GPU_CORES_BY_CHIP: &[(&str, u8)] = &[
    ("Apple M1 Ultra", 48),
    ("Apple M1 Max", 24),
    ("Apple M1 Pro", 16),
    ("Apple M1", 7),
    ("Apple M2 Ultra", 60),
    ("Apple M2 Max", 30),
    ("Apple M2 Pro", 16),
    ("Apple M2", 8),
    ("Apple M3 Max", 30),
    ("Apple M3 Pro", 18),
    ("Apple M3", 8),
    ("Apple M4 Max", 40),
    ("Apple M4 Pro", 20),
    ("Apple M4", 10),
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub host_label: String,
    pub chip: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_cores: Option<u8>,
    pub total_memory_bytes: u64,
    pub used_memory_bytes: u64,
    pub total_disk_bytes: u64,
    pub used_disk_bytes: u64,
    pub os_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub battery_health_pct: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub battery_charge_pct: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub battery_state: Option<String>,
    pub uptime_secs: u64,
    pub collected_at_ms: u64,
}

pub struct StatsCollector {
    static_: StaticInfo,
    last_battery: Option<BatterySnapshot>,
}

struct StaticInfo {
    host_label: String,
    chip: String,
    gpu_cores: Option<u8>,
    total_memory_bytes: u64,
    total_disk_bytes: u64,
    os_version: String,
}

#[derive(Clone)]
struct BatterySnapshot {
    health_pct: Option<u8>,
    charge_pct: Option<u8>,
    state: Option<String>,
}

impl StatsCollector {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        let disks = Disks::new_with_refreshed_list();

        let chip = sys
            .cpus()
            .first()
            .map(|c| c.brand().trim().to_string())
            .unwrap_or_default();

        let host_label = match sysctl_string("hw.model") {
            Some(raw) => friendly_model(&raw).unwrap_or(raw),
            None => System::host_name()
                .unwrap_or_default()
                .trim_end_matches(".local")
                .to_string(),
        };

        let gpu_cores = lookup_gpu_cores(&chip);

        let total_memory_bytes = sys.total_memory();

        let total_disk_bytes = pick_root_disk_bytes(&disks);

        let os_version = sw_vers_product_version()
            .map(|v| format!("macOS {v}"))
            .unwrap_or_else(|| System::long_os_version().unwrap_or_default());

        Self {
            static_: StaticInfo {
                host_label,
                chip,
                gpu_cores,
                total_memory_bytes,
                total_disk_bytes,
                os_version,
            },
            last_battery: None,
        }
    }

    pub fn snapshot(&mut self) -> SystemStats {
        let mut sys = System::new();
        sys.refresh_memory();
        let disks = Disks::new_with_refreshed_list();
        let uptime_secs = System::uptime();

        self.last_battery = poll_battery();

        let collected_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let battery_health_pct = self.last_battery.as_ref().and_then(|b| b.health_pct);
        let battery_charge_pct = self.last_battery.as_ref().and_then(|b| b.charge_pct);
        let battery_state = self.last_battery.as_ref().and_then(|b| b.state.clone());

        let used_memory_bytes = sys.used_memory();
        let used_disk_bytes = pick_root_disk_used(&disks);

        SystemStats {
            host_label: self.static_.host_label.clone(),
            chip: self.static_.chip.clone(),
            gpu_cores: self.static_.gpu_cores,
            total_memory_bytes: self.static_.total_memory_bytes,
            used_memory_bytes,
            total_disk_bytes: self.static_.total_disk_bytes,
            used_disk_bytes,
            os_version: self.static_.os_version.clone(),
            battery_health_pct,
            battery_charge_pct,
            battery_state,
            uptime_secs,
            collected_at_ms,
        }
    }
}

fn sysctl_string(key: &str) -> Option<String> {
    let out = Command::new("/usr/sbin/sysctl")
        .args(["-n", key])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8(out.stdout).ok()?.trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn pick_root_disk_bytes(disks: &Disks) -> u64 {
    let root = disks
        .iter()
        .find(|d| d.mount_point() == std::path::Path::new("/"))
        .map(|d| d.total_space());
    root.unwrap_or_else(|| disks.iter().map(|d| d.total_space()).max().unwrap_or(0))
}

fn pick_root_disk_used(disks: &Disks) -> u64 {
    disks
        .iter()
        .find(|d| d.mount_point() == std::path::Path::new("/"))
        .map(|d| d.total_space().saturating_sub(d.available_space()))
        .unwrap_or(0)
}

fn sw_vers_product_version() -> Option<String> {
    let out = Command::new("/usr/bin/sw_vers")
        .args(["-productVersion"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8(out.stdout).ok()?.trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn friendly_model(raw: &str) -> Option<String> {
    for (prefix, label) in MODEL_PREFIXES {
        if raw.starts_with(prefix) {
            return Some((*label).to_string());
        }
    }
    None
}

fn lookup_gpu_cores(chip: &str) -> Option<u8> {
    for (key, cores) in GPU_CORES_BY_CHIP {
        if chip == *key || chip.starts_with(&format!("{key} ")) {
            return Some(*cores);
        }
    }
    None
}

fn poll_battery() -> Option<BatterySnapshot> {
    let manager = Manager::new().ok()?;
    let mut iter = manager.batteries().ok()?;
    let battery: Battery = iter.next()?.ok()?;
    Some(BatterySnapshot {
        health_pct: Some(battery.state_of_health().get::<percent>().round() as u8),
        charge_pct: Some(battery.state_of_charge().get::<percent>().round() as u8),
        state: Some(battery.state().to_string()),
    })
}

#[allow(dead_code)]
pub fn battery_state_label(state: BatteryState) -> &'static str {
    match state {
        BatteryState::Charging => "charging",
        BatteryState::Discharging => "discharging",
        BatteryState::Full => "full",
        BatteryState::Empty => "empty",
        BatteryState::Unknown => "unknown",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn friendly_model_resolves_known_prefixes() {
        assert_eq!(friendly_model("MacBookAir10,1").as_deref(), Some("MacBook Air"));
        assert_eq!(friendly_model("MacBookPro18,1").as_deref(), Some("MacBook Pro"));
        assert_eq!(friendly_model("Macmini9,1").as_deref(), Some("Mac mini"));
        assert_eq!(friendly_model("MacPro7,1").as_deref(), Some("Mac Pro"));
        assert_eq!(friendly_model("MacStudio13,1").as_deref(), Some("Mac Studio"));
    }

    #[test]
    fn friendly_model_returns_none_for_unknown() {
        assert_eq!(friendly_model("Xenith9,1"), None);
        assert_eq!(friendly_model(""), None);
    }

    #[test]
    fn gpu_cores_lookup() {
        assert_eq!(lookup_gpu_cores("Apple M1"), Some(7));
        assert_eq!(lookup_gpu_cores("Apple M1 Pro"), Some(16));
        assert_eq!(lookup_gpu_cores("Apple M3 Max"), Some(30));
        assert_eq!(lookup_gpu_cores("Intel(R) Core(TM) i7-8559U CPU @ 2.70GHz"), None);
        assert_eq!(lookup_gpu_cores(""), None);
    }

    #[test]
    fn stats_snapshot_serializes_camel_case() {
        let mut c = StatsCollector::new();
        let stats = c.snapshot();
        let json = serde_json::to_string(&stats).unwrap();
        assert!(json.contains("\"hostLabel\":"));
        assert!(json.contains("\"totalMemoryBytes\":"));
        assert!(json.contains("\"usedMemoryBytes\":"));
        assert!(json.contains("\"totalDiskBytes\":"));
        assert!(json.contains("\"usedDiskBytes\":"));
        assert!(json.contains("\"osVersion\":"));
        assert!(json.contains("\"uptimeSecs\":"));
        assert!(json.contains("\"collectedAtMs\":"));
    }

    #[test]
    fn stats_used_memory_is_less_than_or_equal_to_total() {
        let mut c = StatsCollector::new();
        let stats = c.snapshot();
        assert!(stats.used_memory_bytes <= stats.total_memory_bytes);
    }

    #[test]
    fn stats_used_disk_is_less_than_or_equal_to_total() {
        let mut c = StatsCollector::new();
        let stats = c.snapshot();
        assert!(stats.used_disk_bytes <= stats.total_disk_bytes);
    }

    #[test]
    fn battery_state_label_is_stable() {
        assert_eq!(battery_state_label(BatteryState::Charging), "charging");
        assert_eq!(battery_state_label(BatteryState::Discharging), "discharging");
        assert_eq!(battery_state_label(BatteryState::Full), "full");
    }
}
