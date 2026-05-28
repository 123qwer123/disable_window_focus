const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs');

/**
 * 窗口管理器类
 * 使用 PowerShell 和系统命令实现跨平台窗口管理
 */
class WindowManager {
  constructor() {
    this.platform = process.platform;
    this.disabledHandles = new Set();
    // 记录已禁用的进程ID和其对应的窗口句柄
    // Map<processId, handle> - 用于判断是否需要重新禁用
    this.disabledProcesses = new Map();
    // 记录每个进程最后被禁用的时间戳，用于定时重新禁用（捕获新弹出的子窗口）
    this.disabledTimestamps = new Map();
  }
  
  /**
   * 检查进程是否已被禁用且窗口句柄未变化
   * @param {number} processId - 进程ID
   * @param {string} handle - 当前窗口句柄
   * @returns {boolean} - true表示已禁用且无需重新禁用
   */
  isProcessAlreadyDisabled(processId, handle) {
    const savedHandle = this.disabledProcesses.get(processId);
    // 如果进程ID已记录且句柄相同，检查是否需要定时重新禁用（捕获新弹出的子窗口）
    if (savedHandle === handle) {
      const lastDisabled = this.disabledTimestamps.get(processId) || 0;
      const now = Date.now();
      // 每15秒强制重新禁用一次，确保新弹出的子窗口/弹窗也被禁用
      if (now - lastDisabled < 15000) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * 清除已禁用的进程记录
   * @param {number} processId - 进程ID
   */
  clearProcessDisabled(processId) {
    const handle = this.disabledProcesses.get(processId);
    if (handle) {
      this.disabledHandles.delete(handle);
    }
    this.disabledProcesses.delete(processId);
    this.disabledTimestamps.delete(processId);
  }
  
  /**
   * 记录已禁用的进程
   * @param {number} processId - 进程ID
   * @param {string} handle - 窗口句柄
   */
  markProcessDisabled(processId, handle) {
    this.disabledHandles.add(handle);
    this.disabledProcesses.set(processId, handle);
    this.disabledTimestamps.set(processId, Date.now());
  }

  /**
   * 执行 PowerShell 脚本文件
   */
  async execPsScript(scriptContent) {
    try {
      // 使用 Base64 编码命令避免编码问题
      const encodedScript = Buffer.from(scriptContent, 'utf16le').toString('base64');
      
      const { stdout, stderr } = await execPromise(
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand "${encodedScript}"`,
        {
          maxBuffer: 1024 * 1024 * 10,
          timeout: 15000,
          encoding: 'utf8',
          windowsHide: true
        }
      );
      
      return { stdout: stdout.trim(), stderr, success: true };
    } catch (error) {
      console.error('PowerShell exec failed:', error.message);
      return { stdout: '', stderr: error.message, success: false, error };
    }
  }

  /**
   * 获取所有运行中的窗口
   */
  async getAllWindows() {
    switch (this.platform) {
      case 'win32':
        return await this.getWindowsWindows();
      case 'darwin':
        return await this.getMacWindows();
      case 'linux':
        return await this.getLinuxWindows();
      default:
        return [];
    }
  }

  /**
   * Windows 平台获取窗口列表
   */
  async getWindowsWindows() {
    try {
      const script = `
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$GWL_EXSTYLE = -20
$WS_EX_NOACTIVATE = 0x08000000

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll", CharSet=CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool EnableWindow(IntPtr hWnd, bool bEnable);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool LockSetForegroundWindow(uint uLockCode);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll")]
    public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, ref uint pvParam, uint fWinIni);
    [DllImport("user32.dll")]
    public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
    public const uint GW_OWNER = 4;
    public const uint SPI_GETFOREGROUNDLOCKTIMEOUT = 0x2000;
    public const uint SPI_SETFOREGROUNDLOCKTIMEOUT = 0x2001;
    public const uint SPIF_SENDCHANGE = 0x02;
    public const uint SPIF_UPDATEINIFILE = 0x01;
}
"@

$windows = [System.Collections.Generic.List[PSCustomObject]]::new()
$callback = {
    param($hWnd, $lParam)
    $pid = 0
    [WinAPI]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
        $titleLen = [WinAPI]::GetWindowTextLength($hWnd)
        $titleBuilder = New-Object System.Text.StringBuilder([Math]::Max($titleLen + 1, 256))
        [WinAPI]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
        $title = $titleBuilder.ToString()
        if (-not $title) { $title = $proc.ProcessName }
        $classNameBuilder = New-Object System.Text.StringBuilder(256)
        [WinAPI]::GetClassName($hWnd, $classNameBuilder, 256) | Out-Null
        $className = $classNameBuilder.ToString()
        $exStyle = 0
        try {
            $exStyle = [WinAPI]::GetWindowLong($hWnd, $GWL_EXSTYLE)
        } catch {}
        $isDisabled = ($exStyle -band $WS_EX_NOACTIVATE) -ne 0
        $windows.Add([PSCustomObject]@{
            Id = $pid
            ProcessName = $proc.ProcessName
            Title = $title
            ClassName = $className
            Handle = $hWnd.ToString()
            IsDisabled = $isDisabled
        })
    }
    return $true
}
$delegate = [WinAPI+EnumWindowsProc]$callback
[WinAPI]::EnumWindows($delegate, [IntPtr]::Zero) | Out-Null
$results = $windows.ToArray()
if ($results.Count -eq 0) {
    Write-Output "[]"
} elseif ($results.Count -eq 1) {
    $results | ConvertTo-Json -Compress -Depth 2
} else {
    $results | ConvertTo-Json -Compress -Depth 2
}
`;

      const { stdout, success } = await this.execPsScript(script);
      
      if (!success || !stdout) {
        // Fallback to alternative method
        return await this.getWindowsWindowsFallback();
      }

      let jsonStr = stdout;
      if (jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
        jsonStr = '[' + jsonStr + ']';
      }

      let processes;
      try {
        processes = JSON.parse(jsonStr);
      } catch (parseError) {
        return await this.getWindowsWindowsFallback();
      }

      if (!Array.isArray(processes)) {
        processes = [processes];
      }

      return processes
        .filter(p => p.Handle !== '0')
        .map(p => ({
          id: p.Id,
          processName: p.ProcessName,
          title: p.Title,
          className: p.ClassName || '',
          handle: p.Handle,
          isDisabled: p.IsDisabled || this.disabledHandles.has(p.Handle)
        }));
    } catch (error) {
      // Failed to get Windows window list
      return await this.getWindowsWindowsFallback();
    }
  }

  /**
   * Windows 获取窗口列表的备用方案（简化版本）
   */
  async getWindowsWindowsFallback() {
    try {
      const script = `
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$processes = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 }
$results = @()

