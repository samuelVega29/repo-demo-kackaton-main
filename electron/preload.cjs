const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('scapderDesktop', {
  apiBaseUrl: 'http://127.0.0.1:8000',
})
