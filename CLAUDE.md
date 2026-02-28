# SFTP GUI

Lightweight Electron + React app that wraps the system's `sftp.exe` binary directly, inheriting OpenSSH 10.0's post-quantum KEX, keys, and config automatically. No bundled SSH library.

## Tech Stack

- Electron 40 + electron-vite 4 (vite 6)
- React 19 + TypeScript
- Tailwind CSS v4 (dark mode only)
- node-pty (pseudo-terminal for sftp interaction)
- framer-motion (animations, toast/list transitions)
- ssh-config (parse ~/.ssh/config — pure JS, no SSH impl)
- strip-ansi, uuid, lucide-react

## Architecture

**SFTP binary communication** via sentinel-based protocol:
1. Spawn `sftp` interactively via `node-pty`
2. Send command to stdin (e.g., `ls -la /path`)
3. Follow with sentinel: `!echo __DONE_<uuid>__`
4. Buffer output until sentinel appears, then parse

**Auth:** Key-based only (via ssh-agent). No password/passphrase handling. Password prompts are detected and rejected with an error.

**Environment:** `LC_ALL=C` and pty columns=500 for clean, unwrapped English output.

**Binary discovery:** Checks known paths first (prefers `C:\Program Files\OpenSSH\sftp.exe` for post-quantum), then falls back to `where sftp.exe`.

**Auto-refresh:** Both panes poll every 1 second via silent background fetches. Polling errors are swallowed to avoid toast spam.

## Project Structure

```
sftp-gui/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml          # Portable .exe target
├── tsconfig.json / .node.json / .web.json
├── src/
│   ├── main/                     # Electron main process
│   │   ├── index.ts              # Window creation, IPC, CSP, window state persistence
│   │   ├── ipc-handlers.ts       # All IPC handlers with input validation
│   │   ├── sftp/
│   │   │   ├── session.ts        # SftpSession: pty spawn, sentinel protocol, command queue
│   │   │   ├── output-parser.ts  # Parse ls output, progress, prompt detection
│   │   │   ├── ssh-config-reader.ts  # Parse ~/.ssh/config + known_hosts
│   │   │   ├── binary-finder.ts  # Find sftp.exe on system (execFileSync, no shell)
│   │   │   └── types.ts
│   │   ├── transfers/
│   │   │   ├── transfer-manager.ts   # Queue, progress, cancel
│   │   │   └── transfer-item.ts
│   │   ├── local-fs.ts           # Local readdir/stat, PowerShell drive listing
│   │   └── config-store.ts       # %APPDATA%/sftp-gui/config.json (users, window state)
│   ├── preload/
│   │   └── index.ts              # contextBridge API (scoped, typed)
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx               # Routes between ConnectionScreen and FileBrowser, wires toasts
│       ├── globals.css           # Tailwind v4 theme, custom scrollbar
│       ├── hooks/
│       │   ├── use-sftp.ts       # Remote connection, auto-refresh, reconnect state
│       │   ├── use-local-fs.ts   # Local browsing, auto-refresh
│       │   ├── use-transfers.ts  # Transfer progress tracking
│       │   ├── use-drag-drop.ts  # Cross-pane drag-and-drop
│       │   └── use-toasts.ts     # Transient error/info/success toasts
│       ├── components/
│       │   ├── ui/
│       │   │   ├── ToastContainer.tsx    # Animated toast stack (bottom-right)
│       │   │   └── ReconnectBanner.tsx   # Connection-lost banner with reconnect button
│       │   ├── connection/
│       │   │   ├── ConnectionScreen.tsx
│       │   │   ├── HostList.tsx
│       │   │   ├── HostEntry.tsx
│       │   │   ├── ConnectionForm.tsx
│       │   │   └── HostKeyDialog.tsx
│       │   ├── browser/
│       │   │   ├── FileBrowser.tsx     # Dual-pane layout, splitter, keyboard shortcuts
│       │   │   ├── FilePane.tsx        # Reusable pane (local or remote)
│       │   │   ├── PathBreadcrumb.tsx  # Click-to-navigate breadcrumbs, Ctrl+L editable input
│       │   │   ├── FileRow.tsx         # File entry with type-colored icons
│       │   │   └── ColumnHeader.tsx    # Sortable column header
│       │   └── transfers/
│       │       ├── TransferPanel.tsx
│       │       ├── TransferRow.tsx
│       │       └── TransferControls.tsx
│       ├── lib/
│       │   ├── api.ts            # Typed wrapper around window.electronAPI
│       │   ├── format.ts         # File size, date formatting
│       │   └── sort.ts           # Sortable file entries (dirs first)
│       └── types/
│           └── index.ts
```

## Commands

```bash
pnpm dev        # Start in development mode with hot-reload
pnpm build      # Build for production
pnpm package    # Build portable .exe (outputs to dist/)
pnpm typecheck  # Type-check without emitting
```

## Keyboard Shortcuts (in file browser)

| Key | Action |
|-----|--------|
| F5 | Refresh active pane |
| Backspace | Navigate up one directory |
| Ctrl+L | Focus path bar as editable text input |
| Tab | Switch active pane (local/remote) |

## Security Hardening

The following security measures are in place (from a formal audit):

- **sandbox: true** — renderer process is sandboxed
- **contextIsolation: true, nodeIntegration: false** — no Node.js in renderer
- **Content Security Policy** — `default-src 'self'` set via `onHeadersReceived`
- **Scoped preload API** — only named IPC methods exposed via `contextBridge`
- **IPC input validation** — all handlers validate `unknown` inputs (type, control chars, allowlists)
- **Path escaping** — `escapePath()` rejects control characters, escapes quotes/backslashes, always double-quotes
- **Host/username validation** — regex allowlists prevent SSH argument injection
- **URL validation** — `shell.openExternal()` restricted to `https:`/`http:` protocols
- **No shell interpretation** — `execFileSync` used instead of `execSync` everywhere
- **Password auth rejected** — detects password/passphrase prompts and refuses with a clear error

## Supply Chain Security

- **Exact versions only**: All dependencies in `package.json` must use exact versions (no `^` or `~` prefixes). This prevents silent upgrades via transitive lockfile changes and reduces supply chain attack surface.
- **Review before upgrading**: When upgrading a dependency, verify the new version against the npm registry and changelog before changing the pinned version.

## Key Design Decisions

- **node-pty over child_process**: sftp requires a TTY for interactive prompts
- **strip-ansi excluded from externalization**: ESM-only package, must be bundled in main process
- **No `path` module in renderer**: Renderer is browser context, uses `winJoin`/`winDirname` string helpers
- **PowerShell for drive listing**: `wmic` is deprecated on Win11
- **vite 6 pinned**: vite 7 has compatibility issues with electron-vite's externalization plugin
- **1s polling for auto-refresh**: Silent background fetches with guard against overlapping requests
- **Window state persistence**: Bounds saved to config on close, validated against active displays on restore

## Features

- Dual-pane file browser (local left, remote right) with draggable splitter
- Drag-and-drop transfers between panes with progress bars, speed, ETA
- SSH config + known_hosts parsing with searchable host list
- Host key verification dialog on first connect
- Remembered usernames per host
- Animated toast notifications for errors
- Auto-reconnect banner on unexpected disconnection
- Window size/position remembered across sessions
- File type icons (code, images, archives, media, etc.)
- Sortable columns (name, size, modified) with directories-first ordering
