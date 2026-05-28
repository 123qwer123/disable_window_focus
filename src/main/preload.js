const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取所有窗口
  getWindows: () => ipcRenderer.invoke('get-windows'),
  
  // 禁用窗口焦点
  disableFocus: (windowInfo) => ipcRenderer.invoke('disable-focus', windowInfo),
  
  // 恢复窗口焦点
  enableFocus: (windowInfo) => ipcRenderer.invoke('enable-focus', windowInfo),
  
  // 批量禁用焦点
  batchDisableFocus: (windowList) => ipcRenderer.invoke('batch-disable-focus', windowList),
  
  // 批量恢复焦点
  batchEnableFocus: (windowList) => ipcRenderer.invoke('batch-enable-focus', windowList),
  
  // 获取已保存的禁用规则
  getDisabledRules: () => ipcRenderer.invoke('get-disabled-rules'),
  
  // 删除禁用规则
  removeDisabledRule: (processName) => ipcRenderer.invoke('remove-disabled-rule', processName)
});