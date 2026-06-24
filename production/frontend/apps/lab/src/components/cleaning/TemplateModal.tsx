import React, { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { CheckOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { cleaningService } from '@/services/cleaningService'
import type { CleaningOperator, CleaningOperatorConfig, CleaningTemplateResponse } from '@/types/cleaning'

const { Text } = Typography
const { Option } = Select
interface TemplateModalProps {
  visible: boolean
  projectId: number
  getOperatorInfo: (operatorId: string) => CleaningOperator | undefined
  onCancel: () => void
  onApply: (template: CleaningTemplateResponse) => void
  onDelete: (templateId: number) => void
}
/**
 * 模板列表
 */
const TemplateModal: React.FC<TemplateModalProps> = ({ visible, projectId, getOperatorInfo, onCancel, onApply, onDelete }) => {
  const [form] = Form.useForm()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchParams, setSearchParams] = useState<{
    created_by?: string
    operator_type?: string
  }>({})
  // 获取模板列表数据
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['cleaning-templates', projectId, page, pageSize, searchParams],
    queryFn: async () => {
      return await cleaningService.getTemplates(projectId, page, pageSize, searchParams.operator_type, searchParams.created_by)
    },
    enabled: visible && !!projectId,
  })
  // 当弹窗关闭时重置搜索条件
  useEffect(() => {
    if (!visible) {
      form.resetFields()
      setPage(1)
      setPageSize(10)
      setSearchParams({})
    }
  }, [visible, form])
  // 处理搜索
  const handleSearch = (values: {
    created_by?: string
    operator_type?: string
  }) => {
    setSearchParams({
      created_by: values.created_by?.trim() || undefined,
      operator_type: values.operator_type || undefined,
    })
    setPage(1)
  }
  // 处理重置
  const handleReset = () => {
    form.resetFields()
    setSearchParams({})
    setPage(1)
  }
  // 处理分页变化
  const handleTableChange = (newPage: number, newPageSize: number) => {
    setPage(newPage)
    setPageSize(newPageSize)
  }
  const columns = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 60,
      render: (_: any, __: any, index: number) => (page - 1) * pageSize + index + 1,
    },
    {
      title: '算子配置',
      dataIndex: 'steps_json',
      key: 'steps_json',
      render: (stepsJson: CleaningOperatorConfig[] | Record<string, any> | null, record: CleaningTemplateResponse) => {
        if (!stepsJson || !Array.isArray(stepsJson) || stepsJson.length === 0)
          return '-'
        // 获取算子名称
        const operatorNames = stepsJson
          .map((step: CleaningOperatorConfig) => {
            const operator = getOperatorInfo(step.operator_type)
            return operator?.name || step.operator_type
          })
          .filter(Boolean)
        return (
          <Space wrap>
            {operatorNames.map((name, idx) => (
              <Tag key={idx} color="green">
                {name}
              </Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      width: 120,
      render: (text: string | null, record: CleaningTemplateResponse) => {
        if (record.is_builtin) {
          return <Text type="secondary">系统设置</Text>
        }
        return text || '-'
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (text: string | null) => {
        if (!text)
          return '-'
        return new Date(text).toLocaleDateString('zh-CN')
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: CleaningTemplateResponse) => (
        <Space>
          <Button type="link" onClick={() => onApply(record)} icon={<CheckOutlined />}>
            应用
          </Button>
          {!record.is_builtin && (
            <Button type="link" danger onClick={() => onDelete(record.id!)} icon={<DeleteOutlined />}>
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ]
  return (
    <Modal title="数据清洗模板" open={visible} onCancel={onCancel} footer={null} width={900}>
      <Form className="mb-[16px]" form={form} layout="inline" onFinish={handleSearch}>
        <Form.Item name="created_by" label="创建人">
          <Input placeholder="请输入创建人" allowClear className="w-[150px]" />
        </Form.Item>
        <Form.Item name="operator_type" label="算子名称">
          <Input placeholder="请输入算子名称" allowClear className="w-[150px]" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              搜索
            </Button>
            <Button onClick={handleReset}>重置</Button>
          </Space>
        </Form.Item>
      </Form>
      <Table
        columns={columns}
        dataSource={templatesData?.items || []}
        rowKey={(record) => record.id?.toString() || `template-${record.created_at}`}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: templatesData?.total || 0,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: handleTableChange,
          onShowSizeChange: handleTableChange,
        }}
      />
    </Modal>
  )
}
export default TemplateModal
