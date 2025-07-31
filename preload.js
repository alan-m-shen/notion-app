const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Renderer -> Main
  newTab: (url) => ipcRenderer.invoke('new-tab', url),
  switchTab: (tabId) => ipcRenderer.send('switch-tab', tabId),
  closeTab: (tabId) => ipcRenderer.send('close-tab', tabId),
  injectUserFile: (fileType) => ipcRenderer.invoke('inject-user-file', fileType),
  splitTab: (tabId) => ipcRenderer.send('split-tab', tabId),

  // Main -> Renderer
  onTabCreated: (callback) => ipcRenderer.on('tab-created', (_event, tab) => callback(tab)),
  onTabUpdated: (callback) => ipcRenderer.on('tab-updated', (_event, tabId, details) => callback(tabId, details)),
});