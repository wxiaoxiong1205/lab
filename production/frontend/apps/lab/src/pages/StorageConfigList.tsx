import React, { useEffect, useState } from 'react'
import { Badge, Button, Card, Col, ConfigProvider, Form, Input, Modal, Row, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, CloseOutlined, CloudServerOutlined, DatabaseOutlined, DeleteOutlined, EditOutlined, ExperimentOutlined, FileSyncOutlined, FolderOutlined, InfoCircleOutlined, LinkOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { StorageConfig, StorageType } from '../types'
import { storageConfigService } from '../services/storageConfigService'
import StorageClusterBindingModal from '../components/storage/StorageClusterBindingModal'
import FileSystemFormatModal from '../components/storage/FileSystemFormatModal'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import { getTablePagination } from '@/utils/tablePagination'
import TableToolbar from '@/components/common/TableToolbar'
import { useConfigStore } from '@/stores/configStore'
import './StorageConfigList.css'

const { Title, Text } = Typography
const { Option } = Select

const STORAGE_TYPE_META: Record<string, { text: string, color: string }> = {
  TOS: { text: '火山引擎 TOS', color: 'blue' },
  MINIO: { text: 'MinIO', color: 'green' },
  NFS: { text: 'NFS', color: 'orange' },
  OBS: { text: '华为云 OBS', color: 'purple' },
  EOS: { text: '移动云 EOS', color: 'cyan' },
}

const getStorageTypeMeta = (type?: string) => {
  const normalizedType = type?.toUpperCase()
  return normalizedType
    ? STORAGE_TYPE_META[normalizedType] || { text: type || '-', color: 'default' }
    : { text: '-', color: 'default' }
}

/**
 * 存储配置列表页面
 */
const StorageConfigList: React.FC = () => {
  const [form] = Form.useForm()
  const [searchForm] = Form.useForm()
  // 状态管理
  const [loading, setLoading] = useState(false)
  const [configs, setConfigs] = useState<StorageConfig[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalCount, setTotalCount] = useState(0) // 所有数据的总数（不受搜索影响）
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingConfig, setEditingConfig] = useState<StorageConfig | null>(null)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [isBindingModalVisible, setIsBindingModalVisible] = useState(false)
  const [selectedConfigForBinding, setSelectedConfigForBinding] = useState<StorageConfig | null>(null)
  const [isFormatModalVisible, setIsFormatModalVisible] = useState(false)
  const [selectedConfigForFormat, setSelectedConfigForFormat] = useState<StorageConfig | null>(null)
  const { config, providerType } = useConfigStore()
  // 加载配置列表
  const loadConfigs = async (params: any = {}) => {
    try {
      setLoading(true)
      const response = await storageConfigService.getStorageConfigs({
        page: currentPage,
        page_size: pageSize,
        ...params,
      })
      setConfigs(response.items)
      setTotal(response.total)
      // 如果没有搜索参数，说明是初始加载，保存总数为 totalCount
      if (!params.search && !params.type) {
        setTotalCount(response.total)
      }
    }
    catch (error) {
      // message.error("加载存储配置失败");
      console.error('Load configs error:', error)
    }
    finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    loadConfigs()
  }, [currentPage, pageSize])
  // 搜索处理
  const handleSearch = (values: any) => {
    setCurrentPage(1)
    loadConfigs(values)
  }
  // 重置搜索
  const handleResetSearch = () => {
    searchForm.resetFields()
    setCurrentPage(1)
    loadConfigs()
  }
  // 打开创建/编辑模态框
  const openModal = (config?: StorageConfig) => {
    if (config) {
      setEditingConfig(config)
      const formValues: any = {
        name: config.name,
        description: config.description,
        type: config.type,
        ...config.config,
      }
      // 如果已格式化，密钥字段显示为隐藏值
      if (config.is_init) {
        if (formValues.secret_key) {
          formValues.secret_key = '••••••••'
        }
        // Access Key 可以完整展示，不需要隐藏
      }
      form.setFieldsValue(formValues)
    }
    else {
      setEditingConfig(null)
      form.resetFields()
      form.setFieldsValue({ type: 'TOS' })
    }
    setIsModalVisible(true)
  }
  // 关闭模态框
  const closeModal = () => {
    setIsModalVisible(false)
    setEditingConfig(null)
    form.resetFields()
  }
  // 设置表单值
  const setFormValues = () => {
    if (editingConfig) {
      const formValues: any = {
        name: editingConfig.name,
        description: editingConfig.description,
        type: editingConfig.type,
        ...editingConfig.config,
      }
      // 如果已格式化，密钥字段显示为隐藏值
      if (editingConfig.is_init) {
        if (formValues.secret_key) {
          formValues.secret_key = '••••••••'
        }
        // Access Key 可以完整展示，不需要隐藏
      }
      form.setFieldsValue(formValues)
    }
  }
  // 保存配置
  const handleSave = async (values: any) => {
    // 如果已格式化，不允许保存
    if (editingConfig?.is_init) {
      message.warning('已格式化的存储配置不允许修改')
      return
    }
    try {
      setLoading(true)
      // 根据存储类型构建配置对象
      const configData: Record<string, any> = {}
      const { name, description, type, ...rest } = values
      // 根据存储类型提取相关配置
      switch (type) {
        case 'TOS':
          configData.endpoint = rest.endpoint
          configData.access_key = rest.access_key
          configData.secret_key = rest.secret_key
          configData.region = rest.region
          configData.bucket = rest.bucket
          break
        case 'EOS':
          configData.endpoint = rest.endpoint
          configData.access_key = rest.access_key
          configData.secret_key = rest.secret_key
          configData.bucket = rest.bucket
          break
        case 'MINIO':
          configData.endpoint = rest.endpoint
          configData.bucket = rest.bucket
          configData.access_key = rest.access_key
          configData.secret_key = rest.secret_key
          break
        case 'NFS':
          configData.endpoint = rest.endpoint
          configData.remote_path = rest.remote_path
          break
        case 'OBS':
          configData.endpoint = rest.endpoint
          configData.region = rest.region
          configData.bucket = rest.bucket
          configData.access_key = rest.access_key
          configData.secret_key = rest.secret_key
          break
      }
      const data = {
        name,
        description,
        type,
        config: configData,
      }
      if (editingConfig) {
        await storageConfigService.updateStorageConfig(editingConfig.id, data)
        message.success('更新成功')
      }
      else {
        await storageConfigService.createStorageConfig(data)
        message.success('创建成功')
      }
      closeModal()
      loadConfigs()
      // 如果是创建，totalCount +1；如果是编辑，totalCount 不变
      if (!editingConfig) {
        setTotalCount((prev) => prev + 1)
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : '保存失败'
      // message.error(errorMessage);
    }
    finally {
      setLoading(false)
    }
  }
  // 删除配置
  const handleDelete = async (id: number) => {
    try {
      setLoading(true)
      await storageConfigService.deleteStorageConfig(id)
      message.success('删除成功')
      loadConfigs()
      // 删除后，totalCount -1
      setTotalCount((prev) => Math.max(0, prev - 1))
    }
    catch (error) {
      // const errorMessage = error instanceof Error ? error.message : "删除失败";
      // message.error(errorMessage);
    }
    finally {
      setLoading(false)
    }
  }
  // 测试连接
  const handleTestConnection = async (id: number) => {
    try {
      setTestingId(id)
      const result = await storageConfigService.testStorageConfig(id)
      console.log(result)
      if (result.is_connected) {
        message.success(result.message || '测试连接成功')
      }
      else {
        message.error(result.message || '测试连接失败')
      }
      loadConfigs()
    }
    catch (error) {
      loadConfigs()
      // const errorMessage = error instanceof Error ? error.message : "测试连接失败";
      // message.error(errorMessage);
    }
    finally {
      setTestingId(null)
    }
  }
  // 打开集群绑定管理
  const openBindingManager = (config: StorageConfig) => {
    setSelectedConfigForBinding(config)
    setIsBindingModalVisible(true)
  }
  // 关闭集群绑定管理
  const closeBindingManager = () => {
    setIsBindingModalVisible(false)
    setSelectedConfigForBinding(null)
    // 重新加载配置列表以更新集群数量
    loadConfigs()
  }
  // 文件系统格式化
  const handleFormatFileSystem = (config: StorageConfig) => {
    setSelectedConfigForFormat(config)
    setIsFormatModalVisible(true)
  }
  // 关闭格式化弹窗
  const closeFormatModal = () => {
    setIsFormatModalVisible(false)
    setSelectedConfigForFormat(null)
    // 重新加载配置列表以更新is_init状态
    loadConfigs()
  }
  // 创建操作下拉菜单项
  // const createActionMenu = (record: StorageConfig): MenuProps['items'] => {
  //   const items: MenuProps['items'] = [
  //     {
  //       key: 'test',
  //       icon: <ExperimentOutlined />,
  //       label: '测试连接',
  //       onClick: () => handleTestConnection(record.id),
  //     },
  //     {
  //       key: 'edit',
  //       icon: <EditOutlined />,
  //       label: '编辑',
  //       onClick: () => openModal(record),
  //     },
  //   ];
  //   // 只有连接正常时才显示集群绑定选项
  //   // if (record.status === '连接正常') {
  //   //   items.push({
  //   //     key: 'binding',
  //   //     icon: <LinkOutlined />,
  //   //     label: '集群绑定',
  //   //     onClick: () => openBindingManager(record),
  //   //   });
  //   // }
  //   items.push({
  //     type: 'divider',
  //   });
  //   items.push({
  //     key: 'delete',
  //     icon: <DeleteOutlined />,
  //     label: '删除',
  //     danger: true,
  //     // disabled: (record.cluster_number || 0) > 0,
  //     onClick: () => {
  //       // 如果已绑定集群，显示提示信息
  //       if ((record.cluster_number || 0) > 0) {
  //         message.warning('已绑定集群，无法删除');
  //         return;
  //       }
  //       Modal.confirm({
  //         title: '确定要删除这个存储配置吗？',
  //         content: '删除后将无法恢复，请谨慎操作。',
  //         okText: '确定',
  //         cancelText: '取消',
  //         onOk: () => handleDelete(record.id),
  //       });
  //     },
  //   });
  //   return items;
  // };
  // 动态配置字段渲染
  const renderConfigFields = (storageType: StorageType, isReadOnly: boolean = false, getFieldValue?: (name: string) => any) => {
    // 获取字段值的辅助函数
    const getValue = (fieldName: string) => {
      if (getFieldValue) {
        return getFieldValue(fieldName)
      }
      return form.getFieldValue(fieldName)
    }
    const renderReadOnlyField = (icon: React.ReactNode, value: React.ReactNode, preserveOverflow = false) => (
      <div className={`storage-config-readonly-field${preserveOverflow ? ' storage-config-readonly-field-visible' : ''}`}>
        {icon}
        <span className="storage-config-readonly-text">{value || '-'}</span>
      </div>
    )
    // 统一转换为大写进行匹配
    const normalizedType = storageType?.toUpperCase()
    switch (normalizedType) {
      case 'TOS':
      case 'EOS': {
        const storageLabel = normalizedType === 'EOS' ? '移动云EOS' : '火山引擎TOS'
        return (
          <Row gutter={16}>
            <Col span={normalizedType === 'EOS' ? 24 : 12}>
              <Form.Item
                name="endpoint"
                label="终端节点"
                rules={isReadOnly ? [] : [
                  { required: true, message: `请输入${normalizedType}终端节点` },
                ]}
                tooltip={`${storageLabel}对象存储的访问终端节点`}
              >
                {isReadOnly
                  ? renderReadOnlyField(<CloudServerOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('endpoint'), true)
                  : (<Input placeholder={normalizedType === 'EOS' ? '请输入移动云EOS终端节点' : '例如：tos-cn-beijing.volces.com'} prefix={<CloudServerOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
            {normalizedType !== 'EOS' && (
              <Col span={12}>
                <Form.Item
                  name="region"
                  label="地区 (Region)"
                  rules={isReadOnly ? [] : [
                    { required: true, message: '请输入地区' },
                  ]}
                  tooltip={`${storageLabel}的地区标识`}
                >
                  {isReadOnly
                    ? renderReadOnlyField(<CloudServerOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('region'))
                    : (<Input placeholder="例如：cn-beijing" prefix={<CloudServerOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
                </Form.Item>
              </Col>
            )}
            <Col span={24}>
              <Form.Item
                name="bucket"
                label="存储桶 (Bucket)"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入存储桶名称' },
                  { min: 3, max: 63, message: '存储桶名称长度在3-63个字符之间' },
                  { pattern: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/, message: '存储桶名称只能包含小写字母、数字和连字符，且不能以连字符开头或结尾' },
                ]}
                tooltip={`${normalizedType}中的存储桶名称，用于存储对象`}
              >
                {isReadOnly
                  ? renderReadOnlyField(<FolderOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('bucket'), true)
                  : (<Input placeholder="例如：my-bucket" prefix={<FolderOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                name="access_key"
                label="访问密钥 (Access Key)"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入访问密钥' },
                ]}
              >
                {isReadOnly
                  ? renderReadOnlyField(<DatabaseOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('access_key'), true)
                  : (<Input placeholder="请输入Access Key" prefix={<DatabaseOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                name="secret_key"
                label="密钥 (Secret Key)"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入密钥' },
                  { min: 8, message: '密钥长度至少8位' },
                ]}
              >
                {isReadOnly
                  ? renderReadOnlyField(<DatabaseOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, '********', true)
                  : (<Input.Password placeholder="请输入Secret Key" prefix={<DatabaseOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
          </Row>
        )
      }
      case 'MINIO':
        return (
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="endpoint"
                label="终端节点"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入MinIO终端节点' },
                ]}
                tooltip="MinIO服务的访问地址"
              >
                {isReadOnly
                  ? renderReadOnlyField(<DatabaseOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('endpoint'))
                  : (<Input placeholder="例如：localhost:9000 或 minio.example.com:9000" prefix={<DatabaseOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                name="bucket"
                label="桶"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入桶名称' },
                  { min: 3, max: 63, message: '桶名称长度在3-63个字符之间' },
                  { pattern: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/, message: '桶名称只能包含小写字母、数字和连字符，且不能以连字符开头或结尾' },
                ]}
                tooltip="MinIO中的桶名称，用于存储对象"
              >
                {isReadOnly
                  ? renderReadOnlyField(<FolderOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('bucket'), true)
                  : (<Input placeholder="例如：my-bucket" prefix={<FolderOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="access_key"
                label="访问密钥 (Access Key)"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入访问密钥' },
                  { min: 3, message: '访问密钥长度至少3位' },
                ]}
              >
                {isReadOnly
                  ? renderReadOnlyField(<DatabaseOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('access_key'), true)
                  : (<Input placeholder="默认：minioadmin" prefix={<DatabaseOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="secret_key"
                label="密钥 (Secret Key)"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入密钥' },
                  { min: 8, message: '密钥长度至少8位' },
                ]}
              >
                {isReadOnly
                  ? renderReadOnlyField(<DatabaseOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, '********', true)
                  : (<Input.Password placeholder="默认：minioadmin" prefix={<DatabaseOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
          </Row>
        )
      case 'NFS':
        return (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="endpoint"
                label="NFS服务器地址"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入NFS服务器地址' },
                ]}
                tooltip="NFS服务器的IP地址或主机名"
              >
                {isReadOnly
                  ? renderReadOnlyField(<FolderOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('endpoint'), true)
                  : (<Input placeholder="例如：192.168.1.11 或 nfs.example.com" prefix={<FolderOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="remote_path"
                label="远程路径"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入NFS远程路径' },
                ]}
                tooltip="NFS服务器上的共享路径"
              >
                {isReadOnly
                  ? renderReadOnlyField(<FolderOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('remote_path'), true)
                  : (<Input placeholder="例如：/data/shared 或 /export/storage" prefix={<FolderOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
          </Row>
        )
      case 'OBS':
        return (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="region"
                label="地区 (Region)"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入地区' },
                ]}
                tooltip="华为云OBS的地区标识"
              >
                {isReadOnly
                  ? renderReadOnlyField(<CloudServerOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('region'))
                  : (<Input placeholder="例如：cn-guangzhou" prefix={<CloudServerOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                name="bucket"
                label="存储桶 (Bucket)"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入存储桶名称' },
                  { min: 3, max: 63, message: '存储桶名称长度在3-63个字符之间' },
                  { pattern: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/, message: '存储桶名称只能包含小写字母、数字和连字符，且不能以连字符开头或结尾' },
                ]}
                tooltip={`${normalizedType}中的存储桶名称，用于存储对象`}
              >
                {isReadOnly
                  ? renderReadOnlyField(<FolderOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('bucket'), true)
                  : (<Input placeholder="例如：my-bucket" prefix={<FolderOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                name="access_key"
                label="访问密钥 (Access Key)"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入访问密钥' },
                ]}
              >
                {isReadOnly
                  ? renderReadOnlyField(<DatabaseOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, getValue('access_key'), true)
                  : (<Input placeholder="请输入Access Key" prefix={<DatabaseOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                name="secret_key"
                label="密钥 (Secret Key)"
                rules={isReadOnly ? [] : [
                  { required: true, message: '请输入密钥' },
                  { min: 8, message: '密钥长度至少8位' },
                ]}
              >
                {isReadOnly
                  ? renderReadOnlyField(<DatabaseOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />, '********', true)
                  : (<Input.Password placeholder="请输入Secret Key" prefix={<DatabaseOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
              </Form.Item>
            </Col>
          </Row>
        )
      default:
        return (
          <div className="text-center px-5 py-10 text-[var(--lab-color-placeholder)]">
            <SettingOutlined className="text-[32px] mb-2" />
            <div>请先选择存储类型</div>
          </div>
        )
    }
  }
  // 表格列定义
  const columns = [
    {
      title: '存储名称',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 100,
      render: (text: string) => (<Text strong>{text}</Text>),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 240,
      ellipsis: true,
    },
    {
      title: '存储类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => {
        const typeMeta = getStorageTypeMeta(type)
        return <Tag color={typeMeta.color}>{typeMeta.text}</Tag>
      },
    },
    {
      title: '集群数量',
      key: 'cluster_number',
      width: 100,
      hidden: config?.PROVIDER_TYPE === providerType,
      render: (record: StorageConfig) => (<Badge count={record.cluster_number || 0} showZero color="blue" />),
    },
    {
      title: '连接状态',
      key: 'status',
      width: 130,
      render: (record: StorageConfig) => {
        const isSuccess = record.status === '连接正常'
        return (
          <Space>
            {isSuccess ? (
              <>
                <CheckCircleOutlined className="text-[var(--lab-color-success)]" />
                <span className="text-[var(--lab-color-success)]">{record.status}</span>
              </>
            ) : (
              <>
                <CloseCircleOutlined className="text-[var(--lab-color-danger)]" />
                <span className="text-[var(--lab-color-danger)]">{record.status || '未测试'}</span>
              </>
            )}
          </Space>
        )
      },
    },
    {
      title: '最后测试时间',
      dataIndex: 'last_test_time',
      key: 'last_test_time',
      width: 180,
      render: (time: string) => (time ? new Date(time).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right' as const,
      render: (record: StorageConfig) => {
        const actions: TableActionItem[] = [
          {
            key: 'test',
            label: '测试连接',
            icon: <ExperimentOutlined />,
            loading: testingId === record.id,
            onClick: () => handleTestConnection(record.id),
          },
          {
            key: 'edit',
            label: record.is_init ? '详情' : '编辑',
            icon: record.is_init ? <InfoCircleOutlined /> : <EditOutlined />,
            onClick: () => openModal(record),
          },
          {
            key: 'format',
            label: '文件系统格式化',
            icon: <FileSyncOutlined />,
            visible: record.status === '连接正常',
            disabled: record.is_init,
            onClick: () => handleFormatFileSystem(record),
          },
          {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => {
              if ((record.cluster_number || 0) > 0) {
                message.warning('已绑定集群，无法删除')
                return
              }
              Modal.confirm({
                title: '确定要删除这个存储配置吗？',
                content: '删除后将无法恢复，请谨慎操作。',
                okText: '确定',
                cancelText: '取消',
                onOk: () => handleDelete(record.id),
              })
            },
          },
        ]
        return (
          <Space size={24} className="storage-config-actions">
            <TableActionColumn actions={actions} maxVisible={2} />
          </Space>
        )
      },
    },
  ]
  const [storageType, setStorageType] = useState<StorageType>('TOS')
  return (
    <div className="storage-config-list-container lab-list-page-shell">
      <Space direction="vertical" size="large" className="w-full">
        {/* 页面标题 */}
        <div>
          <Title level={3} className="m-0">
            存储配置管理
          </Title>
          <Text type="secondary">
            管理和配置不同类型的存储，并进行文件系统格式化
          </Text>
        </div>

        <TableToolbar
          form={searchForm}
          onSearch={handleSearch}
          searchFormItems={(
            <>
              <Form.Item name="search" className="mb-0">
                <Input placeholder="搜索配置名称或描述" prefix={<SearchOutlined />} className="w-[250px]" />
              </Form.Item>
              <Form.Item name="type" className="mb-0">
                <Select placeholder="存储类型" className="w-[120px]" allowClear>
                  <Option value="TOS">TOS</Option>
                  <Option value="MINIO">MinIO</Option>
                  <Option value="NFS">NFS</Option>
                  <Option value="OBS">OBS</Option>
                  <Option value="EOS">移动云 EOS</Option>
                </Select>
              </Form.Item>
            </>
          )}
          rightActions={[
            {
              key: 'search',
              label: '搜索',
              type: 'primary',
              onClick: () => searchForm.submit(),
            },
            {
              key: 'reset',
              label: '重置',
              onClick: handleResetSearch,
            },
          ]}
          toolbarActions={[
            {
              key: 'create',
              label: '新建配置',
              type: 'primary',
              onClick: () => openModal(),
              loading,
              disabled: totalCount >= 1,
            },
            {
              key: 'refresh',
              label: '刷新',
              onClick: () => loadConfigs(),
              loading,
            },
          ]}
        />

        {/* 配置列表 */}
        <Card className="storage-config-table-card">
          <Table
            columns={columns}
            dataSource={configs}
            rowKey="id"
            loading={loading}
            className="storage-config-table"
            pagination={getTablePagination({
              total,
              current: currentPage,
              pageSize,
              onChange: (page, size) => {
                setCurrentPage(page)
                setPageSize(size || 10)
              },
            })}
            scroll={{ x: 1000 }}
          />
        </Card>
      </Space>

      {/* 创建/编辑对话框 */}
      <Modal
        title={(
          <div className="flex items-center">
            <ConfigProvider theme={{ token: { colorPrimary: '#1890ff' } }}>
              {editingConfig ? (editingConfig.is_init ? (<InfoCircleOutlined className="mr-2" />) : (<EditOutlined className="mr-2" />)) : (<PlusOutlined className="mr-2" />)}
            </ConfigProvider>
            <span>
              {editingConfig
                ? editingConfig.is_init
                  ? '存储配置详情'
                  : '编辑存储配置'
                : '新建存储配置'}
            </span>
            {editingConfig && (
              <Tag color="blue" className="ml-2">
                {editingConfig.name}
              </Tag>
            )}
          </div>
        )}
        open={isModalVisible}
        onCancel={closeModal}
        footer={null}
        width={650}
        destroyOnClose
        maskClosable={false}
        afterOpenChange={(open) => {
          if (open && editingConfig) {
          // Modal打开后设置表单值
            setTimeout(() => setFormValues(), 50)
          }
        }}
      >
        <div className="py-2">
          <Form form={form} layout="vertical" onFinish={handleSave} preserve size="large">
            {/* 基本信息区域 */}
            <div className="storage-config-section">
              <div className="storage-config-section-title">
                <InfoCircleOutlined className="mr-1.5 text-[var(--lab-color-brand-primary)]" />
                基本信息
              </div>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="name"
                    label="配置名称"
                    rules={editingConfig?.is_init
                      ? []
                      : [
                          { required: true, message: '请输入配置名称' },
                          { min: 2, max: 50, message: '配置名称长度在2-50个字符之间' },
                        ]}
                  >
                    {editingConfig?.is_init ? (
                      <div className="storage-config-readonly-field storage-config-readonly-field-visible">
                        <DatabaseOutlined className="text-[var(--lab-color-text-muted)] mr-2 shrink-0" />
                        <span className="storage-config-readonly-text">
                          {form.getFieldValue('name') || editingConfig?.name || '-'}
                        </span>
                      </div>
                    ) : (<Input placeholder="请输入存储配置名称" prefix={<DatabaseOutlined className="text-[var(--lab-color-placeholder)]" />} />)}
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="type" label="存储类型" rules={editingConfig?.is_init ? [] : [{ required: true, message: '请选择存储类型' }]}>
                    {editingConfig?.is_init ? (
                      <div className="storage-config-readonly-field storage-config-readonly-field-visible">
                        <span className="storage-config-readonly-text">
                          {getStorageTypeMeta(form.getFieldValue('type') || editingConfig?.type).text}
                        </span>
                      </div>
                    ) : (
                      <Select placeholder="请选择存储类型" onChange={(value) => setStorageType(value)}>
                        <Option value="TOS">
                          <Space>
                            <CloudServerOutlined className="text-[var(--lab-color-brand-primary)]" />
                            火山引擎 TOS
                          </Space>
                        </Option>
                        <Option value="MINIO">
                          <Space>
                            <DatabaseOutlined className="text-[var(--lab-color-success)]" />
                            MinIO
                          </Space>
                        </Option>
                        <Option value="NFS">
                          <Space>
                            <FolderOutlined className="text-[var(--lab-color-warning)]" />
                            NFS
                          </Space>
                        </Option>
                        <Option value="OBS">
                          <Space>
                            <CloudServerOutlined className="text-[var(--lab-color-sky)]" />
                            华为云 OBS
                          </Space>
                        </Option>
                        <Option value="EOS">
                          <Space>
                            <CloudServerOutlined className="text-[var(--lab-color-cyan)]" />
                            移动云 EOS
                          </Space>
                        </Option>
                      </Select>
                    )}
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="description" label="描述信息">
                {editingConfig?.is_init ? (
                  <div className="storage-config-readonly-field storage-config-readonly-field-description">
                    <span>{form.getFieldValue('description') || editingConfig?.description || '-'}</span>
                  </div>
                ) : (<Input.TextArea placeholder="请输入存储配置的描述信息（可选）" rows={3} maxLength={1000} showCount />)}
              </Form.Item>
            </div>

            {/* 配置参数区域 */}
            <div className="storage-config-section">
              <div className="storage-config-section-title">
                <SettingOutlined className="mr-1.5 text-[var(--lab-color-brand-primary)]" />
                配置参数
              </div>

              {/* 动态配置字段 */}
              <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type || prevValues !== currentValues}>
                {({ getFieldValue }) => {
                  const currentStorageType = getFieldValue('type') || storageType
                  const isReadOnly = editingConfig?.is_init || false
                  return renderConfigFields(currentStorageType, isReadOnly, getFieldValue)
                }}
              </Form.Item>
            </div>

            {/* 操作按钮 */}
            {!editingConfig?.is_init && (
              <Form.Item className="mb-0 text-right">
                <Space size="middle">
                  <Button size="large" onClick={closeModal} icon={<CloseOutlined />}>
                    取消
                  </Button>
                  <Button type="primary" htmlType="submit" loading={loading} size="large" icon={editingConfig ? <SaveOutlined /> : <PlusOutlined />}>
                    {editingConfig ? '保存更新' : '创建配置'}
                  </Button>
                </Space>
              </Form.Item>
            )}
          </Form>
        </div>
      </Modal>

      {/* 集群绑定管理模态框 */}
      <StorageClusterBindingModal open={isBindingModalVisible} onCancel={closeBindingManager} storageConfigId={selectedConfigForBinding?.id || null} storageConfigName={selectedConfigForBinding?.name} onSuccess={() => loadConfigs()} />

      {/* 文件系统格式化模态框 */}
      <FileSystemFormatModal open={isFormatModalVisible} onCancel={closeFormatModal} onSuccess={closeFormatModal} storageConfigId={selectedConfigForFormat?.id || 0} storageConfigName={selectedConfigForFormat?.name || ''} />
    </div>
  )
}
export default StorageConfigList
