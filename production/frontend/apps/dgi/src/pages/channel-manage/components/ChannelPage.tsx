import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import type { TablePaginationConfig, TableProps } from 'antd'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import AddChannelModal from '../components/AddChannelModal'
import {
  apiChannelDelete,
  apiChannelDisable,
  apiChannelEnable,
  apiChannelList,
} from '@/services/api'
import { useTransform } from '@/locales'
import Title from '@/components/Title'
import { useSystemConfig } from '@/hooks/use-system-config'
// import { PermissionHelper } from "@/utils/permission-helper";
// import { DataSecurityLevelOption, UserPermissionLevel } from "@/types/permission";

interface ModelItem {
  id: number
  type: number
  key: string
  name: string
  base_url: string
  other: string
  models: string
  model_mapping: string
  system_prompt: string
  creator: string
  updated_time: number
  status: number
}

enum STATUS {
  ENABLE = 1,
  DISABLE = 2,
}

export default function ChannelManagePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname
  const [searchText, setSearchText] = useState('')
  const [modelUrl, setModelUrl] = useState('')
  const [channelId, setChannelId] = useState('')
  const [searchType, setSearchType] = useState<number>()
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number>()
  const [readOnly, setReadOnly] = useState(false)
  const [defaultAddressType, setDefaultAddressType] = useState<'custom' | 'deployed' | undefined>(undefined)
  const { channelTypeOptions, securityLevel, securityLevelEnabled } = useSystemConfig(true)
  const [channelStatus, setChannelStatus] = useState<string | undefined>(
    undefined,
  )
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [dataLevel, setDataLevel] = useState<string | undefined>(undefined)
  const { $t } = useTransform()
  const hasCheckedAddParam = useRef(false)
  const hasClearedParams = useRef(false)
  const [urlParams, setUrlParams] = useState<{
    projectName?: string
    serverName?: string
    modelName?: string
    accessUrl?: string
  } | undefined>(undefined)

  // 获取可用的数据安全级别选项
  // const [securityLevels, setSecurityLevels] = useState<DataSecurityLevelOption[]>([]);

  // 从 URL 参数中读取渠道名称并设置搜索文本
  useEffect(() => {
    const channelName = searchParams.get('channel')
    if (channelName) {
      setSearchText(decodeURIComponent(channelName))
    }
  }, [searchParams])

  // 清除 URL 中的可选参数
  const clearOptionalParams = () => {
    if (hasClearedParams.current || typeof window === 'undefined') {
      return
    }

    const urlParamsObj = new URLSearchParams(window.location.search)
    const optionalParams = ['add', 'projectName', 'serverName', 'modelName', 'accessUrl']
    let hasOptionalParams = false

    optionalParams.forEach((param) => {
      if (urlParamsObj.has(param)) {
        urlParamsObj.delete(param)
        hasOptionalParams = true
      }
    })

    // 如果有可选参数被清除，更新 URL
    if (hasOptionalParams) {
      hasClearedParams.current = true
      const newSearch = urlParamsObj.toString()
      const newUrl = newSearch ? `${pathname}?${newSearch}` : pathname
      navigate(newUrl, { replace: true })
    }
  }

  // 监听 URL 参数，如果有相关参数（projectName, serverName等）则打开新增渠道弹窗并选择"已部署模型"
  useEffect(() => {
    // 只在首次检查时执行，避免重复打开
    if (hasCheckedAddParam.current) {
      return
    }

    // 使用 setTimeout 确保在组件完全挂载后再检查
    const checkAddParam = () => {
      // 检查 URL 参数，优先使用 window.location.search（更可靠，特别是在从外部网站跳转时）
      if (typeof window === 'undefined') {
        return
      }

      const urlParamsObj = new URLSearchParams(window.location.search)
      const addParam = urlParamsObj.get('add') || searchParams.get('add')
      const projectName = urlParamsObj.get('projectName')
      const serverName = urlParamsObj.get('serverName')
      const modelName = urlParamsObj.get('modelName')
      const accessUrl = urlParamsObj.get('accessUrl')
      const hasProjectParams = projectName || serverName || modelName || accessUrl

      if (addParam || hasProjectParams) {
        hasCheckedAddParam.current = true
        setModalOpen(true)
        setEditId(undefined)
        setReadOnly(false)
        setDefaultAddressType('deployed')

        // 设置 URL 参数用于回显
        if (hasProjectParams) {
          setUrlParams({
            projectName: projectName || undefined,
            serverName: serverName || undefined,
            modelName: modelName || undefined,
            accessUrl: accessUrl ? decodeURIComponent(accessUrl) : undefined,
          })
        }

        // 处理完参数后，延迟清除 URL 中的可选参数
        setTimeout(() => {
          clearOptionalParams()
        }, 100)
      }
      else {
        hasCheckedAddParam.current = true
        setUrlParams(undefined)
        // 即使没有参数，也清除可能存在的可选参数
        clearOptionalParams()
      }
    }

    // 立即检查一次
    checkAddParam()

    // 延迟检查一次，确保在路由完全加载后也能检测到
    const timeoutId = setTimeout(checkAddParam, 200)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [searchParams, pathname, navigate])

  // 使用 useRequest 处理数据请求
  const {
    data = [],
    loading,
    run: getList,
  } = useRequest(
    () =>
      apiChannelList({
        name: searchText || undefined,
        type: searchType || undefined,
        page_number: pagination.current,
        page_size: pagination.pageSize,
        channel_id: channelId === '' ? undefined : Number(channelId),
        base_url: modelUrl,
        status: channelStatus ? Number(channelStatus) : undefined,
        data_level: dataLevel || undefined,
      }).then((res) => {
        setPagination({
          ...pagination,
          total: res.data.total,
          showTotal: (total) => $t('总共 {total} 条', { total }),
        })
        return res.data.items
      }),
    {
      refreshDeps: [
        searchText,
        searchType,
        channelId,
        modelUrl,
        pagination.current,
        pagination.pageSize,
        channelStatus,
        dataLevel,
      ], // 依赖项变化时重新请求
      debounceWait: 300, // 300ms 防抖
    },
  )

  useEffect(() => {
    setPagination({
      ...pagination,
      showTotal: (total) => $t('总共 {total} 条', { total }),
    })
  }, [$t])

  // 当筛选条件变化时，重置到第一页
  useEffect(() => {
    setPagination((prev) => ({
      ...prev,
      current: 1,
    }))
  }, [searchText, channelId, modelUrl, searchType, channelStatus, dataLevel])

  const columns: TableProps<ModelItem>['columns'] = [
    {
      title: $t('渠道ID'),
      dataIndex: 'id',
      key: 'id',
      width: 100,
    },
    {
      title: $t('渠道名称'),
      dataIndex: 'name',
      key: 'name',
      width: 200,
      // render: (text, record) => (
      //   <a
      //     className="text-blue-600 cursor-pointer"
      //     onClick={() => {
      //       setModalOpen(true);
      //       setReadOnly(true);
      //       setEditId(record.id);
      //     }}
      //   >
      //     {text}
      //   </a>
      // ),
    },
    {
      title: $t('密级'),
      dataIndex: 'data_level',
      key: 'data_level',
      hidden: !securityLevelEnabled,
      width: 100,
    },
    // {
    //   title: $t("分组"),
    //   dataIndex: "group",
    //   key: "group",
    //   width: 160,
    //   render: (group) =>
    //     group.split(",").map((m: string) => <Tag key={m}>{m}</Tag>),
    // },
    {
      title: $t('模型地址'),
      dataIndex: 'base_url',
      key: 'base_url',
      width: 100,
      ellipsis: true,
      render: (t) => <Tooltip title={t}>{t}</Tooltip>,
    },
    {
      title: $t('提供商'),
      dataIndex: 'type',
      key: 'type',
      width: 160,
      render: (type) =>
        channelTypeOptions?.find((item) => item.value === type)?.label ?? '--',
    },
    {
      title: $t('状态'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={status === STATUS.ENABLE ? 'success' : 'error'}>
          {status === STATUS.ENABLE ? $t('已启用') : $t('已禁用')}
        </Tag>
      ),
    },
    {
      title: $t('创建人'),
      dataIndex: 'creator',
      key: 'creator',
      width: 120,
    },
    {
      title: $t('修改时间'),
      dataIndex: 'updated_time',
      key: 'updated_time',
      width: 200,
      render: (text) => dayjs(text * 1000).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: $t('操作'),
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="middle">
          <a
            className="text-blue-600"
            onClick={() => {
              setModalOpen(true)
              setEditId(record.id)
              setReadOnly(false)
            }}
          >
            {$t('编辑')}
          </a>
          <a
            className="text-blue-600"
            onClick={() => handleEnable(record.id, record.status)}
          >
            {record.status === STATUS.ENABLE ? $t('禁用') : $t('启用')}
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

  const handleDelete = (id: number) => {
    return apiChannelDelete(id).then(() => {
      message.success($t('删除成功'))
      getList()
    })
  }

  const handleAddChannelSuccess = () => {
    setSearchText('')
    setChannelId('')
    setSearchType(undefined)
    getList()
  }

  const handleEnable = (id: number, status: number) => {
    if (status === 2) {
      return apiChannelEnable(id).then(() => {
        message.success($t('操作成功'))
        getList()
      })
    }
    else {
      return apiChannelDisable(id).then(() => {
        message.success($t('操作成功'))
        getList()
      })
    }
  }

  return (
    <div className="bg-white min-h-full rounded-lg">
      <div className="mb-6">
        {/* <Title title={$t("渠道管理")} description={$t("模型统一标准接入")} /> */}
        <div className="flex gap-4">
          <Input
            placeholder={$t('请输入渠道ID')}
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="!w-[180px]"
          />
          <Input
            placeholder={$t('请输入渠道名称')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="!w-[180px]"
          />
          {securityLevelEnabled && (
            <Select
              placeholder={$t('请选择渠道密级')}
              value={dataLevel}
              onChange={setDataLevel}
              options={[{ label: $t('全部'), value: '' }, ...securityLevel]}
              className="w-[200px]"
              showSearch
              allowClear
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false}
            />
          )}
          <Input
            placeholder={$t('请输入模型地址')}
            value={modelUrl}
            onChange={(e) => setModelUrl(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="max-w-xs"
          />
          <Select
            placeholder={$t('提供商')}
            className="!w-[240px]"
            allowClear
            options={[{ value: '', label: $t('全部') }, ...channelTypeOptions]}
            value={searchType}
            onChange={setSearchType}
          >
          </Select>
          <Select
            placeholder={$t('状态')}
            className="w-40"
            value={channelStatus}
            onChange={setChannelStatus}
          >
            <Select.Option value="">{$t('全部')}</Select.Option>
            <Select.Option value={STATUS.ENABLE}>{$t('已启用')}</Select.Option>
            <Select.Option value={STATUS.DISABLE}>{$t('已禁用')}</Select.Option>
          </Select>
          <div className="flex-1" />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            className="bg-[#40A9FF]"
            onClick={() => {
              setModalOpen(true)
              setReadOnly(false)
            }}
          >
            {$t('新增渠道')}
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={pagination}
        scroll={{ y: 'calc(100vh - 340px)', x: 1200 }}
        onChange={(pagination) => {
          setPagination(pagination)
        }}
      />

      <AddChannelModal
        editId={editId}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditId(undefined)
          setDefaultAddressType(undefined)
          setUrlParams(undefined)
        }}
        onSuccess={handleAddChannelSuccess}
        readOnly={readOnly}
        defaultAddressType={defaultAddressType}
        urlParams={urlParams}
      />
    </div>
  )
}
