import React, { useMemo, useState } from 'react'
import { message, Modal, Form, Input, Select, Upload, Button, Typography, Space, Divider, List, Descriptions, Tag, Progress, Table } from 'antd'
import { DatabaseOutlined, UploadOutlined, CheckCircleOutlined, PlusOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import type { ColumnsType } from 'antd/es/table'
import { nextVersionLabel, parseVersionNum } from './TrainingDataset'

const { Text } = Typography

const statusMap: Record<string, { color: string; label: string }> = {
  '处理完成': { color: 'success', label: '处理完成' },
  '处理中': { color: 'processing', label: '处理中' },
  '处理失败': { color: 'error', label: '处理失败' },
}

const versionStatusMap: Record<string, { color: string; label: string }> = {
  已发布: { color: 'green', label: '已发布' },
  草稿: { color: 'default', label: '草稿' },
  已归档: { color: 'orange', label: '已归档' },
}

const dataUsageTags: Record<string, { color: string; text: string }> = {
  'SFT-文本生成': { color: 'blue', text: 'SFT-文本生成' },
  'SFT-图像理解': { color: 'cyan', text: 'SFT-图像理解' },
}

type TestVersionRow = {
  id: string
  version: string
  processStatus: string
  publishStatus: string
  sampleCount: number
  createdAt: string
}

type TestDatasetRecord = {
  id: string
  name: string
  versionStatus: string
  latestVersion: string
  dataUsage: string
  dataFormat: string
  creator: string
  createdAt: string
  status: string
  versions: TestVersionRow[]
}

function buildTestVersions(row: Omit<TestDatasetRecord, 'versions'>): TestVersionRow[] {
  const n = parseVersionNum(row.latestVersion)
  const list: TestVersionRow[] = []
  const depth = Math.min(n, 4)
  for (let k = 0; k < depth; k++) {
    const i = n - k
    const isLatest = k === 0
    const scale = isLatest ? 1 : 0.82 - k * 0.08
    list.push({
      id: `${row.id}-v${i}`,
      version: `V${i}`,
      processStatus: '处理完成',
      publishStatus: isLatest ? row.status : '已归档',
      sampleCount: Math.max(10, Math.floor(500 * scale)),
      createdAt: row.createdAt,
    })
  }
  return list
}

function attachTestVersions(row: Omit<TestDatasetRecord, 'versions'>): TestDatasetRecord {
  return { ...row, versions: buildTestVersions(row) }
}

const MOCK_TEST_BASE: Omit<TestDatasetRecord, 'versions'>[] = [
  { id: '1', name: '属性回归测试-22-333-444', versionStatus: '处理完成', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/04/09 10:00:00', status: '已发布' },
  { id: '2', name: '测试-xlsx-1', versionStatus: '处理完成', latestVersion: 'V2', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/04/08 14:30:00', status: '已发布' },
  { id: '3', name: '图像-单轮多轮交叉-3', versionStatus: '处理完成', latestVersion: 'V1', dataUsage: 'SFT-图像理解', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/04/07 11:00:00', status: '已发布' },
  { id: '4', name: '图像-多轮-3', versionStatus: '处理完成', latestVersion: 'V1', dataUsage: 'SFT-图像理解', dataFormat: 'role-based', creator: 'lab1', createdAt: '2026/04/06 15:45:00', status: '已发布' },
  { id: '5', name: '图像-单轮-3', versionStatus: '处理完成', latestVersion: 'V1', dataUsage: 'SFT-图像理解', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/04/05 10:20:00', status: '已发布' },
  { id: '6', name: '测试-role-单轮多轮交叉-1', versionStatus: '处理完成', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'lab2', createdAt: '2026/04/04 14:00:00', status: '已发布' },
  { id: '7', name: '测试-role-多轮-1', versionStatus: '处理完成', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/04/03 09:30:00', status: '已发布' },
  { id: '8', name: '测试-role-单轮-1', versionStatus: '处理完成', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'lab1', createdAt: '2026/04/02 16:00:00', status: '已发布' },
  { id: '9', name: '测试-json-1', versionStatus: '处理完成', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/04/01 11:30:00', status: '已发布' },
  { id: '10', name: '测试-jsonl-1', versionStatus: '处理完成', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/31 14:00:00', status: '已发布' },
]

const TestDataset: React.FC = () => {
  const [dataList, setDataList] = useState<TestDatasetRecord[]>(() => MOCK_TEST_BASE.map(attachTestVersions))
  const [dataUsage, setDataUsage] = useState<string | undefined>(undefined)
  const [searchValue, setSearchValue] = useState('')
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [addVersionModalVisible, setAddVersionModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<TestDatasetRecord | null>(null)
  const [addVersionTarget, setAddVersionTarget] = useState<TestDatasetRecord | null>(null)

  const [form] = Form.useForm()
  const [addVersionForm] = Form.useForm()
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<UploadFile | null>(null)
  const [addVersionUploading, setAddVersionUploading] = useState(false)
  const [addVersionProgress, setAddVersionProgress] = useState(0)
  const [addVersionFile, setAddVersionFile] = useState<UploadFile | null>(null)

  const filteredData = useMemo(
    () =>
      dataList.filter(item => {
        const matchSearch = !searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase())
        const matchUsage = !dataUsage || item.dataUsage === dataUsage
        return matchSearch && matchUsage
      }),
    [dataList, searchValue, dataUsage],
  )

  const versionColumns: ColumnsType<TestVersionRow> = [
    { title: '版本', dataIndex: 'version', key: 'version', width: 72, render: (v: string) => <Text strong style={{ color: '#4f46e5' }}>{v}</Text> },
    {
      title: '处理状态',
      dataIndex: 'processStatus',
      key: 'processStatus',
      width: 100,
      render: (v: string) => {
        const s = statusMap[v] || { color: 'default', label: v }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    {
      title: '发布状态',
      dataIndex: 'publishStatus',
      key: 'publishStatus',
      width: 88,
      render: (v: string) => {
        const s = versionStatusMap[v] || { color: 'default', label: v }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    { title: '样本数', dataIndex: 'sampleCount', key: 'sampleCount', width: 96, render: (v: number) => v?.toLocaleString() },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', ellipsis: true },
  ]

  const handleOpenCreate = () => {
    form.resetFields()
    setSelectedFile(null)
    setUploadProgress(0)
    setCreateModalVisible(true)
  }

  const handleFileChange = (info: any) => {
    const file = info.file
    if (file.status === 'uploading') {
      setUploading(true)
      let progress = 0
      const timer = setInterval(() => {
        progress += 10
        setUploadProgress(progress)
        if (progress >= 100) {
          clearInterval(timer)
          setUploading(false)
          setSelectedFile({ uid: file.uid, name: file.name, status: 'done' } as UploadFile)
          message.success(`${file.name} 上传成功`)
        }
      }, 200)
    } else if (file.status === 'done') {
      setUploading(false)
      setUploadProgress(100)
    } else if (file.status === 'error') {
      setUploading(false)
      message.error(`${file.name} 上传失败`)
    }
  }

  const handleSubmit = async () => {
    try {
      await form.validateFields()
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
      setSelectedFile(null)
      setUploadProgress(0)
    } catch {
      /* 校验失败 */
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
    setSelectedFile(null)
    setUploadProgress(0)
  }

  const handleOpenDetail = (record: TestDatasetRecord) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleOpenAddVersion = (record: TestDatasetRecord) => {
    setAddVersionTarget(record)
    addVersionForm.resetFields()
    addVersionForm.setFieldsValue({ version: nextVersionLabel(record.latestVersion) })
    setAddVersionFile(null)
    setAddVersionProgress(0)
    setAddVersionModalVisible(true)
  }

  const handleCancelAddVersion = () => {
    setAddVersionModalVisible(false)
    setAddVersionTarget(null)
    addVersionForm.resetFields()
    setAddVersionFile(null)
    setAddVersionProgress(0)
  }

  const handleAddVersionFileChange = (info: any) => {
    const file = info.file
    if (file.status === 'uploading') {
      setAddVersionUploading(true)
      let progress = 0
      const timer = setInterval(() => {
        progress += 10
        setAddVersionProgress(progress)
        if (progress >= 100) {
          clearInterval(timer)
          setAddVersionUploading(false)
          setAddVersionFile({ uid: file.uid, name: file.name, status: 'done' } as UploadFile)
          message.success(`${file.name} 上传成功`)
        }
      }, 200)
    } else if (file.status === 'done') {
      setAddVersionUploading(false)
      setAddVersionProgress(100)
    } else if (file.status === 'error') {
      setAddVersionUploading(false)
      message.error(`${file.name} 上传失败`)
    }
  }

  const handleSubmitAddVersion = async () => {
    try {
      await addVersionForm.validateFields()
      if (!addVersionTarget) return
      if (!addVersionFile) {
        message.warning('请上传数据文件')
        return
      }
      const label = addVersionForm.getFieldValue('version') as string
      const now = new Date()
      const createdAt = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      const newVer: TestVersionRow = {
        id: `${addVersionTarget.id}-${label}-${Date.now()}`,
        version: label,
        processStatus: '处理完成',
        publishStatus: '已发布',
        sampleCount: Math.floor(Math.random() * 400) + 80,
        createdAt,
      }

      const patchList = (list: TestDatasetRecord[]) =>
        list.map(item => {
          if (item.id !== addVersionTarget.id) return item
          const reTagged = item.versions.map(v =>
            v.version === item.latestVersion ? { ...v, publishStatus: '已归档' } : v,
          )
          return {
            ...item,
            latestVersion: label,
            versionStatus: '处理完成',
            status: '已发布',
            createdAt,
            versions: [newVer, ...reTagged],
          }
        })

      setDataList(patchList)
      message.success('新版本已创建')
      handleCancelAddVersion()
      setSelectedRecord(prev => (prev && prev.id === addVersionTarget.id ? patchList([prev])[0] : prev))
    } catch {
      /* 校验失败 */
    }
  }

  const columns: ColumnsType<TestDatasetRecord> = [
    { title: '数据集名称', dataIndex: 'name', key: 'name', width: 200, ellipsis: true },
    {
      title: '最新版本状态',
      dataIndex: 'versionStatus',
      key: 'versionStatus',
      width: 120,
      render: (val: string) => {
        const s = statusMap[val] || { color: 'default', label: val }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    { title: '最新版本', dataIndex: 'latestVersion', key: 'latestVersion', width: 100 },
    {
      title: '数据用途',
      dataIndex: 'dataUsage',
      key: 'dataUsage',
      width: 130,
      render: (val: string) => {
        const t = dataUsageTags[val] || { color: 'default', text: val }
        return <Tag color={t.color}>{t.text}</Tag>
      },
    },
    { title: '数据格式', dataIndex: 'dataFormat', key: 'dataFormat', width: 130, render: (val: string) => <Text style={{ color: '#64748b', fontSize: 12 }}>{val}</Text> },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right' as const,
      render: (_: unknown, record: TestDatasetRecord) => (
        <Space size={0} wrap>
          <Button type="link" size="small" onClick={() => handleOpenDetail(record)}>查看详情</Button>
          <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => handleOpenAddVersion(record)}>增加版本</Button>
          <Button type="link" size="small" danger onClick={() => message.success(`已删除：${record.name}`)}>删除</Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 40, height: 40,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <Text strong style={{ fontSize: 18, color: '#0f172a' }}>测试数据管理</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 13, marginLeft: 52 }}>
            管理测试数据集，适用于模型效果评估场景。
          </Text>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select
              placeholder="数据用途"
              allowClear
              style={{ width: 150 }}
              value={dataUsage}
              onChange={val => setDataUsage(val)}
              options={[
                { value: 'SFT-文本生成', label: 'SFT-文本生成' },
                { value: 'SFT-图像理解', label: 'SFT-图像理解' },
              ]}
            />
            <Input
              prefix={<span style={{ color: '#94a3b8' }}>🔍</span>}
              placeholder="搜索"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              allowClear
              style={{ borderRadius: 8, width: 200 }}
            />
            <Button onClick={() => { setSearchValue(''); setDataUsage(undefined) }}>重置</Button>
          </div>
          <Space>
            <Button icon={<span>🔄</span>} onClick={() => message.success('刷新成功')}>刷新</Button>
            <Button type="primary" icon={<span>➕</span>} onClick={handleOpenCreate}>创建数据集</Button>
          </Space>
        </div>

        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
        }}>
          <Table<TestDatasetRecord>
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total: number) => `共 ${total} 条数据` }}
            locale={{ emptyText: <Text type="secondary">暂无数据</Text> }}
          />
        </div>
      </div>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>创建数据集</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={720}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>提交</Button>
          </Space>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ dataSource: 'local', dataUsage: '文本生成' }}>
          <Divider plain style={{ margin: '0 0 16px', color: '#64748b', fontSize: 12 }}>基本信息</Divider>

          <Form.Item label="数据集名称" name="name" rules={[{ required: true, message: '请输入数据集名称' }]}
            tooltip="支持中英文、数字、下划线、中划线，不能以下划线或中划线开头，2-64个字符">
            <Input placeholder="请输入数据集名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item label="数据集版本" name="version">
            <Input placeholder="V1" disabled />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入描述（0 / 300）" maxLength={300} showCount />
          </Form.Item>

          <Divider plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>数据配置</Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="数据用途" name="dataUsage" rules={[{ required: true, message: '请选择数据用途' }]}>
              <Select placeholder="请选择数据用途">
                <Select.Option value="文本生成">
                  <Space>
                    <Text style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 3, fontWeight: 500 }}>SFT</Text>
                    文本生成
                  </Space>
                </Select.Option>
                <Select.Option value="图像理解">
                  <Space>
                    <Text style={{ fontSize: 11, color: '#0891b2', background: 'rgba(8,145,178,0.08)', padding: '2px 6px', borderRadius: 3, fontWeight: 500 }}>VLM</Text>
                    图像理解
                  </Space>
                </Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="数据属性" name="dataAttribute">
              <Select placeholder="未分组" />
            </Form.Item>
          </div>

          <Form.Item label="数据格式" name="dataFormat" rules={[{ required: true, message: '请选择数据格式' }]}>
            <Select placeholder="请选择数据格式">
              <Select.Option value="PROMPT_RESPONSE">PROMPT_RESPONSE</Select.Option>
              <Select.Option value="ROLE_BASED">ROLE_BASED</Select.Option>
            </Select>
          </Form.Item>

          <Divider plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>数据上传</Divider>

          <Form.Item label="数据来源" name="dataSource" rules={[{ required: true, message: '请选择数据来源' }]}>
            <Select placeholder="请选择数据来源">
              <Select.Option value="local">本地上传</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="上传文件" name="file" rules={[{ required: true, message: '请上传数据文件' }]} style={{ marginBottom: 8 }}>
            <Upload.Dragger
              accept=".jsonl,.json,.xlsx"
              showUploadList={false}
              customRequest={({ onSuccess }: any) => { setTimeout(() => onSuccess?.('ok'), 100) }}
              onChange={handleFileChange}
              disabled={uploading}
            >
              <p style={{ fontSize: 40, color: '#94a3b8', margin: 0 }}><UploadOutlined /></p>
              <p style={{ color: '#64748b' }}>点击或拖拽文件到此区域上传</p>
              <p style={{ color: '#94a3b8', fontSize: 12 }}>支持 .jsonl/.json/.xlsx 格式，单个文件不超过 100MB</p>
            </Upload.Dragger>
          </Form.Item>

          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={16}>
              <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 12 }}>JSONL 格式</Button>
              <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 12 }}>JSON 格式</Button>
              <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 12 }}>XLSX 格式</Button>
            </Space>
            {uploading && <Progress percent={uploadProgress} size="small" status="active" style={{ width: 160 }} />}
          </div>

          {selectedFile && (
            <List size="small" bordered dataSource={[selectedFile]} style={{ background: '#f8fafc' }}
              renderItem={(item: UploadFile) => (
                <List.Item actions={[<Button type="link" danger size="small" onClick={() => setSelectedFile(null)}>删除</Button>]}>
                  <List.Item.Meta avatar={<CheckCircleOutlined style={{ color: '#52c41a' }} />} title={item.name} description="上传完成" />
                </List.Item>
              )}
            />
          )}
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>数据集详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={800}
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {selectedRecord && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="数据集名称" span={2}>{selectedRecord.name}</Descriptions.Item>
              <Descriptions.Item label="当前最新版本">{selectedRecord.latestVersion}</Descriptions.Item>
              <Descriptions.Item label="最新处理状态">
                <Tag color={(statusMap[selectedRecord.versionStatus] || { color: 'default' }).color}>{selectedRecord.versionStatus}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="数据用途">{selectedRecord.dataUsage}</Descriptions.Item>
              <Descriptions.Item label="数据格式">{selectedRecord.dataFormat}</Descriptions.Item>
              <Descriptions.Item label="创建人">{selectedRecord.creator}</Descriptions.Item>
              <Descriptions.Item label="最近更新时间">{selectedRecord.createdAt}</Descriptions.Item>
            </Descriptions>
            <Divider plain style={{ margin: '20px 0 12px', color: '#64748b', fontSize: 12 }}>版本列表</Divider>
            <Table<TestVersionRow>
              rowKey="id"
              size="small"
              columns={versionColumns}
              dataSource={selectedRecord.versions}
              pagination={false}
              locale={{ emptyText: '暂无版本' }}
            />
          </>
        )}
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>增加版本</span>
          </div>
        }
        open={addVersionModalVisible}
        onCancel={handleCancelAddVersion}
        width={640}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={handleCancelAddVersion}>取消</Button>
            <Button type="primary" onClick={handleSubmitAddVersion}>确定</Button>
          </Space>
        }
      >
        <Form form={addVersionForm} layout="vertical">
          <Form.Item label="数据集名称">
            <Input value={addVersionTarget?.name} disabled />
          </Form.Item>
          <Form.Item label="新版本号" name="version" rules={[{ required: true, message: '请填写版本号' }]}>
            <Input disabled />
          </Form.Item>
          <Divider plain style={{ margin: '12px 0', color: '#64748b', fontSize: 12 }}>数据上传</Divider>
          <Form.Item label="上传文件" name="file">
            <Upload.Dragger
              accept=".jsonl,.json,.xlsx"
              showUploadList={false}
              customRequest={({ onSuccess }: any) => { setTimeout(() => onSuccess?.('ok'), 100) }}
              onChange={handleAddVersionFileChange}
              disabled={addVersionUploading}
            >
              <p style={{ fontSize: 40, color: '#94a3b8', margin: 0 }}><UploadOutlined /></p>
              <p style={{ color: '#64748b' }}>上传新版本数据文件</p>
              <p style={{ color: '#94a3b8', fontSize: 12 }}>格式需与数据集一致：{addVersionTarget?.dataFormat ?? '-'}</p>
            </Upload.Dragger>
          </Form.Item>
          {addVersionUploading && <Progress percent={addVersionProgress} size="small" status="active" style={{ marginBottom: 12 }} />}
          {addVersionFile && (
            <List size="small" bordered dataSource={[addVersionFile]} style={{ background: '#f8fafc' }}
              renderItem={(item: UploadFile) => (
                <List.Item actions={[<Button type="link" danger size="small" onClick={() => setAddVersionFile(null)}>删除</Button>]}>
                  <List.Item.Meta avatar={<CheckCircleOutlined style={{ color: '#52c41a' }} />} title={item.name} description="上传完成" />
                </List.Item>
              )}
            />
          )}
        </Form>
      </Modal>
    </>
  )
}

export default TestDataset
