# SFTP GUI

Lightweight dual-pane file manager for SFTP, built with Electron and React.

## Why?

Most graphical SFTP clients — [WinSCP](https://winscp.net/), [FileZilla](https://filezilla-project.org/), [Cyberduck](https://cyberduck.io/), [MobaXterm](https://mobaxterm.mobatek.net/) — bundle their own SSH implementation. This means:

- **You can't enforce your own SSH security policies.** If you configure `~/.ssh/config` to require post-quantum key exchange algorithms (e.g., `mlkem768x25519-sha256`), a bundled SSH library won't respect that. Your GUI client silently falls back to weaker defaults.
- **You inherit their supply chain.** A bundled libssh, libssh2, or PuTTY backend is another dependency you don't control. If a vulnerability is found, you wait for the GUI vendor to patch and release — instead of just updating OpenSSH on your system.
- **Your SSH config is ignored.** Host aliases, identity files, proxy jumps, and other `~/.ssh/config` directives often don't carry over to bundled implementations, forcing you to duplicate configuration.

SFTP GUI takes a different approach: it wraps your system's `sftp` binary directly via a pseudo-terminal. Your OpenSSH installation handles all cryptography, key exchange, and authentication. The GUI is just a file browser on top.

This means you get OpenSSH 10.0's post-quantum KEX, your `~/.ssh/config` settings, your ssh-agent keys, and your `known_hosts` trust — all automatically, with no extra supply chain dependencies.

## Features

- Dual-pane file browser (local left, remote right) with draggable splitter
- Drag-and-drop transfers with progress bars, speed, and ETA
- SSH config and known_hosts parsing with searchable host list
- Host key verification dialog on first connect
- Key-based auth only (via ssh-agent) — no password handling
- Auto-reconnect on unexpected disconnection
- Window size and position remembered across sessions

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with the C++ workload and Spectre-mitigated libs (required by `node-pty`). Install Build Tools first via winget, then add the workload from an **admin PowerShell**:
  ```powershell
  winget install -e --id Microsoft.VisualStudio.BuildTools
  Start-Process -Wait -Verb RunAs -FilePath "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vs_installer.exe" -ArgumentList 'install --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre --includeRecommended --passive'
  ```
- OpenSSH with `sftp.exe` on PATH (included with Windows 10+, or install [Win32-OpenSSH](https://github.com/PowerShell/Win32-OpenSSH))

## Build

```bash
pnpm install
pnpm build       # Compile to out/
pnpm package     # Package portable .exe to dist/
```

The portable zip is written to `dist/sftp-gui-portable.zip`. Extract anywhere and run `sftp-gui.exe`.

## Development

```bash
pnpm dev         # Start with hot-reload
pnpm typecheck   # Type-check without emitting
```

## Usage

1. Launch the app and select a host from your SSH config, or enter a hostname and username manually.
2. The app connects using your system's `sftp.exe` and ssh-agent for key-based authentication.
3. Browse files in the dual-pane view — local files on the left, remote on the right.
4. Drag and drop files between panes to transfer.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F5 | Refresh active pane |
| Backspace | Navigate up one directory |
| Ctrl+L | Focus path bar as editable input |
| Tab | Switch active pane |

## Contributing

This was built as a personal tool to solve a specific need. If you run into any problems or have improvements, feel free to submit a PR and I'll try to review it quickly.

Note: I've only tested on Windows 10 and 11 so far, so there are no guarantees on other operating systems.
