use std::collections::HashSet;

use crate::proto::PortEntry;

#[derive(Default)]
pub struct Diff {
    prev: Option<Vec<PortEntry>>,
}

pub struct Delta {
    pub added: Vec<PortEntry>,
    pub removed: Vec<PortEntry>,
}

impl Diff {
    pub fn new() -> Self {
        Self { prev: None }
    }

    pub fn is_first(&self) -> bool {
        self.prev.is_none()
    }

    pub fn update(&mut self, next: Vec<PortEntry>) -> Delta {
        if self.prev.is_none() {
            self.prev = Some(next);
            return Delta {
                added: Vec::new(),
                removed: Vec::new(),
            };
        }
        let prev = self.prev.replace(next).unwrap_or_default();
        let current = self.prev.as_ref().expect("prev just replaced");

        let prev_keys: HashSet<_> = prev.iter().map(PortEntry::key).collect();
        let current_keys: HashSet<_> = current.iter().map(PortEntry::key).collect();

        let added = current
            .iter()
            .filter(|p| !prev_keys.contains(&p.key()))
            .cloned()
            .collect();
        let removed = prev
            .into_iter()
            .filter(|p| !current_keys.contains(&p.key()))
            .collect();

        Delta { added, removed }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::{Category, Protocol};

    fn entry(port: u16, pid: u32) -> PortEntry {
        PortEntry {
            protocol: Protocol::Tcp,
            local_addr: "*".into(),
            local_port: port,
            remote_addr: None,
            remote_port: None,
            state: Some("LISTEN".into()),
            pid: Some(pid),
            process_name: None,
            exe: None,
            cwd: None,
            parent_pid: None,
            parent_name: None,
            category: Category::UserApp,
        }
    }

    #[test]
    fn first_update_is_empty_delta() {
        let mut d = Diff::new();
        assert!(d.is_first());
        let delta = d.update(vec![entry(3000, 1)]);
        assert!(delta.added.is_empty());
        assert!(delta.removed.is_empty());
        assert!(!d.is_first());
    }

    #[test]
    fn detects_added_and_removed() {
        let mut d = Diff::new();
        d.update(vec![entry(3000, 1), entry(8080, 2)]);
        let delta = d.update(vec![entry(8080, 2), entry(5432, 3)]);
        assert_eq!(delta.added.len(), 1);
        assert_eq!(delta.added[0].local_port, 5432);
        assert_eq!(delta.removed.len(), 1);
        assert_eq!(delta.removed[0].local_port, 3000);
    }

    #[test]
    fn pid_change_counts_as_remove_plus_add() {
        let mut d = Diff::new();
        d.update(vec![entry(3000, 1)]);
        let delta = d.update(vec![entry(3000, 9)]);
        assert_eq!(delta.added.len(), 1);
        assert_eq!(delta.removed.len(), 1);
    }

    #[test]
    fn identical_scan_produces_empty_delta() {
        let mut d = Diff::new();
        d.update(vec![entry(3000, 1)]);
        let delta = d.update(vec![entry(3000, 1)]);
        assert!(delta.added.is_empty());
        assert!(delta.removed.is_empty());
    }
}
