const { app, BrowserWindow, BrowserView, ipcMain, shell, Menu, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const liquidGlass = require('electron-liquid-glass');
const contextMenu = require('electron-context-menu').default;

// --- 全局变量 ---
let mainWindow;
let views = {};
let splitViews = {};
let activeTabId = null;
const TAB_BAR_HEIGHT = 48;

const notionThemeCSS = fs.readFileSync(path.join(__dirname, 'notion-theme.css'), 'utf8');
const FAKE_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// 创建一个可复用的函数来为视图启用右键菜单
function initializeContextMenu(view) {
  if (view && view.webContents) {
    view.disposeContextMenu = contextMenu({
      window: view,
      showInspectElement: true,
      showServices: true,
    });
  }
}

// --- 主窗口创建 ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    transparent: true,
    vibrancy: false,
    titleBarStyle: 'hidden' // [cite: Notion-App/main.js]
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.setWindowButtonVisibility(true);
    try {
      liquidGlass.addView(mainWindow.getNativeWindowHandle(), {
        tintColor: '#00000005',
        cornerRadius: 16
      });
    } catch (error) {
      console.error('Failed to apply liquid glass effect:', error);
    }
  });

  mainWindow.on('resize', resizeActiveViews);
}

// --- 核心功能函数 ---
function switchToTab(tabId) {
    if (!views[tabId]) return;
    activeTabId = tabId;

    Object.keys(views).forEach(id => {
        if (id !== activeTabId) {
            mainWindow.removeBrowserView(views[id]);
            if (splitViews[id]) {
                mainWindow.removeBrowserView(splitViews[id]);
            }
        }
    });
    
    mainWindow.addBrowserView(views[activeTabId]);
    if (splitViews[activeTabId]) {
        mainWindow.addBrowserView(splitViews[activeTabId]);
    }
    
    resizeActiveViews();
}

function resizeActiveViews() {
    if (!activeTabId || !views[activeTabId]) return;

    const contentBounds = mainWindow.getContentBounds();
    const mainView = views[activeTabId];
    const splitView = splitViews[activeTabId];

    if (splitView) {
        const halfWidth = Math.floor(contentBounds.width / 2);
        mainView.setBounds({ x: 0, y: TAB_BAR_HEIGHT, width: halfWidth, height: contentBounds.height - TAB_BAR_HEIGHT });
        splitView.setBounds({ x: halfWidth, y: TAB_BAR_HEIGHT, width: contentBounds.width - halfWidth, height: contentBounds.height - TAB_BAR_HEIGHT });
    } else {
        mainView.setBounds({ x: 0, y: TAB_BAR_HEIGHT, width: contentBounds.width, height: contentBounds.height - TAB_BAR_HEIGHT });
    }
}

function handleViewNavigation(tabId, view) {
  view.webContents.on('did-finish-load', () => {
    view.webContents.insertCSS(notionThemeCSS);
  });
  
  view.webContents.on('page-title-updated', (event, title) => {
    mainWindow.webContents.send('tab-updated', tabId, { title });
  });

  view.webContents.on('will-navigate', (event, url) => {
    const targetUrl = new URL(url);
    if (targetUrl.hostname.endsWith('notion.so') || targetUrl.hostname.endsWith('notion.com')) {
      return;
    }
    event.preventDefault();
    shell.openExternal(url);
  });
  
  view.webContents.setWindowOpenHandler(({ url }) => {
    const targetUrl = new URL(url);
    if (targetUrl.hostname.endsWith('notion.so') || targetUrl.hostname.endsWith('notion.com')) {
      ipcMain.handle('new-tab', null, url).then(newTab => {
        mainWindow.webContents.send('tab-created', newTab);
      });
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  
  view.webContents.session.on('will-download', (event, item) => {
    event.preventDefault();
    shell.openExternal(item.getURL());
  });
}

async function handleFileInject(fileType) {
  if (!activeTabId || !views[activeTabId]) {
    return dialog.showErrorBox('Error', 'No active tab to inject into.');
  }
  
  const result = await dialog.showOpenDialog(mainWindow, { 
    properties: ['openFile'], 
    filters: [{ name: fileType.toUpperCase(), extensions: [fileType] }] 
  });

  if (result.canceled || result.filePaths.length === 0) return;
  
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  const activeView = views[activeTabId];

  if (fileType === 'css') {
    activeView.webContents.insertCSS(content);
  } else if (fileType === 'js') {
    activeView.webContents.executeJavaScript(content);
  }
  
  dialog.showMessageBox(mainWindow, { message: `Successfully injected ${path.basename(filePath)}.` });
}

// --- 应用生命周期 ---
app.whenReady().then(() => {
  session.defaultSession.clearCache().then(() => {
    console.log('Application cache has been cleared.');
  });
  
  const menuTemplate = [
    {
      label: 'File', submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => { mainWindow.webContents.send('new-tab-from-menu'); }},
        { type: 'separator' }, { role: 'close' }
      ]
    }, {
      label: 'Developer', submenu: [
        { label: 'Inject Custom CSS...', click: () => handleFileInject('css') },
        { label: 'Inject Custom JS...', click: () => handleFileInject('js') },
        { type: 'separator' }, { role: 'toggleDevTools' }
      ]
    }, {
      label: 'Window', submenu: [
        { label: 'Split View', accelerator: 'CmdOrCtrl+D', click: () => { if (activeTabId) { ipcMain.emit('split-tab', null, activeTabId); } } }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC 事件监听 ---
ipcMain.handle('new-tab', async (event, url) => {
  const tabId = Date.now().toString();
  const view = new BrowserView({ 
    webPreferences: { 
      nodeIntegration: false, 
      contextIsolation: true 
    }
  });
  
  initializeContextMenu(view);
  
  view.webContents.setUserAgent(FAKE_USER_AGENT);
  
  views[tabId] = view;
  mainWindow.addBrowserView(view);
  switchToTab(tabId);
  
  view.webContents.loadURL(url || 'https://www.notion.so');
  handleViewNavigation(tabId, view);
  
  return { id: tabId, title: 'New Tab' };
});

ipcMain.on('switch-tab', (event, tabId) => switchToTab(tabId));

ipcMain.on('close-tab', (event, tabId) => {
  const viewToClose = views[tabId];
  if (viewToClose) {
    if (typeof viewToClose.disposeContextMenu === 'function') {
      viewToClose.disposeContextMenu();
    }
    mainWindow.removeBrowserView(viewToClose);
    viewToClose.webContents.destroy();
    delete views[tabId];
  }
  
  const splitViewToClose = splitViews[tabId];
  if (splitViewToClose) {
    if (typeof splitViewToClose.disposeContextMenu === 'function') {
      splitViewToClose.disposeContextMenu();
    }
    mainWindow.removeBrowserView(splitViewToClose);
    splitViewToClose.webContents.destroy();
    delete splitViews[tabId];
  }
});

ipcMain.on('split-tab', (event, tabId) => {
  if (!views[tabId] || splitViews[tabId]) return;
  
  const splitView = new BrowserView({ 
    webPreferences: { 
      nodeIntegration: false, 
      contextIsolation: true 
    }
  });
  
  initializeContextMenu(splitView);
  
  splitView.webContents.setUserAgent(FAKE_USER_AGENT);
  
  splitViews[tabId] = splitView;
  mainWindow.addBrowserView(splitView);
  splitView.webContents.loadURL(views[tabId].webContents.getURL());
  handleViewNavigation(tabId + '-split', splitView);
  
  resizeActiveViews();
});