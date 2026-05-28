import React, { useState, useEffect, useCallback } from 'react';
import { 
  Table, 
  Input, 
  Button, 
  Space, 
  Tag, 
  Card, 
  Tabs, 
  message, 
  Tooltip,
  Typography,
  Divider,
  Badge,
  Empty,
  Dropdown,
  Checkbox
} from 'antd';
import {
  SearchOutlined,
  StopOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  SettingOutlined
} from '@ant-design/icons';
import './App.css';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

function App() {
  const [windows, setWindows] = useState([]);
  const [disabledRules, setDisabledRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  
  // 列显示状态管理
  const [visibleColumns, setVisibleColumns] = useState({
    id: true,
    processName: true,
    title: true,
    className: true,
    handle: false,
    isDisabled: true,
    action: true
  });

  // 加载窗口列表
  const loadWindows = useCallback(async () => {
    setLoading(true);
    try {
      const windowList = await window.electronAPI.getWindows();
      setWindows(windowList);
    } catch (error) {
      message.error('加载窗口列表失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载已禁用规则
  const loadDisabledRules = useCallback(async () => {
    try {
      const rules = await window.electronAPI.getDisabledRules();
      setDisabledRules(rules);
    } catch (error) {
      console.error('加载禁用规则失败:', error);
    }
  }, []);

  useEffect(() => {
    loadWindows();
    loadDisabledRules();
    const interval = setInterval(loadWindows, 5000);
    return () => clearInterval(interval);
  }, [loadWindows, loadDisabledRules]);

  // 过滤窗口
  const filteredWindows = windows.filter(win => {
    if (!searchKeyword) return true;
    const keyword = searchKeyword.toLowerCase();
    return win.title.toLowerCase().includes(keyword) ||
           win.processName.toLowerCase().includes(keyword);
  });

  const disabledWindows = filteredWindows.filter(win => win.isDisabled);
  const enabledWindows = filteredWindows.filter(win => !win.isDisabled);

  // 禁用焦点
  const handleDisableFocus = async (record) => {
    try {
      const result = await window.electronAPI.disableFocus(record);
      if (result) {
        message.success(`已禁用「${record.title}」的焦点`);
        loadWindows();
        loadDisabledRules();
      } else {
        message.error('禁用失败');
      }
    } catch (error) {
      message.error('禁用失败: ' + error.message);
    }
  };

  // 恢复焦点
  const handleEnableFocus = async (record) => {
    try {
      const result = await window.electronAPI.enableFocus(record);
      if (result) {
        message.success(`已恢复「${record.title}」的焦点`);
        loadWindows();
        loadDisabledRules();
      } else {
        message.error('恢复失败');
      }
    } catch (error) {
      message.error('恢复失败: ' + error.message);
    }
  };

  // 批量禁用
  const handleBatchDisable = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择窗口');
      return;
    }
    
    const selectedWindows = enabledWindows.filter(win => 
      selectedRowKeys.includes(win.id)
    );
    
    try {
      const results = await window.electronAPI.batchDisableFocus(selectedWindows);
      const successCount = results.filter(r => r.success).length;
      message.success(`成功禁用 ${successCount} 个窗口`);
      setSelectedRowKeys([]);
      loadWindows();
      loadDisabledRules();
    } catch (error) {
      message.error('批量禁用失败: ' + error.message);
    }
  };

  // 批量恢复
  const handleBatchEnable = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择窗口');
      return;
    }
    
    const selectedWindows = disabledWindows.filter(win => 
      selectedRowKeys.includes(win.id)
    );
    
    try {
      const results = await window.electronAPI.batchEnableFocus(selectedWindows);
      const successCount = results.filter(r => r.success).length;
      message.success(`成功恢复 ${successCount} 个窗口的焦点`);
      setSelectedRowKeys([]);
      loadWindows();
      loadDisabledRules();
    } catch (error) {
      message.error('批量恢复失败: ' + error.message);
    }
  };

  // 删除禁用规则
  const handleRemoveRule = async (processName) => {
    try {
      await window.electronAPI.removeDisabledRule(processName);
      message.success('规则已删除');
      loadDisabledRules();
    } catch (error) {
      message.error('删除规则失败: ' + error.message);
    }
  };

  // 列显示/隐藏切换
  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }));
  };

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0
  });

  // 处理右键菜单
  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY
    });
  };

  // 关闭右键菜单
  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  // 点击其他地方关闭菜单
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  // 所有列定义（包含所有可能的列）
  const allColumns = [
    {
      title: '窗口标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <Text>{text}</Text>
        </Tooltip>
      )
    },
    {
      title: '进程ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (text) => <Text>{text}</Text>
    },
    {
      title: '进程名称',
      dataIndex: 'processName',
      key: 'processName',
      width: 150,
      ellipsis: true,
      render: (text) => <Text code>{text}</Text>
    },
    {
      title: '窗口句柄',
      dataIndex: 'handle',
      key: 'handle',
      width: 120,
      render: (text) => <Text type="secondary">{text}</Text>
    },
    {
      title: '类名',
      dataIndex: 'className',
      key: 'className',
      width: 150,
      ellipsis: true,
      render: (text) => text ? <Text code>{text}</Text> : <Text type="secondary">-</Text>
    },
    {
      title: '状态',
      dataIndex: 'isDisabled',
      key: 'isDisabled',
      width: 100,
      render: (isDisabled) => (
        isDisabled 
          ? <Tag color="red" icon={<StopOutlined />}>已禁用</Tag>
          : <Tag color="green" icon={<CheckCircleOutlined />}>正常</Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          {record.isDisabled ? (
            <Button 
              type="primary" 
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleEnableFocus(record)}
            >
              恢复
            </Button>
          ) : (
            <Button 
              danger 
              size="small"
              icon={<StopOutlined />}
              onClick={() => handleDisableFocus(record)}
            >
              禁用
            </Button>
          )}
        </Space>
      )
    }
  ];

  // 根据可见状态过滤列，并添加右键菜单
  const columns = allColumns
    .filter(col => visibleColumns[col.key])
    .map(col => ({
      ...col,
      // 为每个列标题添加右键菜单
      onHeaderCell: () => ({
        onContextMenu: (e) => {
          e.preventDefault();
          setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY
          });
        }
      })
    }));

  // 右键菜单内容
  const contextMenuContent = (
    <div
      style={{
        position: 'fixed',
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 1000,
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
        padding: '8px 0',
        minWidth: '150px'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ padding: '4px 12px', color: '#999', fontSize: '12px' }}>
        显示/隐藏列
      </div>
      {allColumns
        .filter(col => col.key !== 'action') // 操作列不可隐藏
        .map(col => (
          <div
            key={col.key}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onClick={() => toggleColumn(col.key)}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            <Checkbox checked={visibleColumns[col.key]} />
            <span>{col.title}</span>
          </div>
        ))}
    </div>
  );

  // 禁用规则表格列
  const ruleColumns = [
    {
      title: '进程名称',
      dataIndex: 'processName',
      key: 'processName',
      width: 150,
      ellipsis: true,
      render: (text) => <Text code>{text}</Text>
    },
    {
      title: '关键字',
      dataIndex: 'keyword',
      key: 'keyword',
      ellipsis: true
    },
    {
      title: '禁用时间',
      dataIndex: 'disabledAt',
      key: 'disabledAt',
      width: 180,
      render: (time) => time ? new Date(time).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button 
          danger 
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveRule(record.processName)}
        >
          删除
        </Button>
      )
    }
  ];

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
    columnWidth: 60,
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE
    ]
  };

  return (
    <div className="app-container">
      <Card className="main-card">
        <div className="header">
          <Title level={3}>窗口焦点管理器</Title>
          <Text type="secondary">
            禁用指定窗口的焦点获取能力，防止后台程序抢夺焦点干扰工作
          </Text>
        </div>

        <Divider />

        <div className="toolbar">
          <Space size="middle" wrap>
            <Input
              placeholder="搜索窗口标题或进程名..."
              prefix={<SearchOutlined />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 300 }}
              allowClear
            />
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadWindows}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </div>

        <Tabs defaultActiveKey="all" className="main-tabs">
          <TabPane 
            tab={
              <span>
                全部窗口 
                <Badge count={filteredWindows.length} style={{ marginLeft: 8 }} />
              </span>
            } 
            key="all"
          >
            <div className="batch-actions">
              <Space>
                <Button 
                  type="primary" 
                  danger
                  onClick={handleBatchDisable}
                  disabled={selectedRowKeys.filter(k => enabledWindows.some(w => w.id === k)).length === 0}
                >
                  批量禁用 ({selectedRowKeys.filter(k => enabledWindows.some(w => w.id === k)).length})
                </Button>
                <Button 
                  type="primary"
                  onClick={handleBatchEnable}
                  disabled={selectedRowKeys.filter(k => disabledWindows.some(w => w.id === k)).length === 0}
                >
                  批量恢复 ({selectedRowKeys.filter(k => disabledWindows.some(w => w.id === k)).length})
                </Button>
              </Space>
            </div>
            <Table
              columns={columns}
              dataSource={filteredWindows}
              rowKey="id"
              loading={loading}
              rowSelection={rowSelection}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 个窗口`
              }}
              locale={{
                emptyText: <Empty description="暂无窗口" />
              }}
              size="middle"
            />
          </TabPane>

          <TabPane 
            tab={
              <span>
                <StopOutlined style={{ marginRight: 4, color: '#ff4d4f' }} />
                已禁用 
                <Badge count={disabledWindows.length} style={{ marginLeft: 8, backgroundColor: '#ff4d4f' }} />
              </span>
            } 
            key="disabled"
          >
            <Table
              columns={columns.filter(col => col.key !== 'isDisabled')}
              dataSource={disabledWindows}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 个窗口`
              }}
              locale={{
                emptyText: <Empty description="暂无已禁用的窗口" />
              }}
              size="middle"
            />
          </TabPane>

          <TabPane 
            tab={
              <span>
                <CheckCircleOutlined style={{ marginRight: 4, color: '#52c41a' }} />
                正常 
                <Badge count={enabledWindows.length} style={{ marginLeft: 8, backgroundColor: '#52c41a' }} />
              </span>
            } 
            key="enabled"
          >
            <div className="batch-actions">
              <Button 
                type="primary" 
                danger
                icon={<StopOutlined />}
                onClick={handleBatchDisable}
                disabled={selectedRowKeys.length === 0}
              >
                批量禁用选中 ({selectedRowKeys.length})
              </Button>
            </div>
            <Table
              columns={columns.filter(col => col.key !== 'isDisabled')}
              dataSource={enabledWindows}
              rowKey="id"
              loading={loading}
              rowSelection={rowSelection}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 个窗口`
              }}
              locale={{
                emptyText: <Empty description="暂无正常窗口" />
              }}
              size="middle"
            />
          </TabPane>

          <TabPane 
            tab={
              <span>
                禁用规则 ({disabledRules.length})
              </span>
            } 
            key="rules"
          >
            <Card size="small" className="rules-info">
              <Text type="secondary">
                当已禁用的程序重启后，会自动应用这些规则继续禁用其焦点获取能力。
              </Text>
            </Card>
            <Table
              columns={ruleColumns}
              dataSource={disabledRules}
              rowKey="processName"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条规则`
              }}
              locale={{
                emptyText: <Empty description="暂无禁用规则" />
              }}
              size="middle"
              style={{ marginTop: 16 }}
            />
          </TabPane>
        </Tabs>
      </Card>
      {/* 右键列名显示的菜单 */}
      {contextMenu.visible && contextMenuContent}
    </div>
  );
}

export default App;