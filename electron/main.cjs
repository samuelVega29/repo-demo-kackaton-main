const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const path = require('path')

const API_ORIGIN = 'http://127.0.0.1:8000'
const isDev = process.argv.includes('--dev') || !app.isPackaged

let backendProcess = null
let splashWindow = null
let mainWindow = null

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}

  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((env, rawLine) => {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) return env

      const separator = line.indexOf('=')
      if (separator === -1) return env

      const key = line.slice(0, separator).trim()
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key) env[key] = value

      return env
    }, {})
}

function backendCommand() {
  if (isDev) {
    return {
      command: process.platform === 'win32' ? 'py' : 'python3',
      args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
      cwd: path.join(__dirname, '..', 'backend'),
    }
  }

  const backendExe = path.join(process.resourcesPath, 'backend', 'dist', 'scapder-backend.exe')
  if (process.platform === 'win32' && fs.existsSync(backendExe)) {
    return { command: backendExe, args: [], cwd: path.dirname(backendExe) }
  }

  return {
    command: process.platform === 'win32' ? 'py' : 'python3',
    args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
    cwd: path.join(process.resourcesPath, 'backend'),
  }
}

function startBackend() {
  const runtimeRoot = isDev ? path.join(__dirname, '..') : process.resourcesPath
  const runtimeEnv = {
    ...process.env,
    ...readDotEnv(path.join(process.resourcesPath || '', '.env')),
    ...readDotEnv(path.join(process.resourcesPath || '', 'backend', '.env')),
    ...readDotEnv(path.join(__dirname, '..', 'backend', '.env')),
    SCAPDER_DESKTOP: '1',
    SCAPDER_ROOT: runtimeRoot,
    SCAPDER_BACKEND_ROOT: isDev ? path.join(runtimeRoot, 'backend') : path.join(process.resourcesPath, 'backend'),
  }

  const command = backendCommand()
  backendProcess = spawn(command.command, command.args, {
    cwd: command.cwd,
    env: runtimeEnv,
    windowsHide: true,
    stdio: isDev ? 'inherit' : 'ignore',
  })

  backendProcess.on('error', (error) => {
    dialog.showErrorBox(
      'No se pudo iniciar Scapder',
      `No fue posible levantar el backend local.\n\n${error.message}`
    )
  })
}

function waitForBackend(timeoutMs = 45000) {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const ping = () => {
      const request = http.get(`${API_ORIGIN}/api/health`, (response) => {
        response.resume()
        if (response.statusCode === 200) {
          resolve()
        } else {
          retry()
        }
      })

      request.on('error', retry)
      request.setTimeout(1200, () => {
        request.destroy()
        retry()
      })
    }

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('El backend no respondio a tiempo en 127.0.0.1:8000.'))
        return
      }

      setTimeout(ping, 650)
    }

    ping()
  })
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 520,
    height: 620,
    frame: false,
    resizable: false,
    show: true,
    backgroundColor: '#f7f8fb',
  })

  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: '#f7f8fb',
    title: 'Scapder',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
    mainWindow.show()
  })
}

app.whenReady().then(async () => {
  createSplashWindow()
  startBackend()

  try {
    await waitForBackend()
    createMainWindow()
  } catch (error) {
    dialog.showErrorBox('Scapder no pudo iniciar', error.message)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill()
  }
})
