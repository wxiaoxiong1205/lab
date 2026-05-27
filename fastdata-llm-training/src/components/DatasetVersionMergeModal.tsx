import React, { useMemo, useState } from 'react'
import { Alert, Form, Input, Modal, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

export interface MergeableDatasetVersion {
  id: string
  version: string
  processStatus: string
  publishStatus?: string
  sampleCount: number
  charCount?: number
  creator?: string
  createdAt: string
}

interface DatasetVersionMergeModalProps {
  open: boolean
  loading?: boolean
  datasetName: string
  nextVersion: string
  versions: MergeableDatasetVersion[]
  onCancel: () => void
  onSubmit: (sourceVersionIds: string[], description?: string) => Promise<void> | void
}

const DatasetVersionMergeModal: React.FC<DatasetVersionMergeModalProps> = ({
  open,
  loading,
  datasetName,
  nextVersion,
  versions,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<{ description?: string }>()
  const [selectedVersionIds, setSelectedVersionIds] = useState<React.Key[]>([])

  const selectedVersions = useMemo(
    () => versions.filter(version => selectedVersionIds.includes(version.id)),
    [selectedVersionIds, versions],
  )
  const totalSampleCount = selectedVersions.reduce((sum, version) => sum + (version.sampleCount ?? 0), 0)
  const totalCharCount = selectedVersions.reduce((sum, version) => sum + (version.charCount ?? 0), 0)

  const columns: ColumnsType<MergeableDatasetVersion> = [
    { title: '版本', dataIndex: 'version', key: 'version', width: 88, render: value => <Text strong>{value}</Text> },
    {
      title: '处理状态',
      dataIndex: 'processStatus',
      key: 'processStatus',
      width: 110,
      render: value => <Tag color={value === '处理完成' ? 'success' : 'default'}>{value}</Tag>,
    },
    { title: '样本数', dataIndex: 'sampleCount', key: 'sampleCount', width: 110, render: value => Number(value ?? 0).toLocaleString() },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110, render: value => value || '-' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', ellipsis: true },
  ]

  return (
    <Modal
      title="合并版本"
      open={open}
      width={760}
      okText={`生成 ${nextVersion}`}
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ disabled: selectedVersionIds.length < 2 }}
      onCancel={onCancel}
      onOk={async () => {
        const values = await form.validateFields()
        await onSubmit(selectedVersionIds.map(String), values.description)
      }}
      afterOpenChange={visible => {
        if (!visible) {
          setSelectedVersionIds([])
          form.resetFields()
        }
      }}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={`将在 ${datasetName} 内生成最新版本 ${nextVersion}`}
        description="仅支持同一数据集内合并处理完成的版本。合并后源版本不变，重复样本全部保留。"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <Text type="secondary">已选版本</Text>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>{selectedVersionIds.length}</div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <Text type="secondary">合并样本数</Text>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>{totalSampleCount.toLocaleString()}</div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <Text type="secondary">合并字符数</Text>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>{totalCharCount ? totalCharCount.toLocaleString() : '-'}</div>
        </div>
      </div>

      <Table<MergeableDatasetVersion>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={versions}
        pagination={false}
        rowSelection={{
          selectedRowKeys: selectedVersionIds,
          onChange: setSelectedVersionIds,
          getCheckboxProps: record => ({
            disabled: record.processStatus !== '处理完成',
            title: record.processStatus === '处理完成' ? undefined : '仅处理完成版本可合并',
          }),
        }}
        locale={{ emptyText: '暂无可合并版本' }}
      />

      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label="版本描述" name="description">
          <Input.TextArea rows={3} maxLength={300} showCount placeholder="请输入合并版本描述" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default DatasetVersionMergeModal
