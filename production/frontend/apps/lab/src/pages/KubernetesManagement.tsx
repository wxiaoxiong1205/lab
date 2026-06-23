import React, { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Popover,
  Row,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  ShopOutlined,
  ToolOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { TabsProps, UploadFile } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { KubeconfigImportRequest, KubernetesCluster, RegistryConfig, StorageConfig } from '../types'
import {
  type ClusterConnectivityResponse,
  type ClusterUpdateRequest,
  type PaginationParams,
  deleteKubernetesCluster,
  getKubernetesCluster,
  getKubernetesClusters,
  importKubeconfig,
  testClusterConnection,
  updateKubernetesCluster,
} from '../services/kubernetesService'
import { storageConfigService } from '../services/storageConfigService'
import { registryService } from '../services/registryService'
import { bindMount, bindRepository, bindStorage } from '../services/kubernetesResourceService'
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/tablePagination'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import TableToolbar from '@/components/common/TableToolbar'
import './KubernetesManagement.css'

const { Title, Text } = Typography
const { TextArea } = Input

interface ImportFormValues {
  name: string
  description?: string
}

interface UpdateFormValues {
  name: string
  config?: string
  description?: string
  api_server: string
}

/**
 * Kubernetes集群管理页面组件
 */
const KubernetesManagement: React.FC = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  // 状态管理
  const [isImportModalVisible, setIsImportModalVisible] = useState(false)
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [currentCluster, setCurrentCluster] = useState<KubernetesCluster | null>(null)
  const [importForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [importType, setImportType] = useState<'text' | 'file'>('text')
  const [kubeconfigContent, setKubeconfigContent] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [testingClusters, setTestingClusters] = useState<Set<string>>(new Set())

  // 绑定模态框状态管理
  const [isStorageBindModalVisible, setIsStorageBindModalVisible] = useState(false)
  const [isRegistryBindModalVisible, setIsRegistryBindModalVisible] = useState(false)
  const [selectedClusterForBind, setSelectedClusterForBind] = useState<KubernetesCluster | null>(null)

  // 跟踪当前正在绑定的配置ID
  const [bindingStorageConfigId, setBindingStorageConfigId] = useState<number | null>(null)
  const [bindingRegistryConfigId, setBindingRegistryConfigId] = useState<number | null>(null)

  // 获取集群列表
  const { data: clusters = [], isLoading, refetch } = useQuery<KubernetesCluster[]>({
    queryKey: ['kubernetes-clusters'],
    queryFn: () => getKubernetesClusters({ page: 1, size: 50 }),
    refetchInterval: 30000, // 30秒自动刷新
  })

  // 获取存储配置列表
  const { data: storageConfigs = [], isLoading: storageLoading, refetch: refetchStorageConfigs } = useQuery<StorageConfig[]>({
    queryKey: ['storage-configs-for-bind'],
    queryFn: async () => {
      const result = await storageConfigService.getStorageConfigs({ page: 1, page_size: 50, available: true })
      return result.items
    },
    enabled: false, // 禁用自动获取
  })

  // 获取仓库配置列表
  const { data: registryConfigs = [], isLoading: registryLoading, refetch: refetchRegistryConfigs } = useQuery<RegistryConfig[]>({
    queryKey: ['registry-configs-for-bind'],
    queryFn: async () => {
      // 如果当前选择的集群已绑定仓库配置，则不传available参数，显示所有配置
      // 如果未绑定，则传available: true，只显示可用的配置
      const queryParams: Record<string, any> = { page: 1, page_size: 50 }
      if (!selectedClusterForBind?.repository_id) {
        queryParams.available = true
      }
      const result = await registryService.getRegistryConfigs(queryParams)
      return result.items
    },
    enabled: false, // 禁用自动获取
  })

  // 导入kubeconfig
  const importMutation = useMutation({
    mutationFn: importKubeconfig,
    onSuccess: () => {
      message.success('导入成功')
      setIsImportModalVisible(false)
      resetImportForm()
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] })
    },
    onError: (error: Error) => {
      // message.error(`导入失败: ${error.message}`);
      console.error('导入失败:', error)
    },
  })

  // 删除集群
  const deleteMutation = useMutation({
    mutationFn: deleteKubernetesCluster,
    onSuccess: () => {
      message.success('删除成功')
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] })
    },
    onError: (error: Error) => {
      // message.error(`删除失败: ${error.message}`);
    },
  })

  // 更新集群
  const updateMutation = useMutation({
    mutationFn: ({ clusterId, data }: { clusterId: string, data: ClusterUpdateRequest }) =>
      updateKubernetesCluster(clusterId, data),
    onSuccess: () => {
      message.success('更新成功')
      setIsEditModalVisible(false)
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] })
    },
    onError: (error: Error) => {
      message.error(`更新失败: ${error.message}`)
    },
  })

  // 测试连接
  const testConnectionMutation = useMutation({
    mutationFn: testClusterConnection,
    onSuccess: (data: ClusterConnectivityResponse) => {
      const clusterId = String(data.cluster_id)
      setTestingClusters((prev) => {
        const newSet = new Set(prev)
        newSet.delete(clusterId)
        return newSet
      })

      if (data.is_connected) {
        message.success(`连接测试成功`)
      }
      else {
        message.error(`连接测试失败`)
      }
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] })
    },
    onError: (error: Error, variables: string) => {
      setTestingClusters((prev) => {
        const newSet = new Set(prev)
        newSet.delete(variables)
        return newSet
      })
      message.error(`连接测试失败: ${error.message}`)
    },
  })

  // 重置导入表单
  const resetImportForm = () => {
    importForm.resetFields()
    setFileList([])
    setKubeconfigContent('')
    setImportType('text')
  }

  // 处理导入
  const handleImport = async (values: ImportFormValues) => {
    const request: KubeconfigImportRequest = {
      name: values.name,
      description: values.description,
      config: kubeconfigContent,
    }
    await importMutation.mutateAsync(request)
  }

  // 处理编辑
  const handleEdit = async (cluster: KubernetesCluster) => {
    try {
      setCurrentCluster(cluster)

      // 获取集群详细信息
      const clusterDetail = await getKubernetesCluster(String(cluster.id))

      editForm.setFieldsValue({
        name: clusterDetail.name,
        config: clusterDetail.configmap || '',
        description: clusterDetail.description || '',
        api_server: clusterDetail.api_server || clusterDetail.server || '',
      })

      setIsEditModalVisible(true)
    }
    catch (error) {
      message.error('加载集群信息失败')
      console.error('Load cluster info error:', error)
    }
  }

  // 处理更新
  const handleUpdate = async (values: UpdateFormValues) => {
    if (!currentCluster) return

    const updateData = {
      name: values.name,
      config: values.config,
      description: values.description,
      api_server: values.api_server,
    }

    await updateMutation.mutateAsync({ clusterId: String(currentCluster.id), data: updateData })
  }

  // 处理删除
  const handleDelete = (clusterId: string) => {
    deleteMutation.mutate(clusterId)
  }

  // 处理测试连接
  const handleTestConnection = (clusterId: string) => {
    setTestingClusters((prev) => new Set(prev).add(clusterId))
    testConnectionMutation.mutate(clusterId)
  }

  // 处理存储配置绑定
  const handleStorageBindClick = (cluster: KubernetesCluster) => {
    // 检查是否已绑定仓库配置
    if (!cluster.repository_id) {
      message.warning('请先绑定仓库配置')
      return
    }
    setSelectedClusterForBind(cluster)
    setIsStorageBindModalVisible(true)
    // 打开模态框时重新获取存储配置数据
    refetchStorageConfigs()
  }

  // 处理仓库配置绑定
  const handleRegistryBindClick = (cluster: KubernetesCluster) => {
    setSelectedClusterForBind(cluster)
    setIsRegistryBindModalVisible(true)
    // 打开模态框时重新获取仓库配置数据
    refetchRegistryConfigs()
  }

  // 处理重试挂载
  const handleRetryMount = (cluster: KubernetesCluster) => {
    if (cluster.storage_id) {
      retryMountMutation.mutate({
        storageConfigId: cluster.storage_id,
        clusterId: parseInt(cluster.id),
      })
    }
  }

  // 绑定存储配置
  const bindStorageConfig = useMutation({
    mutationFn: async ({ storageConfigId, clusterId }: { storageConfigId: number, clusterId: number }) => {
      setBindingStorageConfigId(storageConfigId)
      try {
        // 先绑定存储配置
        await bindStorage(storageConfigId, clusterId)
        // 绑定成功后调用 bindMount
        await bindMount(storageConfigId, clusterId)
      }
      finally {
        setBindingStorageConfigId(null)
      }
    },
    onSuccess: () => {
      message.success('存储配置绑定成功')
      setIsStorageBindModalVisible(false)
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] })
    },
    onError: (error: Error) => {
      // message.error(`存储配置绑定失败: ${error.message}`);
    },
  })

  // 绑定仓库配置
  const bindRegistryConfig = useMutation({
    mutationFn: async ({ registryConfigId, clusterId }: { registryConfigId: number, clusterId: number }) => {
      setBindingRegistryConfigId(registryConfigId)
      try {
        await bindRepository(registryConfigId, clusterId)
      }
      finally {
        setBindingRegistryConfigId(null)
      }
    },
    onSuccess: () => {
      message.success('仓库配置绑定成功')
      setIsRegistryBindModalVisible(false)
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] })
    },
    onError: (error: Error) => {
      message.error(`仓库配置绑定失败: ${error.message}`)
    },
  })

  // 重试挂载
  const retryMountMutation = useMutation({
    mutationFn: ({ storageConfigId, clusterId }: { storageConfigId: number, clusterId: number }) =>
      bindMount(storageConfigId, clusterId),
    onSuccess: () => {
      message.success('挂载重试成功')
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] })
    },
    onError: (error: Error) => {
      // message.error(`挂载重试失败: ${error.message}`);
    },
  })

  // 渲染状态标签
  const renderStatusTag = (status: string) => {
    // 后端返回中文状态，如"连接正常"
    const isOnline = status === '连接正常' || status === 'online'
    const statusConfig = {
      color: isOnline ? 'green' : 'red',
      icon: isOnline ? <CheckCircleOutlined /> : <CloseCircleOutlined />,
      text: status || '未知状态',
    }

    return (
      <Tag color={statusConfig.color} icon={statusConfig.icon}>
        {statusConfig.text}
      </Tag>
    )
  }

  // 渲染挂载状态标签
  const renderMountStatusTag = (record: KubernetesCluster) => {
    const isMounted = record.is_mount === true
    const hasConfigs = !!record.repository_id && !!record.storage_id

    let statusConfig

    if (isMounted) {
      // 已挂载
      statusConfig = {
        color: 'green',
        icon: <CheckCircleOutlined />,
        text: '已挂载',
      }
    }
    else if (hasConfigs && !record.is_mount) {
      // 有配置但挂载失败
      statusConfig = {
        color: 'red',
        icon: <CloseCircleOutlined />,
        text: '挂载失败',
      }
    }
    else {
      // 未配置或未挂载
      statusConfig = {
        color: 'default',
        icon: <CloseCircleOutlined />,
        text: '未挂载',
      }
    }

    return (
      <Tag color={statusConfig.color} icon={statusConfig.icon}>
        {statusConfig.text}
      </Tag>
    )
  }

  // 渲染标签列（版本、显卡类型、显卡型号、显存）
  const renderLabels = (_: any, record: KubernetesCluster) => {
    const version = record.version || '-'
    const ext = record.ext
    const gpuTypes = ext?.graphics_card_resource_type || []

    // 构建完整信息列表
    const fullInfo: string[] = []
    fullInfo.push(`版本: ${version}`)

    if (gpuTypes.length > 0) {
      gpuTypes.forEach((category) => {
        category.resource_types?.forEach((resourceType) => {
          fullInfo.push(`显卡类型: ${category.category}`)
          fullInfo.push(`显卡型号: ${resourceType.model || '-'}`)
          fullInfo.push(`显存: ${resourceType.memory || '-'}`)
        })
      })
    }
    else {
      fullInfo.push('显卡类型: -')
      fullInfo.push('显卡型号: -')
      fullInfo.push('显存: -')
    }

    // 构建显示文本（自适应，只显示关键信息）
    const displayTexts: string[] = []
    if (version && version !== '-') {
      displayTexts.push(version)
    }

    // 显示第一个显卡信息（如果有）
    if (gpuTypes.length > 0 && gpuTypes[0].resource_types?.length > 0) {
      const firstCategory = gpuTypes[0]
      const firstResource = firstCategory.resource_types[0]
      // 添加显卡类型
      if (firstCategory.category) {
        displayTexts.push(firstCategory.category)
      }
      // 添加显卡型号
      if (firstResource.model) {
        displayTexts.push(firstResource.model)
      }
      // 添加显存
      if (firstResource.memory) {
        displayTexts.push(firstResource.memory)
      }
    }

    // 构建悬浮提示内容
    const tooltipContent = (
      <div className="max-w-[300px]">
        {fullInfo.map((info, index) => (
          <div key={index} className="mb-1">
            {info}
          </div>
        ))}
      </div>
    )

    return (
      <Tooltip title={tooltipContent} placement="topLeft" color="blue">
        <div className="max-w-[200px] cursor-pointer">
          <Space size="small" wrap>
            {displayTexts.map((text, index) => (
              <Tag key={index} color="blue">{text}</Tag>
            ))}
            {displayTexts.length === 0 && <Tag>-</Tag>}
          </Space>
        </div>
      </Tooltip>
    )
  }

  // 表格列定义
  const columns: ColumnsType<KubernetesCluster> = [
    {
      title: '集群名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      fixed: 'left' as const,
      ellipsis: true,
      render: (text) => (
        <Space>
          <CloudServerOutlined />
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: 'API Server',
      dataIndex: 'server',
      key: 'server',
      width: 150,
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text} color="blue">
          <Text code className="text-xs">{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: '标签',
      dataIndex: 'labels',
      key: 'labels',
      render: renderLabels,
      width: 200,
    },
    {
      title: '节点数',
      dataIndex: 'nodeCount',
      key: 'nodeCount',
      width: 100,
      render: (count) => <Badge count={count} showZero color="blue" />,
    },
    {
      title: '连接状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatusTag,
    },
    {
      title: '挂载状态',
      dataIndex: 'is_mount',
      key: 'is_mount',
      width: 100,
      render: (_, record) => renderMountStatusTag(record),
    },
    {
      title: '存储配置',
      dataIndex: 'storage_id',
      key: 'storage_id',
      width: 100,
      render: (storage_id) => (
        <Tag color={storage_id ? 'green' : 'red'}>
          {storage_id ? '已配置' : '未配置'}
        </Tag>
      ),
    }, {
      title: '镜像仓库',
      dataIndex: 'repository_id',
      key: 'repository_id',
      width: 100,
      render: (repository_id) => (
        <Tag color={!repository_id ? 'red' : 'green'}>
          {!repository_id ? '未配置' : '已配置'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      width: 100,
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text) => new Date(text).toLocaleDateString(),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 340,
      render: (_, record) => {
        const actions: TableActionItem[] = [
          {
            key: 'test',
            label: '测试连接',
            icon: <ToolOutlined />,
            loading: testingClusters.has(String(record.id)),
            onClick: () => handleTestConnection(String(record.id)),
          },
          {
            key: 'bindStorage',
            label: '绑定存储配置',
            icon: <DatabaseOutlined />,
            visible: record.status === '连接正常',
            onClick: () => handleStorageBindClick(record),
          },
          {
            key: 'bindRegistry',
            label: '绑定仓库配置',
            icon: <ShopOutlined />,
            visible: record.status === '连接正常',
            onClick: () => handleRegistryBindClick(record),
          },
          {
            key: 'retryMount',
            label: '重试挂载',
            icon: <ReloadOutlined />,
            visible: !!(record.repository_id && record.storage_id && !record.is_mount),
            loading: retryMountMutation.isPending,
            onClick: () => handleRetryMount(record),
          },
          {
            key: 'edit',
            label: '编辑',
            icon: <EditOutlined />,
            onClick: () => handleEdit(record),
          },
          {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            confirm: {
              title: '确定要删除这个集群吗？',
              description: '删除后将无法恢复，请谨慎操作。',
              onConfirm: () => handleDelete(String(record.id)),
              okText: '删除',
              cancelText: '取消',
            },
          },
        ]
        return (
          <Space size={24} className="kubernetes-actions">
            <TableActionColumn actions={actions} maxVisible={2} />
          </Space>
        )
      },
    },
  ]

  // 导入标签页配置
  const importTabItems: TabsProps['items'] = [
    {
      key: 'text',
      label: '文本输入',
      children: (
        <div>
          <Alert
            message="请粘贴您的kubeconfig文件内容"
            description="支持标准的YAML格式kubeconfig文件"
            type="info"
            showIcon
            className="mb-4"
          />
          <p className="mt-2"></p>
          <TextArea
            placeholder="请粘贴kubeconfig文件内容..."
            rows={12}
            value={kubeconfigContent}
            onChange={(e) => setKubeconfigContent(e.target.value)}
            className="font-mono"
          />
        </div>
      ),
    },
    // {
    //   key: 'file',
    //   label: '文件上传',
    //   children: (
    //     <div>
    //       <Alert
    //         message="上传kubeconfig文件"
    //         description="支持.yaml、.yml、.config文件格式"
    //         type="info"
    //         showIcon
    //         className="mb-4"
    //       />
    //       <Upload
    //         accept=".yaml,.yml,.config"
    //         beforeUpload={() => false}
    //         fileList={fileList}
    //         onChange={({ fileList }) => setFileList(fileList)}
    //         maxCount={1}
    //       >
    //         <Button icon={<UploadOutlined />} className='mt-2'>选择文件</Button>
    //       </Upload>
    //     </div>
    //   ),
    // },
  ]

  return (
    <div className="kubernetes-management-container lab-list-page-shell">
      <div className="mb-4">
        <Title level={3} className="m-0">
          Kubernetes集群管理
        </Title>
        <Text type="secondary">
          管理和监控Kubernetes集群，支持kubeconfig导入和多集群管理
        </Text>
      </div>
      <TableToolbar
        leftActions={[
          {
            key: 'import',
            label: '导入集群',
            type: 'primary',
            onClick: () => setIsImportModalVisible(true),
            loading: isLoading,
          },
          {
            key: 'refresh',
            label: '刷新',
            onClick: () => refetch(),
            loading: isLoading,
          },
        ]}
      />

      {/* 集群列表表格 */}
      <Card className="kubernetes-table-card">
        <Table
          columns={columns}
          dataSource={clusters}
          rowKey="id"
          loading={isLoading}
          className="kubernetes-table"
          pagination={{
            pageSize: 10,
            showTotal: (total) => (
              <>
                共
                <strong>{total}</strong>
                {' '}
                个集群
              </>
            ),
            showSizeChanger: true,
            pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
          }}
          scroll={{ x: 1200 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
        />
      </Card>

      {/* 导入集群模态框 */}
      <Modal
        title="导入Kubernetes集群"
        open={isImportModalVisible}
        onCancel={() => {
          setIsImportModalVisible(false)
          resetImportForm()
        }}
        footer={null}
        width={800}
        destroyOnClose
      >
        <Form
          form={importForm}
          layout="vertical"
          onFinish={handleImport}
        >
          <Form.Item
            name="name"
            label="集群名称"
            rules={[{ required: true, message: '请输入集群名称' }]}
          >
            <Input placeholder="请输入集群名称" maxLength={50} />
          </Form.Item>

          <Form.Item
            name="description"
            label="集群描述"
          >
            <TextArea placeholder="请输入集群描述" maxLength={500} className="!h-30" />
          </Form.Item>

          <Form.Item label="导入方式">
            <Tabs
              activeKey={importType}
              onChange={(key) => setImportType(key as 'text' | 'file')}
              items={importTabItems}
            />
          </Form.Item>

          <Divider />

          <Form.Item>
            <Space className="float-right">
              <Button onClick={() => setIsImportModalVisible(false)}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={importMutation.isPending}
              >
                导入
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑集群模态框 */}
      <Modal
        title="编辑集群信息"
        open={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        footer={null}
        width={600}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdate}
        >
          <Form.Item
            name="name"
            label="集群名称"
            rules={[{ required: true, message: '请输入集群名称' }]}
          >
            <Input placeholder="请输入集群名称" />
          </Form.Item>

          <Form.Item
            name="description"
            label="集群描述"
          >
            <TextArea placeholder="请输入集群描述" maxLength={500} className="!h-30" />
          </Form.Item>

          <Form.Item
            name="api_server"
            label="Api Server"
            rules={[{ required: true, message: '请输入Api Server' }]}
          >
            <Input placeholder="请输入Api Server" />
          </Form.Item>

          <Form.Item
            name="config"
            label="集群配置 (YAML格式)"
          >
            <TextArea
              rows={12}
              disabled
              placeholder="请输入集群配置信息，支持YAML格式..."
              className="font-mono"
            />
          </Form.Item>

          <Divider />

          <Form.Item>
            <Space className="float-right">
              <Button onClick={() => setIsEditModalVisible(false)}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={updateMutation.isPending}
              >
                更新
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 存储配置绑定模态框 */}
      <Modal
        title={`为集群 "${selectedClusterForBind?.name}" 绑定存储配置`}
        open={isStorageBindModalVisible}
        onCancel={() => {
          setIsStorageBindModalVisible(false)
          setBindingStorageConfigId(null)
        }}
        footer={null}
        width={600}
        destroyOnClose
        maskClosable={false}

      >
        {storageLoading ? (
          <div className="text-center py-8">
            <Spin size="large" />
          </div>
        ) : storageConfigs.length === 0 ? (
          <div className="text-center py-8">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无存储配置"
            >
              <Button
                type="primary"
                onClick={() => {
                  setIsStorageBindModalVisible(false)
                  navigate(`/project/admin/storage`)
                }}
              >
                创建存储配置
              </Button>
            </Empty>
          </div>
        ) : (
          <List
            dataSource={storageConfigs}
            renderItem={(item) => {
              const isBound = selectedClusterForBind?.storage_id === item.id
              return (
                <List.Item
                  className="px-4 py-3 rounded-md cursor-pointer transition-colors duration-200 hover:bg-gray-50"
                  onClick={() => {
                    if (selectedClusterForBind && bindingStorageConfigId === null && !isBound) {
                      bindStorageConfig.mutate({
                        storageConfigId: item.id,
                        clusterId: parseInt(selectedClusterForBind.id),
                      })
                    }
                  }}
                  actions={[
                    <Tag color={item.status === '连接正常' ? 'green' : 'red'} key="status">
                      {item.status}
                    </Tag>,
                    <Button
                      type="primary"
                      size="small"
                      loading={bindingStorageConfigId === item.id}
                      disabled={isBound || (bindingStorageConfigId !== null && bindingStorageConfigId !== item.id)}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (selectedClusterForBind && bindingStorageConfigId === null && !isBound) {
                          bindStorageConfig.mutate({
                            storageConfigId: item.id,
                            clusterId: parseInt(selectedClusterForBind.id),
                          })
                        }
                      }}
                      key="bind"
                    >
                      {isBound ? '已绑定' : '绑定'}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={<span className="font-medium">{item.name}</span>}
                    description={`类型: ${item.type}`}
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Modal>

      {/* 仓库配置绑定模态框 */}
      <Modal
        title={`为集群 "${selectedClusterForBind?.name}" 绑定仓库配置`}
        open={isRegistryBindModalVisible}
        onCancel={() => {
          setIsRegistryBindModalVisible(false)
          setBindingRegistryConfigId(null)
        }}
        footer={null}
        width={600}
        destroyOnClose
        maskClosable={false}

      >
        {registryLoading ? (
          <div className="text-center py-8">
            <Spin size="large" />
          </div>
        ) : registryConfigs.length === 0 ? (
          <div className="text-center py-8">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无仓库配置"
            >
              <Button
                type="primary"
                onClick={() => {
                  setIsRegistryBindModalVisible(false)
                  navigate(`/project/admin/registry`)
                }}
              >
                创建仓库配置
              </Button>
            </Empty>
          </div>
        ) : (
          <List
            dataSource={registryConfigs}
            renderItem={(item) => {
              const isBound = selectedClusterForBind?.repository_id === item.id
              return (
                <List.Item
                  className="px-4 py-3 rounded-md cursor-pointer transition-colors duration-200 hover:bg-gray-50"
                  onClick={() => {
                    if (selectedClusterForBind && bindingRegistryConfigId === null && !isBound) {
                      bindRegistryConfig.mutate({
                        registryConfigId: item.id,
                        clusterId: parseInt(selectedClusterForBind.id),
                      })
                    }
                  }}
                  actions={[
                    <Tag color={item.status === '连接正常' ? 'green' : 'red'} key="status">
                      {item.status}
                    </Tag>,
                    <Button
                      type="primary"
                      size="small"
                      loading={bindingRegistryConfigId === item.id}
                      disabled={isBound || (bindingRegistryConfigId !== null && bindingRegistryConfigId !== item.id)}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (selectedClusterForBind && bindingRegistryConfigId === null && !isBound) {
                          bindRegistryConfig.mutate({
                            registryConfigId: item.id,
                            clusterId: parseInt(selectedClusterForBind.id),
                          })
                        }
                      }}
                      key="bind"
                    >
                      {isBound ? '已绑定' : '绑定'}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={<span className="font-medium">{item.name}</span>}
                    description={`地址: ${item.repository_address}`}
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Modal>

    </div>
  )
}

export default KubernetesManagement
