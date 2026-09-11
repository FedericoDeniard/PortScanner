#[cfg(unix)]
pub fn kill_process(pid: u32, sigkill: bool) -> Result<(), String> {
    let sig = if sigkill {
        libc::SIGKILL
    } else {
        libc::SIGTERM
    };
    let res = unsafe { libc::kill(pid as libc::pid_t, sig) };
    if res == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error().to_string())
    }
}

#[cfg(windows)]
pub fn kill_process(pid: u32, _sigkill: bool) -> Result<(), String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, TerminateProcess, PROCESS_TERMINATE,
    };

    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if handle.is_null() {
            return Err(format!(
                "OpenProcess({pid}) failed: {}",
                std::io::Error::last_os_error()
            ));
        }
        let ok = TerminateProcess(handle, 1);
        CloseHandle(handle);
        if ok == 0 {
            Err(format!(
                "TerminateProcess({pid}) failed: {}",
                std::io::Error::last_os_error()
            ))
        } else {
            Ok(())
        }
    }
}
