import { useEffect, useState } from 'react'
import { Button, Input, Modal, Select, Space, Switch, Table, Tag, Tooltip, message } from 'antd'
import { EditOutlined, SearchOutlined } from '@ant-design/icons'
import type { TablePaginationConfig, TableProps } from 'antd'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import EditAlarmRuleModal from './EditAlarmRuleModal'
import {
  apiMonitorRuleDelete,
  apiMonitorRuleDisable,
  apiMonitorRuleEnable,
  apiMonitorRuleList,
  apiSensitiveCategoriesGet,
} from '@/services/api'

const { Option } = Select

interface AlarmRuleItem {
  id: number
  rule_name: string
  monitor_models: string
  sensitive_types: string
  enabled: boolean
  creator: string
  updated_time: string
  created_time: string
}

export default function AlarmModelStatus({ type }: { type: string }) {
  const [ruleName, setRuleName] = useState('')
  const [modelName, setModelName] = useState('')
  const [sensitiveTypes, setSensitiveTypes] = useState<string[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AlarmRuleItem | null>(null)

  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
  })

  // 获取敏感类别数据
  const { data: sensitiveCategoriesData } = useRequest(apiSensitiveCategoriesGet, {
    onError: (error) => {
      console.error('获取敏感类别失败:', error)
    },
  })

  // 敏感类型选项 - 使用API数据或默认数据
  const sensitiveTypeOptions = sensitiveCategoriesData?.data || [
    '社会公共安全类',
    '个人信息类',
    '金融信息类',
    '商业机密类',
    '政治敏感类',
    '暴力色情类',
  ]

  // 告警规则列表请求
  const {
    data: listResponse,
    loading,
    run: refreshList,
  } = useRequest(
    () => {
      return apiMonitorRuleList({
        rule_name: ruleName || undefined,
        model_name: modelName || undefined,
        sensitive_types: sensitiveTypes.length > 0 ? sensitiveTypes.join(',') : undefined,
        page_number: pagination.current?.toString(),
        page_size: pagination.pageSize?.toString(),
        type,
      })
    },
    {
      refreshDeps: [ruleName, modelName, sensitiveTypes, pagination.current, pagination.pageSize, type],
      debounceWait: 300,
      onSuccess: (result) => {
        if (result?.data) {
          setPagination((prev) => ({
            ...prev,
            total: result.data.total || 0,
            showTotal: (total) => `总共 ${total} 条`,
          }))
        }
      },
      onError: (error) => {
        message.error('获取告警规则列表失败')
        console.error('获取告警规则列表失败:', error)
      },
    },
  )

  const data = listResponse?.data?.items || []

  const handleStatusChange = async (id: number, checked: boolean) => {
    try {
      if (checked) {
        await apiMonitorRuleEnable(id)
        message.success('规则启用成功')
      }
      else {
        await apiMonitorRuleDisable(id)
        message.success('规则禁用成功')
      }
      refreshList()
    }
    catch (error) {
      message.error('状态切换失败')
      console.error('状态切换失败:', error)
    }
  }

  const handleEdit = (record: AlarmRuleItem) => {
    setEditingRule(record)
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingRule(null)
    setIsModalOpen(true)
  }

  const handleDelete = (record: AlarmRuleItem) => {
    Modal.confirm({
      title: '确认删除',
      content: '告警规则删除后无法恢复，请确认是否删除？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await apiMonitorRuleDelete(record.id)
          message.success('删除成功')
          refreshList()
        }
        catch (error) {
          message.error('删除失败')
          console.error('删除失败:', error)
        }
      },
    })
  }

  const handleModalOk = async (values: any) => {
    try {
      if (editingRule) {
        message.success('规则修改成功')
      }
      else {
        message.success('规则创建成功')
      }

      setIsModalOpen(false)
      refreshList()
    }
    catch (error) {
      message.error('操作失败')
      console.error('操作失败:', error)
    }
  }

  const handleModalCancel = () => {
    setIsModalOpen(false)
  }

  const columns: TableProps<AlarmRuleItem>['columns'] = [
    {
      title: '监控模型',
      dataIndex: 'monitor_models',
      key: 'monitor_models',
      ellipsis: {
        showTitle: false,
      },
      render: (monitor_models: string) => (
        <Tooltip placement="topLeft" title={monitor_models}>
          {monitor_models}
        </Tooltip>
      ),
    },
    {
      title: '规则名称',
      dataIndex: 'rule_name',
      key: 'rule_name',
    },
    {
      title: '敏感类型',
      hidden: type !== 'content_security',
      dataIndex: 'sensitive_types',
      key: 'sensitive_types',
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean, record) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleStatusChange(record.id, checked)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '创建人',
      dataIndex: 'creator',
      key: 'creator',
    },
    {
      title: '修改时间',
      dataIndex: 'updated_time',
      key: 'updated_time',
      width: 180,
      render: (timestamp: number) => timestamp ? dayjs(timestamp * 1000).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      align: 'center',
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          {type === 'model_connectivity' && (
            <Button
              type="link"
              size="small"
              danger
              onClick={() => handleDelete(record)}
            >
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const handleTableChange: TableProps<AlarmRuleItem>['onChange'] = (paginationInfo) => {
    setPagination({
      ...pagination,
      current: paginationInfo.current || 1,
      pageSize: paginationInfo.pageSize || 10,
    })
  }

  const handleReset = () => {
    setRuleName('')
    setModelName('')
    setSensitiveTypes([])
    setPagination({
      current: 1,
      pageSize: 10,
      total: 0,
    })
  }

  return (
    <div>
      <div style={{ padding: '16px', flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="请输入模型名称"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            style={{ width: 200 }}
            prefix={<SearchOutlined />}
          />
          <Input
            placeholder="请输入规则名称"
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            style={{ width: 200 }}
            prefix={<SearchOutlined />}
          />

          {type === 'content_security' && (
            <Select
              placeholder="请选择敏感类别"
              value={sensitiveTypes}
              onChange={(value) => setSensitiveTypes(value || [])}
              style={{ width: 200 }}
              mode="multiple"
              showSearch
              filterOption={(input, option) => {
                if (option && 'children' in option) {
                  return String(option.children).toLowerCase().includes(input.toLowerCase())
                }
                return false
              }}
            >
              {sensitiveTypeOptions.map((type: string) => (
                <Option key={type} value={type}>
                  {type}
                </Option>
              ))}
            </Select>
          )}
          <Button onClick={handleReset}>
            重置
          </Button>
        </Space>

        {type === 'model_connectivity' && (
          <Button
            type="primary"
            onClick={handleAdd}
          >
            新增规则
          </Button>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 16px 16px' }}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          scroll={{ y: 'calc(100vh - 160px)', x: 1000 }}
        />
      </div>

      <EditAlarmRuleModal
        visible={isModalOpen}
        onCancel={handleModalCancel}
        onOk={handleModalOk}
        editingRule={editingRule}
        type={type}
      />
    </div>
  )
}
