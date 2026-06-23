import { useEffect, useState } from 'react'
import {
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import type { TablePaginationConfig, TableProps } from 'antd'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import CreateAccessKeyModal from './components/CreateAccessKeyModal'
import ViewAccessKeyModal from './components/ViewAccessKeyModal'
import {
  apiSecretDelete,
  apiSecretDisable,
  apiSecretEnable,
  apiSecretList,
} from '@/services/api'
import { useTransform } from '@/locales'
import Title from '@/components/Title'
import { DataSecurityLevelOption, UserPermissionLevel } from '@/types/permission'
import { PermissionHelper } from '@/utils/permission-helper'
import { useSystemConfig } from '@/hooks/use-system-config'

interface AccessKeyItem {
  id: number
  name: string
  models: string
  used_quota: string
  remain_quota: string
  expired_time: string
  status: number
  creator: string
  updated_time: string
  unlimited_quota: boolean
  balance: string
  balance_consumed: string
}

export default function AccessKeyPage() {
  const [keyName, setKeyName] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [currentEditAccessId, setCurrentEditAccessId] = useState<number>()
  const [currentViewAccessId, setCurrentViewAccessId] = useState<number>()
  const [isView, setIsView] = useState(false)
  const { $t } = useTransform()
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
    showTotal: (total) => $t(`总共 {total} 条`, { total }),
  })
  const [accessKeyStatus, setAccessKeyStatus] = useState<string | undefined>(
    undefined,
  )

  const { securityLevel, securityLevelEnabled } = useSystemConfig(true)

  // 获取可用的数据安全级别选项
  // const [securityLevels, setSecurityLevels] = useState<DataSecurityLevelOption[]>([]);
  const [dataLevel, setDataLevel] = useState<string | undefined>(undefined)

  const { amountSymbol } = useSystemConfig(true)

  // useEffect(() => {
  //   const enabledLevels = PermissionHelper.getEnabledDataSecurityLevels(securityLevel as UserPermissionLevel);
  //   setSecurityLevels(enabledLevels);
  // }, [securityLevel])

  const STATUS_MAP: Record<
    string,
    {
      label: string
      tag: string
    }
  > = {
    1: {
      label: $t('已启用'),
      tag: 'success',
    },
    2: {
      label: $t('已禁用'),
      tag: 'error',
    },
    3: {
      label: $t('已过期'),
      tag: 'purple',
    },
    4: {
      label: $t('已耗尽'),
      tag: 'orange',
    },
  }

  useEffect(() => {
    setPagination({
      ...pagination,
      showTotal: (total) => $t(`总共 {total} 条`, { total }),
    })
  }, [$t])

  // 使用 useRequest 处理数据请求，添加手动触发功能
  const {
    data = [],
    loading,
    run: getList,
  } = useRequest(
    () =>
      apiSecretList({
        name: keyName,
        key: keyValue,
        page_number: pagination.current,
        page_size: pagination.pageSize,
        status: accessKeyStatus ? Number(accessKeyStatus) : undefined,
        data_level: dataLevel,
      }).then((res) => {
        setPagination({
          ...pagination,
          total: res.data.total,
        })
        return res.data.items
      }),
    {
      refreshDeps: [
        keyName,
        keyValue,
        pagination.current,
        pagination.pageSize,
        accessKeyStatus,
        dataLevel,
      ],
      debounceWait: 300,
    },
  )

  // 处理编辑按钮点击
  const handleEdit = (record: AccessKeyItem) => {
    setCurrentEditAccessId(record.id)
    setIsModalOpen(true)
  }

  const handleView = (record: AccessKeyItem) => {
    setIsView(true)
    setCurrentEditAccessId(record.id)
    setIsModalOpen(true)
  }

  // 处理模态框关闭
  const handleModalClose = () => {
    setIsModalOpen(false)
    setIsView(false)
    setCurrentEditAccessId(undefined)
  }

  const columns: TableProps<AccessKeyItem>['columns'] = [
    {
      title: $t('密钥名称'),
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (text, record) => (
        <a
          className="text-blue-600"
          onClick={() => {
            handleView(record)
          }}
        >
          {text}
        </a>
      ),
    },
    {
      title: $t('密钥密级'),
      dataIndex: 'data_level',
      hidden: !securityLevelEnabled,
      key: 'data_level',
      width: 100,
    },
    {
      title: $t('模型数'),
      dataIndex: 'models',
      key: 'models',
      width: 100,
      render: (models) => !models ? 0 : models.split(',').length,
    },
    {
      title: $t('API数'),
      dataIndex: 'apis',
      key: 'apis',
      width: 100,
      render: (apis) => !apis ? 0 : apis.split(',').length,
    },
    {
      title: `${$t('已用额度')} (${amountSymbol})`,
      dataIndex: 'balance_consumed',
      key: 'balance_consumed',
      width: 120,
    },
    {
      title: `${$t('剩余额度')} (${amountSymbol})`,
      dataIndex: 'balance',
      key: 'balance',
      width: 120,
      render: (text, record) =>
        record.unlimited_quota ? $t('无限额度') : record.balance,
    },
    {
      title: $t('过期时间'),
      dataIndex: 'expired_time',
      key: 'expired_time',
      width: 160,
      render: (text) => dayjs(text * 1000).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: $t('状态'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={STATUS_MAP[status].tag}>{STATUS_MAP[status].label}</Tag>
      ),
    },
    {
      title: $t('创建人'),
      dataIndex: 'creator',
      key: 'creator',
      width: 100,
    },
    {
      title: $t('修改时间'),
      dataIndex: 'updated_time',
      key: 'updated_time',
      width: 200,
      render: (text) => dayjs(text * 1000).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: $t('最近活跃时间'),
      dataIndex: 'accessed_time',
      key: 'accessed_time',
      width: 200,
      render: (text) => dayjs(text * 1000).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: $t('操作'),
      key: 'action',
      width: 300,
      fixed: 'right',
      render: (_, record) => (
        <Space size="middle">
          <a className="text-blue-600" onClick={() => handleViewKey(record)}>
            {$t('查看密钥')}
          </a>
          {record.status === 1 && (
            <Popconfirm
              title="确定要禁用吗？"
              okText={$t('确定')}
              cancelText={$t('取消')}
              onConfirm={() => handleDisable(record)}
            >
              <a className="text-blue-600">{$t('禁用')}</a>
            </Popconfirm>
          )}
          {record.status !== 1 && (
            <Popconfirm
              title="确定要启用吗？"
              onConfirm={() => handleEnable(record)}
              okText={$t('确定')}
              cancelText={$t('取消')}
            >
              <a className="text-blue-600">{$t('启用')}</a>
            </Popconfirm>
          )}
          <a className="text-blue-600" onClick={() => handleEdit(record)}>
            {$t('编辑')}
          </a>
          <Popconfirm
            title={$t('确定要删除吗？')}
            okText={$t('确定')}
            cancelText={$t('取消')}
            onConfirm={() => handleDelete(record.id)}
          >
            <a className="text-blue-600">{$t('删除')}</a>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleDisable = (record: AccessKeyItem) => {
    return apiSecretDisable(record.id).then(() => {
      getList()
      message.success($t('禁用成功'))
    })
  }

  const handleEnable = (record: AccessKeyItem) => {
    return apiSecretEnable(record.id).then(() => {
      getList()
      message.success($t('启用成功'))
    })
  }

  const handleDelete = (id: number) => {
    return apiSecretDelete(id).then(() => {
      message.success($t('删除成功'))
      getList()
    })
  }

  // 处理查看密钥
  const handleViewKey = (record: AccessKeyItem) => {
    setCurrentViewAccessId(record.id) // 这里应该使用实际的密钥字段
    setIsViewModalOpen(true)
  }

  const handleAddSuccess = () => {
    getList()
  }

  return (
    <div className="bg-white min-h-full rounded-lg p-6">
      <div className="mb-6">
        <Title
          title={$t('访问密钥')}
          description={$t('密钥管理实现安全、合规的模型服务访问控制')}
        />
        <div className="flex gap-4">
          <Input
            placeholder={$t('请输入密钥名称')}
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="max-w-xs"
          />
          <Input
            placeholder={$t('请输入密钥')}
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="max-w-xs"
          />

          {securityLevelEnabled && (
            <Select
              value={dataLevel}
              onChange={setDataLevel}
              placeholder={$t('请选择密钥密级')}
              className="min-w-[200px]"
              options={[{ label: $t('全部'), value: '' }, ...securityLevel]}
              allowClear
            />
          )}
          <Select
            placeholder={$t('状态')}
            className="w-40"
            value={accessKeyStatus}
            onChange={setAccessKeyStatus}
            allowClear
          >
            <Select.Option value="">{$t('全部')}</Select.Option>
            {Object.entries(STATUS_MAP).map(([value, { label }]) => (
              <Select.Option key={value} value={value}>
                {label}
              </Select.Option>
            ))}
          </Select>
          <div className="flex-1" />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            className="bg-[#40A9FF]"
            onClick={() => setIsModalOpen(true)}
          >
            {$t('创建密钥')}
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="keyName"
        scroll={{ x: 1000 }}
        loading={loading}
        pagination={pagination}
        onChange={(pagination) => setPagination(pagination)}
      />

      <CreateAccessKeyModal
        open={isModalOpen}
        onCancel={handleModalClose}
        onSuccess={handleAddSuccess}
        accessId={currentEditAccessId}
        isView={isView}
        securityLevels={securityLevel}
      />

      <ViewAccessKeyModal
        open={isViewModalOpen}
        onCancel={() => setIsViewModalOpen(false)}
        accessId={currentViewAccessId ?? 0}
      />
    </div>
  )
}
