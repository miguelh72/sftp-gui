import { app, BrowserWindow, shell, screen } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc-handlers'
import { getWindowState, setWindowState } from './config-store'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const saved = getWindowState()

  // Validate saved position is still on a visible display
  let x = saved?.x
  let y = saved?.y
  if (x !== undefined && y !== undefined) {
    const displays = screen.getAllDisplays()
    const onScreen = displays.some(d => {
      const b = d.bounds
      return x! >= b.x && x! < b.x + b.width && y! >= b.y && y! < b.y + b.height
    })
    if (!onScreen) {
      x = undefined
      y = undefined
    }
  }

  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1200,
    height: saved?.height ?? 800,
    x,
    y,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#09090b',
    titleBarStyle: 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (saved?.maximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Persist window state on close
  mainWindow.on('close', () => {
    if (!mainWindow) return
    const maximized = mainWindow.isMaximized()
    const bounds = mainWindow.getNormalBounds()
    setWindowState({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized
    })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {}
    return { action: 'deny' }
  })

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const isDev = !!process.env['ELECTRON_RENDERER_URL']
    const csp = isDev
      ? "default-src 'self' http://localhost:*; script-src 'self' 'unsafe-inline' http://localhost:*; style-src 'self' 'unsafe-inline' http://localhost:*; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data:; font-src 'self'"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
