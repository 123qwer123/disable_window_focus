# 窗口焦点管理器 (disable_window_focus)

一款跨平台的桌面应用程序，用于禁用指定窗口的焦点获取功能，防止后台程序抢夺焦点干扰工作。

## 功能特性

### 核心功能

- **窗口扫描**：自动扫描所有运行中的窗口程序，获取窗口标题、进程ID、进程名称、窗口句柄、类名等信息
- **关键字搜索**：根据窗口标题或进程名关键字快速过滤定位目标窗口
- **焦点禁用/恢复**：一键禁用或恢复指定窗口的焦点获取能力
- **多选批量操作**：支持批量勾选多个窗口同时进行禁用/恢复操作
- **状态标识**：实时显示窗口焦点状态（已禁用/正常）

### 界面功能

- **分类列表展示**：提供四个标签页分类展示
    - 全部窗口：显示所有扫描到的窗口
    - 已禁用：仅显示已被禁用焦点的窗口
    - 正常：仅显示正常的窗口
    - 禁用规则：显示持久化的禁用规则列表
- **可自定义列显示**：右键点击表头列名，弹出菜单可勾选/取消勾选来控制列的显示与隐藏
- **列信息展示**（按顺序）：
    - 窗口标题
    - 进程ID
    - 进程名称
    - 窗口句柄
    - 类名
    - 状态
    - 操作

### 自动化功能

- **自动监控**：定时扫描窗口列表（每 5 秒），监控已禁用程序的状态
- **重启自动禁用**：当已禁用的程序重启后，自动应用禁用规则继续阻止焦点获取
- **规则持久化**：保存禁用规则到本地存储，应用启动时自动加载

## 技术架构

- **框架**：Electron + React
- **UI 组件**：Ant Design
- **构建工具**：Vite + Electron Builder
- **数据存储**：electron-store
- **窗口管理**：
    - Windows: PowerShell + Win32 API (通过 Base64 编码命令执行)
    - macOS: AppleScript
    - Linux: wmctrl

## 项目结构

```
disable_window_focus/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.js          # 主进程入口，IPC 处理
│   │   ├── preload.js        # 预加载脚本，暴露安全 API
│   │   └── windowManager.js  # 窗口管理核心逻辑
│   └── renderer/             # React 渲染进程
│       ├── App.jsx           # 主应用组件
│       ├── App.css           # 样式文件
│       ├── index.html        # HTML 入口
│       └── main.jsx          # React 入口
├── public/                   # 静态资源
├── package.json              # 项目配置
└── vite.config.js            # Vite 配置
```

## 安装与运行

### 环境要求

- Node.js >= 18
- npm 或 yarn
- Windows: PowerShell 5.0+

### 开发模式

```bash
# 安装依赖
npm install

# 启动开发服务器（需要分别启动渲染进程和主进程）
npm run dev:renderer    # 启动 Vite 开发服务器
npm run dev:main        # 启动 Electron 主进程

# 或者一键启动
npm run dev
```

### 生产构建

```bash
# 构建应用
npm run build

# 打包可执行文件
npm run dist          # 全平台
npm run dist:win      # Windows (.exe)
npm run dist:mac      # macOS (.dmg)
npm run dist:linux    # Linux (.AppImage)
```

## 使用说明

### 基本操作

1. **扫描窗口**：启动应用后自动扫描所有运行中的窗口，点击「刷新」按钮可手动刷新
2. **搜索过滤**：在搜索框输入关键字快速定位目标窗口（支持窗口标题和进程名搜索）
3. **禁用焦点**：
    - 单个禁用：点击窗口行的「禁用」按钮
    - 批量禁用：勾选多个窗口后点击「批量禁用」
4. **恢复焦点**：
    - 单个恢复：在已禁用列表中点击「恢复」按钮
    - 批量恢复：勾选多个后点击「批量恢复」

### 列显示设置

- **右键菜单**：在表格表头任意列名上右键点击，弹出列设置菜单
- **显示/隐藏列**：勾选表示显示该列，取消勾选表示隐藏该列
- **操作列**：操作列不可隐藏，始终显示

### 管理禁用规则

- 在「禁用规则」标签页查看所有持久化的禁用规则
- 点击「删除」按钮可移除规则，之后程序重启将不再自动禁用

## 工作原理

### Windows 平台

使用 Win32 API 设置窗口扩展样式 `WS_EX_NOACTIVATE` (0x08000000)，阻止窗口获取焦点。

```powershell
# 核心原理：设置窗口样式
$WS_EX_NOACTIVATE = 0x08000000
$GWL_EXSTYLE = -20

# 获取当前样式
$currentStyle = GetWindowLong($handle, $GWL_EXSTYLE)

# 添加 WS_EX_NOACTIVATE 标志
$newStyle = $currentStyle | $WS_EX_NOACTIVATE
SetWindowLong($handle, $GWL_EXSTYLE, $newStyle)

# 刷新窗口
SetWindowPos($handle, 0, 0, 0, 0, 0, $SWP_FRAMECHANGED | $SWP_NOMOVE | $SWP_NOSIZE | $SWP_NOZORDER)
```

**执行方式**：使用 PowerShell `-EncodedCommand` 参数执行 Base64 编码的脚本，避免编码问题。

### macOS 平台

使用 AppleScript 调用 System Events 获取窗口列表（暂不支持禁用焦点）。

### Linux 平台

使用 wmctrl 命令获取和设置窗口属性。

## 注意事项

1. **权限要求**：应用需要足够权限来操作其他程序的窗口
2. **Windows 限制**：某些系统窗口或特权窗口可能无法被禁用
3. **程序重启**：被禁用的程序重启后会自动重新应用禁用规则
4. **编码支持**：已解决中文窗口标题的编码显示问题

## 许可证

ISC License