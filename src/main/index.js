const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');
const WindowManager = require('./windowManager');

// 初始化持久化存储
const store = new Store();

// 窗口管理器实例
let windowManager = null;

// 系统托盘实例
let tray = null;

// 禁用规则存储 key
const DISABLED_RULES_KEY = 'disabledRules';

// 是否正在退出
let isQuitting = false;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: '窗口焦点管理器'
  });

  // 开发环境加载 vite 开发服务器
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  // 点击关闭按钮时隐藏窗口而不是退出
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.setToolTip('窗口焦点管理器 - 正在后台监控');
      }
    }
  });

  // 窗口关闭后的清理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 初始化窗口管理器
  windowManager = new WindowManager();
  
  // 启动窗口监控
  startWindowMonitoring();
}

// 创建系统托盘
function createTray() {
  // 创建托盘图标（使用简单的图标或创建默认图标）
  const iconPath = path.join(__dirname, '../../public/icon.png');
  let trayIcon;
  
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      // 如果图标文件不存在，创建一个简单的默认图标
      trayIcon = nativeImage.createEmpty();
    }
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }
  
  tray = new Tray(trayIcon);
  tray.setToolTip('窗口焦点管理器 - 正在监控');
  
  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: '刷新窗口列表',
      click: async () => {
        if (mainWindow) {
          mainWindow.webContents.send('refresh-windows');
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出程序',
      click: () => {
        isQuitting = true;
        tray.destroy();
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // 点击托盘图标显示窗口
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
}

// 获取所有窗口
ipcMain.handle('get-windows', async () => {
  try {
    const windows = await windowManager.getAllWindows();
    const disabledRules = store.get(DISABLED_RULES_KEY) || [];
    
    // 确保返回数组
    if (!Array.isArray(windows)) {
      return [];
    }
    
    return windows.map(win => ({
      ...win,
      isDisabled: disabledRules.some(rule => 
        rule.processName === win.processName || 
        win.title.includes(rule.keyword)
      ) || win.isDisabled
    }));
  } catch (error) {
    // Failed to get window list
    return [];
  }
});

// 禁用窗口焦点
ipcMain.handle('disable-focus', async (event, windowInfo) => {
  try {
    const result = await windowManager.disableFocus(windowInfo);
    if (result) {
      // 保存禁用规则
      const disabledRules = store.get(DISABLED_RULES_KEY) || [];
      const existingRule = disabledRules.find(r => 
        r.processName === windowInfo.processName
      );
      
      if (!existingRule) {
        disabledRules.push({
          processName: windowInfo.processName,
          keyword: windowInfo.title,
          disabledAt: new Date().toISOString()
        });
        store.set(DISABLED_RULES_KEY, disabledRules);
      }
    }
    return result;
  } catch (error) {
    // Failed to disable focus
    return false;
  }
});

// 恢复窗口焦点
ipcMain.handle('enable-focus', async (event, windowInfo) => {
  try {
    const result = await windowManager.enableFocus(windowInfo);
    if (result) {
      // 移除禁用规则
      const disabledRules = store.get(DISABLED_RULES_KEY) || [];
      const filteredRules = disabledRules.filter(r => 
        r.processName !== windowInfo.processName
      );
      store.set(DISABLED_RULES_KEY, filteredRules);
    }
    return result;
  } catch (error) {
    // Failed to restore focus
    return false;
  }
});

// 批量禁用焦点
ipcMain.handle('batch-disable-focus', async (event, windowList) => {
  const results = [];
  for (const win of windowList) {
    const result = await windowManager.disableFocus(win);
    if (result) {
      // 保存禁用规则
      const disabledRules = store.get(DISABLED_RULES_KEY) || [];
      const existingRule = disabledRules.find(r => r.processName === win.processName);
      if (!existingRule) {
        disabledRules.push({
          processName: win.processName,
          keyword: win.title,
          disabledAt: new Date().toISOString()
        });
        store.set(DISABLED_RULES_KEY, disabledRules);
      }
    }
    results.push({ ...win, success: result });
  }
  return results;
});

// 批量恢复焦点
ipcMain.handle('batch-enable-focus', async (event, windowList) => {
  const results = [];
  for (const win of windowList) {
    const result = await windowManager.enableFocus(win);
    if (result) {
      // 移除禁用规则
      const disabledRules = store.get(DISABLED_RULES_KEY) || [];
      const filteredRules = disabledRules.filter(r => r.processName !== win.processName);
      store.set(DISABLED_RULES_KEY, filteredRules);
    }
    results.push({ ...win, success: result });
  }
  return results;
});

// 获取已保存的禁用规则
ipcMain.handle('get-disabled-rules', async () => {
  return store.get(DISABLED_RULES_KEY) || [];
});

// 删除禁用规则
ipcMain.handle('remove-disabled-rule', async (event, processName) => {
  const disabledRules = store.get(DISABLED_RULES_KEY) || [];
  const filteredRules = disabledRules.filter(r => r.processName !== processName);
  store.set(DISABLED_RULES_KEY, filteredRules);
  return true;
});

// 窗口监控 - 自动应用禁用规则
function startWindowMonitoring() {
  setInterval(async () => {
    try {
      const disabledRules = store.get(DISABLED_RULES_KEY) || [];
      if (disabledRules.length === 0) return;

      const windows = await windowManager.getAllWindows();
      if (!Array.isArray(windows)) return;
      
      for (const win of windows) {
        const matchedRule = disabledRules.find(rule => 
          rule.processName === win.processName ||
          win.title.includes(rule.keyword)
        );
        
        // WindowManager 内部会检查进程ID和句柄，避免重复禁用
        if (matchedRule) {
          await windowManager.disableFocus(win);
        }
      }
    } catch (error) {
      // 静默处理错误，避免频繁输出
    }
  }, 1000);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// macOS 关闭窗口不退出程序
app.on('window-all-closed', (event) => {
  // 阻止默认退出行为，程序继续在后台运行
  event.preventDefault();
});

// 真正退出前清理
app.on('before-quit', () => {
  isQuitting = true;
  if (tray) {
    tray.destroy();
  }
});