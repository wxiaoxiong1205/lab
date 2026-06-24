import { useEffect, useState } from 'react'
import {
  Alert,
  Divider,
  Empty,
  Modal,
  Space,
  Spin,
  Tag,
  Transfer,
  Typography,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClusterOutlined,
  DatabaseOutlined,
} from '@ant-design/icons'
import React from 'react'
import { storageConfigService } from '../../services/storageConfigService'

const { Text } = Typography

interface StorageClusterBindingModalProps {
  open: boolean
  onCancel: () => void
  storageConfigId: number | null
  storageConfigName?: string
  onSuccess?: () => void
}

interface TransferItem {
  key: string
  title: string
  description: string
  status: 'online' | 'offline' | 'error'
  disabled?: boolean
}

/**
 * 存储配置集群绑定管理组件
 */
const StorageClusterBindingModal: React.FC<StorageClusterBindingModalProps> = ({
  open,
  onCancel,
  storageConfigId,
  storageConfigName,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [transferData, setTransferData] = useState<TransferItem[]>([])
  const [targetKeys, setTargetKeys] = useState<string[]>([])

  // 加载可用集群数据
  const loadAvailableClusters = async () => {
    if (!storageConfigName || !storageConfigId) {
      message.error('缺少存储配置信息')
      return
    }

    try {
      setLoading(true)

      // 并行获取可用集群列表和已绑定集群列表
      const [availableClustersResult, occupiedClusters] = await Promise.all([
        storageConfigService.getAvailableClusters({
          page: 1,
          size: 50,
        }),
        storageConfigService.getOccupiedClusters(storageConfigId),
      ])

      // 转换为Transfer组件需要的数据格式
      const transferItems: TransferItem[] = availableClustersResult.items.map((cluster) => ({
        key: cluster.id.toString(),
        title: cluster.name,
        description: `${cluster.api_server} (${cluster.version || '未知版本'}) - 节点数: ${cluster.node_number || 0}`,
        status: cluster.status,
        disabled: cluster.status === 'error' || cluster.status === 'offline', // 离线或错误状态的集群不可选
      }))

      // 处理已绑定的集群，确保它们也在dataSource中
      const boundClusterIds = occupiedClusters.map((cluster) => cluster.cluster_id.toString())

      // 为已绑定但不在可用集群列表中的集群创建TransferItem
      const missingBoundClusters: TransferItem[] = []
      occupiedClusters.forEach((boundCluster) => {
        const boundId = boundCluster.cluster_id.toString()
        const existsInAvailable = transferItems.some((item) => item.key === boundId)

        if (!existsInAvailable) {
          // 创建已绑定但不在可用列表中的集群项
          missingBoundClusters.push({
            key: boundId,
            title: boundCluster.cluster_name,
            description: `${boundCluster.api_server || '未知地址'} (已绑定集群)`,
            status: 'online', // 默认在线状态
            disabled: false,
          })
        }
      })

      // 合并可用集群和缺失的已绑定集群
      const allTransferItems = [...transferItems, ...missingBoundClusters]

      setTransferData(allTransferItems)
      setTargetKeys(boundClusterIds)
    }
    catch (error) {
      console.error('Load clusters error:', error)

      // 更详细的错误信息
      if (error instanceof Error) {
        message.error(`加载集群列表失败: ${error.message}`)
      }
      else {
        message.error('加载集群列表失败，请检查网络连接或联系管理员')
      }
    }
    finally {
      setLoading(false)
    }
  }

  // 保存集群绑定
  const handleSave = async () => {
    if (!storageConfigId) return

    try {
      setSaving(true)

      // 转换选中的集群ID为数字数组
      const clusterIds = targetKeys.map((id) => parseInt(id, 10))

      // 调用API绑定集群
      await storageConfigService.bindClusters(storageConfigId, clusterIds)

      message.success(`成功更新集群绑定，共绑定 ${targetKeys.length} 个集群`)
      onSuccess?.()
      onCancel()
    }
    catch (error) {
      message.error('保存集群绑定失败')
      console.error('Save binding error:', error)
    }
    finally {
      setSaving(false)
    }
  }

  // Transfer组件的渲染函数
  const renderTransferItem = (item: TransferItem) => {
    const statusIcon = {
      online: <CheckCircleOutlined className="text-[var(--lab-color-success)]" />,
      offline: <CloseCircleOutlined className="text-[var(--lab-color-danger)]" />,
      error: <CloseCircleOutlined className="text-[var(--lab-color-danger)]" />,
    }

    const statusText = {
      online: '在线',
      offline: '离线',
      error: '错误',
    }

    const statusColor = {
      online: 'success',
      offline: 'error',
      error: 'error',
    } as const

    return (
      <div className="py-2">
        <Space direction="vertical" size={4} className="w-full">
          <Space>
            <ClusterOutlined />
            <Text strong>{item.title}</Text>
            <Tag
              color={statusColor[item.status]}
              icon={statusIcon[item.status]}
            >
              {statusText[item.status]}
            </Tag>
          </Space>
          <Text type="secondary" className="text-[12px]">
            {item.description}
          </Text>
        </Space>
      </div>
    )
  }

  // 处理Transfer组件的变更
  const handleTransferChange = (keys: React.Key[]) => {
    setTargetKeys(keys as string[])
  }

  // 当Modal打开时加载数据
  useEffect(() => {
    if (open && storageConfigId && storageConfigName) {
      loadAvailableClusters()
    }
  }, [open, storageConfigId, storageConfigName])

  return (
    <Modal
      title={(
        <Space>
          <DatabaseOutlined />
          <span>存储集群绑定管理</span>
          {storageConfigName && (
            <Text type="secondary">
              -
              {storageConfigName}
            </Text>
          )}
        </Space>
      )}
      open={open}
      onCancel={onCancel}
      onOk={handleSave}
      confirmLoading={saving}
      width={800}
      destroyOnClose
      okText="保存绑定"
      cancelText="取消"
    >
      <div className="py-4">
        <Alert
          message="存储集群绑定说明"
          description="选择要绑定到此存储配置的Kubernetes集群。绑定后，集群可以使用该存储配置创建持久化卷。离线或错误状态的集群不可选择。"
          type="info"
          showIcon
          className="mb-4"
        />

        <Divider orientation="left">选择绑定集群</Divider>

        {loading ? (
          <div className="text-center py-10">
            <Spin size="large" />
            <div className="mt-4">
              <Text type="secondary">正在加载可用集群列表...</Text>
            </div>
          </div>
        ) : transferData.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无可用集群"
          />
        ) : (
          <>
            <div
              className="storage-transfer-container mb-4"
            >
              <Transfer
                dataSource={transferData}
                targetKeys={targetKeys}
                onChange={handleTransferChange}
                render={renderTransferItem}
                titles={['可用集群', '已绑定集群']}
                listStyle={{
                  width: 350,
                  height: 400,
                }}
                operations={['绑定']}
                oneWay
                showSearch
                filterOption={(inputValue, item) =>
                  item.title.toLowerCase().includes(inputValue.toLowerCase())
                  || item.description.toLowerCase().includes(inputValue.toLowerCase())}
                locale={{
                  itemUnit: '个集群',
                  itemsUnit: '个集群',
                  searchPlaceholder: '搜索集群名称',
                  notFoundContent: '暂无数据',
                }}
              />
            </div>

            <div className="mt-4">
              <Space>
                <Text type="secondary">
                  将绑定
                  {' '}
                  {targetKeys.length}
                  {' '}
                  个集群到此存储配置
                </Text>
              </Space>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default StorageClusterBindingModal