foreach ($proc in $processes) {
    $title = $proc.MainWindowTitle
    if (-not $title) { $title = $proc.ProcessName }
    $obj = [PSCustomObject]@{
        Id = $proc.Id
        ProcessName = $proc.ProcessName
        Title = $title
        ClassName = $proc.ProcessName
        Handle = $proc.MainWindowHandle.ToString()
        IsDisabled = $false
    }
    $results += $obj
}

if ($results.Count -eq 0) {
    Write-Output "[]"
} elseif ($results.Count -eq 1) {
    $results | ConvertTo-Json -Compress -Depth 2
} else {
    $results | ConvertTo-Json -Compress -Depth 2
}
`;

      const { stdout, success } = await this.execPsScript(script);
      
      if (!success || !stdout) {
        return [];
      }

      let jsonStr = stdout;
      if (jsonStr.startsWith('@{') || jsonStr.startsWith('{')) {
        jsonStr = '[' + jsonStr + ']';
      }

      let processes;
      try {
        processes = JSON.parse(jsonStr);
      } catch (e) {
        // Fallback JSON parse failed
        return [];
      }

      if (!Array.isArray(processes)) {
        processes = [processes];
      }

      return processes
        .filter(p => p.Title && p.Handle !== '0')
        .map(p => ({
          id: p.Id,
          processName: p.ProcessName,
          title: p.Title,
          className: p.ClassName || '',
          handle: p.Handle,
          isDisabled: this.disabledHandles.has(p.Handle)
        }));
    } catch (error) {
      // Fallback also failed
      return [];
    }
  }

  /**
   * macOS 平台获取窗口列表
   */
  async getMacWindows() {
    try {
      const { stdout } = await execPromise(
        `osascript -e 'tell application "System Events" to get name of every process whose background only is false'`,
        { timeout: 15000 }
      );
      
      const processNames = stdout.split(', ').filter(n => n.trim());
      return processNames.map((name, index) => ({
        id: index,
        processName: name.trim(),
        title: name.trim(),
        handle: `${index}`,
        isDisabled: false
      }));
    } catch (error) {
      // Failed to get macOS window list
      return [];
    }
  }

  /**
   * Linux 平台获取窗口列表
   */
  async getLinuxWindows() {
    try {
      const { stdout } = await execPromise('wmctrl -l', { timeout: 15000 });
      const lines = stdout.split('\n').filter(line => line.trim());

      return lines.map((line, index) => {
        const parts = line.split(/\s+/);
        const handle = parts[0];
        const title = parts.slice(3).join(' ');
        return {
          id: index,
          processName: 'unknown',
          title: title || 'Untitled',
          handle: handle,
          isDisabled: this.disabledHandles.has(handle)
        };
      });
    } catch (error) {
      // Failed to get Linux window list
      return [];
    }
  }

  /**
   * 禁用窗口焦点
   */
  async disableFocus(windowInfo) {
    try {
      switch (this.platform) {
        case 'win32':
          return await this.disableWindowsFocus(windowInfo);
        case 'darwin':
          return await this.disableMacFocus(windowInfo);
        case 'linux':
          return await this.disableLinuxFocus(windowInfo);
        default:
          return false;
      }
    } catch (error) {
      // Failed to disable focus
      return false;
    }
  }

  /**
   * Windows 平台禁用焦点 - 增强版多重防护
   */
  async disableWindowsFocus(windowInfo) {
    try {
      const handle = windowInfo.handle;
      const processId = windowInfo.id;
      
      // 检查进程是否已禁用且句柄未变化，无需重复禁用
      if (this.isProcessAlreadyDisabled(processId, handle)) {
        return true;
      }

      // 增强版脚本：多重防护机制 - 全面禁用焦点
      const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool EnableWindow(IntPtr hWnd, bool bEnable);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool LockSetForegroundWindow(uint uLockCode);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")]
    public static extern bool AllowSetForegroundWindow(uint dwProcessId);
    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, ref uint pvParam, uint fWinIni);
    [DllImport("user32.dll")]
    public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
    public const uint GW_OWNER = 4;
    public const uint SPI_GETFOREGROUNDLOCKTIMEOUT = 0x2000;
    public const uint SPI_SETFOREGROUNDLOCKTIMEOUT = 0x2001;
    public const uint SPIF_SENDCHANGE = 0x02;
    public const uint SPIF_UPDATEINIFILE = 0x01;
}
"@

$handle = [IntPtr]::new(${handle})
$processId = ${processId}
$GWL_EXSTYLE = -20
$GWL_STYLE = -16
$WS_EX_NOACTIVATE = 0x08000000
$WS_EX_TOOLWINDOW = 0x00000080
$WS_DISABLED = 0x08000000
$SWP_NOMOVE = 0x0002
$SWP_NOSIZE = 0x0001
$SWP_NOZORDER = 0x0004
$SWP_NOACTIVATE = 0x0010
$SWP_FRAMECHANGED = 0x0020
$SW_SHOWNA = 8
$LOCK_FOREGROUND_LOCK = 1

try {
    # === 1. 全局前台锁定 - 阻止所有程序化前台切换 ===
    $foregroundWindow = [WinAPI]::GetForegroundWindow()
    [WinAPI]::LockSetForegroundWindow($LOCK_FOREGROUND_LOCK) | Out-Null
    
    # 延长前台锁定超时时间到极长值，防止系统自动解锁
    $timeout = [uint32]::MaxValue
    [WinAPI]::SystemParametersInfo([WinAPI]::SPI_SETFOREGROUNDLOCKTIMEOUT, 0, [ref]$timeout, [WinAPI]::SPIF_SENDCHANGE -bor [WinAPI]::SPIF_UPDATEINIFILE) | Out-Null
    
    # === 2. 枚举并禁用该进程的所有顶层窗口（包括弹窗/子窗口） ===
    $allWindows = [System.Collections.Generic.List[IntPtr]]::new()
    $callback = {
        param($hWnd, $lParam)
        $pid = 0
        [WinAPI]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
        if ($pid -eq $processId) {
            $allWindows.Add($hWnd)
        }
        return $true
    }
    $delegate = [WinAPI+EnumWindowsProc]$callback
    [WinAPI]::EnumWindows($delegate, [IntPtr]::Zero) | Out-Null
    
    foreach ($winHandle in $allWindows) {
        # 3a. 设置扩展样式：WS_EX_NOACTIVATE（禁止激活）+ WS_EX_TOOLWINDOW（隐藏任务栏按钮）
        $exStyle = [WinAPI]::GetWindowLong($winHandle, $GWL_EXSTYLE)
        $newExStyle = $exStyle -bor $WS_EX_NOACTIVATE -bor $WS_EX_TOOLWINDOW
        [WinAPI]::SetWindowLong($winHandle, $GWL_EXSTYLE, $newExStyle) | Out-Null
        
        # 3b. 显式设置基础样式 WS_DISABLED（冗余保护）
        $baseStyle = [WinAPI]::GetWindowLong($winHandle, $GWL_STYLE)
        $newBaseStyle = $baseStyle -bor $WS_DISABLED
        [WinAPI]::SetWindowLong($winHandle, $GWL_STYLE, $newBaseStyle) | Out-Null
        
        # 4. 完全禁用窗口输入（最激进手段，阻止所有鼠标/键盘交互）
        [WinAPI]::EnableWindow($winHandle, $false) | Out-Null
        
        # 5. 显示窗口但不激活（使用 SW_SHOWNA）
        [WinAPI]::ShowWindow($winHandle, $SW_SHOWNA) | Out-Null
        
        # 6. 强制刷新窗口样式和边框（包含 SWP_NOACTIVATE 防止刷新时激活）
        [WinAPI]::SetWindowPos($winHandle, [IntPtr]::Zero, 0, 0, 0, 0, $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_NOZORDER -bor $SWP_NOACTIVATE -bor $SWP_FRAMECHANGED) | Out-Null
    }
    
    # === 7. 线程输入防护 - 防止通过 AttachThreadInput 抢焦点 ===
    $targetThreadId = [WinAPI]::GetWindowThreadProcessId($handle, [IntPtr]::Zero)
    $fgThreadId = [WinAPI]::GetWindowThreadProcessId($foregroundWindow, [IntPtr]::Zero)
    if ($targetThreadId -ne 0 -and $fgThreadId -ne 0 -and $targetThreadId -ne $fgThreadId) {
        # 挂载线程输入后断开，阻止目标线程通过 AttachThreadInput 抢占前台
        [WinAPI]::AttachThreadInput($targetThreadId, $fgThreadId, $true) | Out-Null
        [WinAPI]::AttachThreadInput($targetThreadId, $fgThreadId, $false) | Out-Null
    }
    
    # === 8. 恢复原始前台窗口焦点 ===
    if ($foregroundWindow -ne [IntPtr]::Zero -and $foregroundWindow -ne $handle) {
        [WinAPI]::SetForegroundWindow($foregroundWindow) | Out-Null
    }
    
    # === 9. 验证样式是否正确应用，失败则重试 ===
    $verifyStyle = [WinAPI]::GetWindowLong($handle, $GWL_EXSTYLE)
    if (($verifyStyle -band $WS_EX_NOACTIVATE) -eq 0) {
        [WinAPI]::SetWindowLong($handle, $GWL_EXSTYLE, $newExStyle) | Out-Null
        [WinAPI]::SetWindowPos($handle, [IntPtr]::Zero, 0, 0, 0, 0, $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_NOZORDER -bor $SWP_NOACTIVATE -bor $SWP_FRAMECHANGED) | Out-Null
    }
    
    Write-Output "success"
} catch {
    Write-Output "error: $($_.Exception.Message)"
}
`;

      const { stdout, success } = await this.execPsScript(script);

      if (success && stdout.includes('success')) {
        this.markProcessDisabled(processId, handle);
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * macOS 平台禁用焦点
   */
  async disableMacFocus(windowInfo) {
    // macOS disable focus not supported
    return false;
  }

  /**
   * Linux 平台禁用焦点
   */
  async disableLinuxFocus(windowInfo) {
    try {
      if (windowInfo.handle) {
        await execPromise(`wmctrl -i -r ${windowInfo.handle} -b add,above`, { timeout: 5000 });
        this.disabledHandles.add(windowInfo.handle);
        return true;
      }
      return false;
    } catch (error) {
      // Linux disable focus failed
      return false;
    }
  }

  /**
   * 恢复窗口焦点
   */
  async enableFocus(windowInfo) {
    try {
      switch (this.platform) {
        case 'win32':
          return await this.enableWindowsFocus(windowInfo);
        case 'darwin':
          return await this.enableMacFocus(windowInfo);
        case 'linux':
          return await this.enableLinuxFocus(windowInfo);
        default:
          return false;
      }
    } catch (error) {
      // Failed to restore focus
      return false;
    }
  }

  /**
   * Windows 平台恢复焦点 - 完全恢复
   */
  async enableWindowsFocus(windowInfo) {
    try {
      const handle = windowInfo.handle;
      const processId = windowInfo.id;

      const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool LockSetForegroundWindow(uint uLockCode);
    [DllImport("user32.dll")]
    public static extern bool EnableWindow(IntPtr hWnd, bool bEnable);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, ref uint pvParam, uint fWinIni);
    [DllImport("user32.dll")]
    public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
    public const uint SPI_SETFOREGROUNDLOCKTIMEOUT = 0x2001;
    public const uint SPIF_SENDCHANGE = 0x02;
    public const uint SPIF_UPDATEINIFILE = 0x01;
}
"@

$handle = [IntPtr]::new(${handle})
$processId = ${processId}
$GWL_EXSTYLE = -20
$GWL_STYLE = -16
$WS_EX_NOACTIVATE = 0x08000000
$WS_EX_TOOLWINDOW = 0x00000080
$WS_DISABLED = 0x08000000
$SWP_NOMOVE = 0x0002
$SWP_NOSIZE = 0x0001
$SWP_NOZORDER = 0x0004
$SWP_NOACTIVATE = 0x0010
$SWP_FRAMECHANGED = 0x0020
$SW_SHOW = 5
$LOCK_FOREGROUND_UNLOCK = 2

try {
    # 1. 解锁前台窗口锁定
    [WinAPI]::LockSetForegroundWindow($LOCK_FOREGROUND_UNLOCK) | Out-Null
    
    # 2. 恢复前台锁定超时时间为默认值（500ms）
    $defaultTimeout = [uint32]500
    [WinAPI]::SystemParametersInfo([WinAPI]::SPI_SETFOREGROUNDLOCKTIMEOUT, 0, [ref]$defaultTimeout, [WinAPI]::SPIF_SENDCHANGE -bor [WinAPI]::SPIF_UPDATEINIFILE) | Out-Null
    
    # 3. 枚举该进程的所有顶层窗口并恢复
    $allWindows = [System.Collections.Generic.List[IntPtr]]::new()
    $callback = {
        param($hWnd, $lParam)
        $pid = 0
        [WinAPI]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
        if ($pid -eq $processId) {
            $allWindows.Add($hWnd)
        }
        return $true
    }
    $delegate = [WinAPI+EnumWindowsProc]$callback
    [WinAPI]::EnumWindows($delegate, [IntPtr]::Zero) | Out-Null
    
    foreach ($winHandle in $allWindows) {
        # 4a. 重新启用窗口输入
        [WinAPI]::EnableWindow($winHandle, $true) | Out-Null
        
        # 4b. 移除扩展样式（WS_EX_NOACTIVATE 和 WS_EX_TOOLWINDOW）
        $currentExStyle = [WinAPI]::GetWindowLong($winHandle, $GWL_EXSTYLE)
        $newExStyle = $currentExStyle -band (-bnot $WS_EX_NOACTIVATE) -band (-bnot $WS_EX_TOOLWINDOW)
        [WinAPI]::SetWindowLong($winHandle, $GWL_EXSTYLE, $newExStyle) | Out-Null
        
        # 4c. 移除基础样式 WS_DISABLED
        $baseStyle = [WinAPI]::GetWindowLong($winHandle, $GWL_STYLE)
        $newBaseStyle = $baseStyle -band (-bnot $WS_DISABLED)
        [WinAPI]::SetWindowLong($winHandle, $GWL_STYLE, $newBaseStyle) | Out-Null
        
        # 5. 强制刷新窗口样式（包含 SWP_NOACTIVATE）
        [WinAPI]::SetWindowPos($winHandle, [IntPtr]::Zero, 0, 0, 0, 0, $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_NOZORDER -bor $SWP_NOACTIVATE -bor $SWP_FRAMECHANGED) | Out-Null
        
        # 6. 正常显示窗口
        [WinAPI]::ShowWindow($winHandle, $SW_SHOW) | Out-Null
    }
    
    Write-Output "success"
} catch {
    Write-Output "error: $($_.Exception.Message)"
}
`;

      const { stdout, success } = await this.execPsScript(script);

      if (success && stdout.includes('success')) {
        this.clearProcessDisabled(processId);
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * macOS 平台恢复焦点
   */
  async enableMacFocus(windowInfo) {
    // macOS restore focus not supported
    return false;
  }

  /**
   * Linux 平台恢复焦点
   */
  async enableLinuxFocus(windowInfo) {
    try {
      if (windowInfo.handle) {
        await execPromise(`wmctrl -i -r ${windowInfo.handle} -b remove,above`, { timeout: 5000 });
        this.disabledHandles.delete(windowInfo.handle);
        return true;
      }
      return false;
    } catch (error) {
      // Linux restore focus failed
      return false;
    }
  }
}

module.exports = WindowManager;