import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Descriptions, Tabs } from 'antd'
import { ExperimentOutlined, PlusOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

const mockMyNotebooks = [
  { id: '1', name: '数据探索-notebook', status: 'running', creator: 'admin', createdAt: '2026/03/20 10:00:00' },
  { id: '2', name: '模型调参实验', status: 'stopped', creator: 'admin', createdAt: '2026/03/18 14:30:00' },
  { id: '3', name: '特征工程测试', status: 'stopped', creator: 'lab1', createdAt: '2026/03/15 09:00:00' },
]

const mockSquareNotebooks = [
  { id: 's1', name: '图像分类入门', description: '基于 ResNet 的图像分类完整示例', creator: '平台', createdAt: '2026/01/15 10:00:00' },
  { id: 's2', name: 'NLP情感分析', description: '使用BERT进行中文情感分析实战', creator: '平台', createdAt: '2026/01/10 14:00:00' },
  { id: 's3', name: '推荐系统实践', description: '基于协同过滤的电影推荐系统', creator: '平台', createdAt: '2026/02/01 09:00:00' },
]

type MyNotebook = typeof mockMyNotebooks[0]
type SquareNotebook = typeof mockSquareNotebooks[0]
type AnyNotebook = MyNotebook | SquareNotebook

const OnlineNotebook: React.FC = () => {
  const [tab, setTab] = useState<'mine' | 'square'>('mine')
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<AnyNotebook | null>(null)
  const [form] = Form.useForm()

  const handleOpenCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('创建Notebook:', values)
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
  }

  const handleOpenDetail = (record: AnyNotebook) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleOpen = (record: MyNotebook) => {
    message.loading('正在打开Notebook环境...', 1.5).then(() => {
      message.success(`已打开: ${record.name}`)
    })
  }

  const handleCopy = (record: SquareNotebook) => {
    message.success(`已复制案例: ${record.name}`)
  }

  const isMyNotebook = (rec: AnyNotebook): rec is MyNotebook => 'status' in rec

  const mineColumns: ColumnsType<MyNotebook> = [
    { title: 'Notebook 名称', dataIndex: 'name', key: 'name' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => (
        <Text style={{ color: val === 'running' ? '#52c41a' : '#999' }}>
          {val === 'running' ? '运行中' : '已停止'}
        </Text>
      ),
    },
    { title: '创建人', dataIndex: 'creator', key: 'creator' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
  ]

  const squareColumns: ColumnsType<SquareNotebook> = [
    { title: '案例名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '创建人', dataIndex: 'creator', key: 'creator' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
  ]

  const isMine = tab === 'mine'
  const currentColumns = isMine ? (mineColumns as ColumnsType<AnyNotebook>) : (squareColumns as ColumnsType<AnyNotebook>)
  const currentData: AnyNotebook[] = isMine ? mockMyNotebooks : mockSquareNotebooks

  return (
    <>
      <div style={{ padding: '28px 32px 0' }}>
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as 'mine' | 'square')}
          items={[
            { key: 'mine', label: '我的 Notebook' },
            { key: 'square', label: 'Notebook 广场' },
          ]}
        />
      </div>

      <SharedListPage
        title="在线Notebook"
        titleIcon={<ExperimentOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="交互式编程环境，支持 Python / Jupyter，提供即开即用的数据科学环境"
        searchPlaceholder={isMine ? '请输入 Notebook 名称' : '请输入案例名称'}
        searchField="name"
        columns={currentColumns}
        dataSource={currentData}
        showCreateButton={isMine}
        createButtonText="新建 Notebook"
        onCreate={isMine ? handleOpenCreate : undefined}
        onRefresh={() => message.success('刷新成功')}
        emptyText={isMine ? '暂无 Notebook' : '暂无案例'}
        cardStyle={{ marginTop: 0 }}
        actionButtons={
          isMine
            ? [
                { label: '打开', onClick: (rec: AnyNotebook) => handleOpen(rec as MyNotebook) },
                { label: '详情', onClick: handleOpenDetail },
              ]
            : [
                { label: '复制案例', onClick: (rec: AnyNotebook) => handleCopy(rec as SquareNotebook) },
                { label: '详情', onClick: handleOpenDetail },
              ]
        }
      />

      {/* 创建 Notebook Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>新建 Notebook</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={520}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit} style={{ background: '#4f46e5' }}>
              创建
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            基本信息
          </Divider>

          <Form.Item
            label="Notebook名称"
            name="name"
            rules={[
              { required: true, message: '请输入Notebook名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
          >
            <Input placeholder="请输入Notebook名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="请输入Notebook描述（可选）" maxLength={300} showCount />
          </Form.Item>

          <div style={{
            background: '#f8fafc',
            borderRadius: 8,
            padding: '12px 16px',
            border: '1px solid #e2e8f0'
          }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ExperimentOutlined style={{ marginRight: 6 }} />
              提示：Notebook 创建后可选择基础镜像环境，并开始编写 Python 代码
            </Text>
          </div>
        </Form>
      </Modal>

      {/* 详情 Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ExperimentOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>{selectedRecord?.name || '详情'}</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={520}
        footer={
          <Space>
            <Button onClick={handleCloseDetail}>关闭</Button>
            {selectedRecord && isMine && (
              <Button type="primary" style={{ background: '#4f46e5' }} onClick={() => { handleCloseDetail(); handleOpen(selectedRecord as MyNotebook); }}>
                打开
              </Button>
            )}
            {selectedRecord && !isMine && (
              <Button type="primary" style={{ background: '#4f46e5' }} onClick={() => { handleCloseDetail(); handleCopy(selectedRecord as SquareNotebook); }}>
                复制案例
              </Button>
            )}
          </Space>
        }
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            {isMyNotebook(selectedRecord) && (
              <Descriptions.Item label="状态">
                <Text style={{ color: selectedRecord.status === 'running' ? '#52c41a' : '#999' }}>
                  {selectedRecord.status === 'running' ? '运行中' : '已停止'}
                </Text>
              </Descriptions.Item>
            )}
            {!isMyNotebook(selectedRecord) && (
              <Descriptions.Item label="描述" span={2}>{selectedRecord.description}</Descriptions.Item>
            )}
            <Descriptions.Item label="创建人">{selectedRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={isMine ? 1 : 2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default OnlineNotebook