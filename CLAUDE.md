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

**Auto-refresh:** Both panes poll every 1 second via silent background fetches. Polling returns `null` during transient states (abort/reconnect) so the UI keeps showing previous entries instead of flashing empty.

**Concurrent transfers:** Uses a session pool model — up to `maxConcurrentTransfers` (default 6, configurable 1–10 in settings) sftp sessions created lazily and reused across transfers. The main browsing session is never used for transfers. Folder transfers are decomposed into individual file-level work items distributed across pool sessions. Directory structure is created upfront (local via `fs.mkdir`, remote via a pool session) before distributing file work.

**Transfer cancellation:** For the main browsing session: kills the PTY and reconnects transparently. Uses a generation counter on the PTY to prevent stale `onExit`/`onData` handlers from corrupting the new connection. Disposes the old data listener before killing to prevent `detectDisconnection` from firing on the dying process's output. A 500ms delay between kill and reconnect avoids server-side connection rejection. For transfer sessions: removes pending work items from the queue, kills active pool sessions working on that transfer (discards from pool). Cleanup behavior is configurable via `cancelCleanup` setting: `remove-partial` (default) keeps completed files and only deletes in-flight partial files, `remove-all` deletes the entire destination. Single-file transfers always delete the partial file regardless of setting.

**Folder transfer progress:** Pre-scans all files recursively to get total bytes before starting the transfer. Tracks cumulative `completedBytes` as each file completes, showing `completedBytes/totalBytes` percent.

**Settings:** Stored in `%APPDATA%/sftp-gui/config.json` alongside remembered users and window state. Currently supports `maxConcurrentTransfers` and `cancelCleanup`. Settings panel accessible via gear icon in the toolbar.

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
│   │   │   ├── transfer-manager.ts   # Session pool, file-level work queue, concurrent transfers
│   │   │   └── transfer-item.ts
│   │   ├── local-fs.ts           # Local readdir/stat, PowerShell drive listing
│   │   └── config-store.ts       # %APPDATA%/sftp-gui/config.json (users, window state, settings)
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
│       │   │   ├── ReconnectBanner.tsx   # Connection-lost banner with reconnect button
│       │   │   ├── Modal.tsx            # Reusable modal backdrop with escape/click-outside
│       │   │   ├── ConfirmDialog.tsx    # Styled delete confirmation dialog
│       │   │   ├── OverwriteDialog.tsx  # Transfer overwrite warning with file list
│       │   │   └── SettingsModal.tsx   # Settings panel (max concurrent transfers, cancel cleanup)
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
- Folder transfer progress tracking (total bytes across all nested files)
- Transfer cancellation with configurable cleanup (keep completed files or remove all)
- Concurrent transfers via session pool (configurable 1–10 parallel sftp sessions)
- Overwrite conflict detection with deep file scanning and confirmation modal
- Right-click context menu with delete for both local and remote panes
- Recursive remote folder delete (sftp has no `rm -r`)
- SSH config + known_hosts parsing with searchable host list
- Host key verification dialog on first connect
- Remembered usernames per host
- Styled modal dialogs (delete confirmation, overwrite warning)
- Animated toast notifications for errors
- Auto-reconnect banner on unexpected disconnection
- Window size/position remembered across sessions
- File type icons (code, images, archives, media, etc.)
- Sortable columns (name, size, modified) with directories-first ordering
