import React, { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type {
  KubernetesCluster,
  StorageClusterMapping,
  StorageClusterMappingCreate,
} from '../../types'
import { storageConfigService } from '../../services/storageConfigService'
import { getKubernetesClusters } from '../../services/kubernetesService'

const { Title, Text } = Typography
const { Option } = Select

interface Props {
  storageConfigId: number | string
  storageConfigName: string
}

/**
 * 存储集群映射管理组件
 */
const StorageClusterMappingManager: React.FC<Props> = ({
  storageConfigId,
  storageConfigName,
}) => {
  const [form] = Form.useForm()

  // 状态管理
  const [loading, setLoading] = useState(false)
  const [mappings, setMappings] = useState<StorageClusterMapping[]>([])
  const [availableClusters, setAvailableClusters] = useState<KubernetesCluster[]>([])
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingMapping, setEditingMapping] = useState<StorageClusterMapping | null>(null)

  // 加载映射列表
  const loadMappings = async () => {
    try {
      setLoading(true)
      const data = await storageConfigService.getStorageClusterMappings(String(storageConfigId))
      setMappings(data)
    }
    catch (error) {
      message.error('加载集群映射失败')
      console.error('Load mappings error:', error)
    }
    finally {
      setLoading(false)
    }
  }

  // 加载可用集群
  const loadAvailableClusters = async () => {
    try {
      const data = await getKubernetesClusters()
      setAvailableClusters(data)
    }
    catch (error) {
      message.error('加载集群列表失败')
      console.error('Load clusters error:', error)
    }
  }

  useEffect(() => {
    loadMappings()
    loadAvailableClusters()
  }, [storageConfigId])

  // 打开创建/编辑模态框
  const openModal = (mapping?: StorageClusterMapping) => {
    if (mapping) {
      setEditingMapping(mapping)
      form.setFieldsValue({
        cluster_id: mapping.cluster_id,
      })
    }
    else {
      setEditingMapping(null)
      form.resetFields()
    }
    setIsModalVisible(true)
  }

  // 关闭模态框
  const closeModal = () => {
    setIsModalVisible(false)
    setEditingMapping(null)
    form.resetFields()
  }

  // 保存映射
  const handleSave = async (values: Record<string, unknown>) => {
    try {
      setLoading(true)

      if (editingMapping) {
        // 编辑时只需要更新基本信息，没有可编辑的字段
        message.success('映射信息已确认')
      }
      else {
        const createData: StorageClusterMappingCreate = {
          cluster_id: values.cluster_id as string,
        }
        await storageConfigService.createStorageClusterMapping(String(storageConfigId), createData)
        message.success('创建映射成功')
      }

      closeModal()
      loadMappings()
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : '保存失败'
      message.error(errorMessage)
    }
    finally {
      setLoading(false)
    }
  }

  // 删除映射
  const handleDelete = async (mappingId: string) => {
    try {
      setLoading(true)
      await storageConfigService.deleteStorageClusterMapping(String(storageConfigId), mappingId)
      message.success('删除映射成功')
      loadMappings()
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : '删除失败'
      message.error(errorMessage)
    }
    finally {
      setLoading(false)
    }
  }

  // 获取未映射的集群
  const getUnmappedClusters = () => {
    const mappedClusterIds = mappings.map((mapping) => mapping.cluster_id)
    return availableClusters.filter((cluster) => !mappedClusterIds.includes(cluster.id))
  }

  // 表格列定义
  const columns: ColumnsType<StorageClusterMapping> = [
    {
      title: '集群名称',
      key: 'cluster_name',
      render: (_, record) => (
        <Space>
          <LinkOutlined />
          <span>{record.cluster_name || record.cluster_id}</span>
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => new Date(text).toLocaleDateString(),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="编辑映射">
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => openModal(record)}
            />
          </Tooltip>

          <Popconfirm
            title="确定要删除这个映射吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <div className="mb-4">
        <Space>
          <Title level={5} className="m-0">
            集群映射管理
          </Title>
          <Text type="secondary">
            管理存储配置"
            {storageConfigName}
            "的集群映射关系
          </Text>
        </Space>
      </div>

      <Alert
        message="集群映射说明"
        description="一个存储配置可以映射到多个Kubernetes集群，实现存储资源的共享。"
        type="info"
        showIcon
        className="mb-4"
      />

      <div className="mb-4">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => openModal()}
          disabled={getUnmappedClusters().length === 0}
        >
          添加集群映射
        </Button>
        {getUnmappedClusters().length === 0 && (
          <Text type="secondary" className="ml-2">
            所有可用集群已映射
          </Text>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={mappings}
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 500 }}
        locale={{
          emptyText: '暂无集群映射',
        }}
      />

      {/* 创建/编辑映射模态框 */}
      <Modal
        title={editingMapping ? '编辑集群映射' : '创建集群映射'}
        open={isModalVisible}
        onCancel={closeModal}
        footer={null}
        width={400}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
        >
          {!editingMapping && (
            <Form.Item
              name="cluster_id"
              label="选择集群"
              rules={[{ required: true, message: '请选择集群' }]}
            >
              <Select placeholder="请选择要映射的集群">
                {getUnmappedClusters().map((cluster) => (
                  <Option key={cluster.id} value={cluster.id}>
                    {cluster.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {editingMapping && (
            <Alert
              message="映射信息"
              description={`当前映射的集群: ${editingMapping.cluster_name || editingMapping.cluster_id}`}
              type="info"
              className="mb-4"
            />
          )}

          <Form.Item>
            <Space className="float-right">
              <Button onClick={closeModal}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
              >
                {editingMapping ? '确认' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

export default StorageClusterMappingManager
