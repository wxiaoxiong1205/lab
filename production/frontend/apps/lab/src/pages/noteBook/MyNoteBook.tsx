import React, { useEffect, useMemo, useState } from 'react'
import type { TableColumnsType } from 'antd'
import { Button, Checkbox, Form, Input, Modal, Select, Table, Tag, Tooltip, Typography, message } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, FilterOutlined, SearchOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import debounce from 'lodash-es/debounce'
import { useNotebookBasePath } from '@/hooks/getProjectPath'
import TableToolbar from '@/components/common/TableToolbar'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import { notebookService } from '@/services/notebookService'
import { projectMemberApi } from '@/services/api'
import { useProjectStore } from '@/stores/projectStore'
import { copyToClipboard } from '@/utils/clipboard'
import type { NotebookInstance, NotebookSearchParams } from '@/types'
import { formatMaxRuntimeMinutes } from '@/utils/timeProcessing'
import { getTablePagination } from '@/utils/tablePagination'
import SaveEnvironmentModal from '@/components/notebook/SaveEnvironmentModal'
import SaveEnvironmentConfirmModal from '@/components/notebook/SaveEnvironmentConfirmModal'
import { getImageDisplayParts, parseImage } from '@/utils/parseImage'
import { registryMirrorService } from '@/services/RegistryMirrorService'
import './MyNoteBook.css'

const { Text } = Typography

interface NotebookTableFilterOption {
  label: string
  value: string
  count?: number
}

type NotebookTableFilterKey = 'status' | 'is_public'

const ACCESS_FILTER_OPTIONS: NotebookTableFilterOption[] = [
  { label: '公开', value: 'true' },
  { label: '私有', value: 'false' },
]

interface NotebookProjectMember {
  id?: number
  userId?: number
  userName?: string
  username?: string
}
/**
 * 我的Notebook组件
 * 用于显示和管理用户自己的Notebook实例
 */
const MyNoteBook: React.FC = () => {
  const navigate = useNavigate()
  const { projectId } = useParams<{
    projectId: string
  }>()
  const { currentProject } = useProjectStore()
  const queryClient = useQueryClient()
  const { notebookBasePath } = useNotebookBasePath()
  const isMachineLearningNotebook = useMemo(() => Boolean(notebookBasePath?.includes('/machine-notebook')), [notebookBasePath])
  const [notebooks, setNotebooks] = useState<NotebookInstance[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [startLoading, setStartLoading] = useState<string | number | null>(null)
  const [stopLoading, setStopLoading] = useState<string | number | null>(null)
  const [searchParams, setSearchParams] = useState<NotebookSearchParams>({
    page: 1,
    size: 10,
    view_mode: 'manage',
  })
  const [total, setTotal] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [searchForm] = Form.useForm()
  const [projectMembers, setProjectMembers] = useState<NotebookProjectMember[]>([])
  const [notebookStatusList, setNotebookStatusList] = useState<Array<{
    name?: string
    value: string
    label?: string
    description?: string
  }>>([])
  useEffect(() => {
    const value = localStorage.getItem('projectEnumValues')
    if (value) {
      const options = JSON.parse(value).all_enums?.find((item: {
        enum_name: string
      }) => item.enum_name === 'TrainingTaskStatus')?.options
      if (options) {
        setNotebookStatusList(options)
      }
    }
  }, [])
  const statusFilterOptions = useMemo<NotebookTableFilterOption[]>(() => {
    const enumOptions = notebookStatusList.map((item) => ({
      label: item.label || item.value,
      value: item.value,
    }))
    const options = enumOptions.length > 0
      ? enumOptions
      : Array.from(new Set(notebooks.map((item) => item.status).filter(Boolean))).map((status) => ({
          label: status,
          value: status,
        }))

    return options.map((option) => ({
      ...option,
      count: notebooks.filter((notebook) => notebook.status === option.value).length,
    }))
  }, [notebookStatusList, notebooks])

  const accessFilterOptions = useMemo<NotebookTableFilterOption[]>(() => {
    return ACCESS_FILTER_OPTIONS.map((option) => ({
      ...option,
      count: notebooks.filter((notebook) => String(Boolean(notebook.is_public)) === option.value).length,
    }))
  }, [notebooks])

  const createdByFilterOptions = useMemo<NotebookTableFilterOption[]>(() => {
    return projectMembers
      .map((member) => {
        const userId = member.userId ?? member.id
        const userName = member.userName || member.username
        if (userId == null || !userName)
          return null

        return {
          label: userName,
          value: String(userId),
          count: notebooks.filter((notebook) => notebook.created_by === userName).length,
        }
      })
      .filter((item) => item != null)
  }, [notebooks, projectMembers])

  const debouncedNotebookNameSearch = useMemo(
    () => debounce((value: string) => {
      const instanceName = value.trim()
      setSearchParams((prev) => ({
        ...prev,
        instance_name: instanceName || undefined,
        page: 1,
      }))
      setCurrentPage(1)
    }, 300),
    [],
  )
  useEffect(() => {
    return () => {
      debouncedNotebookNameSearch.cancel()
    }
  }, [debouncedNotebookNameSearch])
  // 保存环境模态框相关状态
  const [saveEnvironmentNotebookId, setSaveEnvironmentNotebookId] = useState<number>(0)
  const [saveEnvironmentImageName, setSaveEnvironmentImageName] = useState<string>('')
  const [saveEnvironmentModalVisible, setSaveEnvironmentModalVisible] = useState<boolean>(false)
  // 终止运行后保存环境模态框相关状态
  const [saveEnvironmentConfirmModalVisible, setSaveEnvironmentConfirmModalVisible] = useState<boolean>(false)
  const [saveEnvironmentConfirmNotebookId, setSaveEnvironmentConfirmNotebookId] = useState<number>(0)
  // 保存环境模态框控制
  const controlSaveEnvironmentModal = async (notebookId: number = 0, imageName: string = '') => {
    setLoading(true)
    const res = await registryMirrorService.isBuildingImage(notebookId)
    setLoading(false)
    if (res) {
      message.error('当前notebook正在保存镜像，请稍后再试')
      return
    }
    if (notebookId > 0) {
      setSaveEnvironmentNotebookId(notebookId)
      setSaveEnvironmentImageName(`${parseImage(imageName).image}:${parseImage(imageName).tag}`)
    }
    setSaveEnvironmentModalVisible(!saveEnvironmentModalVisible)
  }
  // 终止运行后保存环境模态框控制
  const controlSaveEnvironmentConfirmModal = (notebookId: number = 0) => {
    setSaveEnvironmentConfirmModalVisible(!saveEnvironmentConfirmModalVisible)
  }
  // 获取项目路径
  const getProjectPath = () => {
    if (projectId) {
      return `/project/${projectId}`
    }
    if (currentProject?.id) {
      return `/project/${currentProject.id}`
    }
    message.error('未找到项目信息，请先选择一个项目')
    navigate('/projects')
    return ''
  }
  // 获取Notebook列表
  const fetchNotebooks = async () => {
    const currentProjectId = Number(projectId) || currentProject?.id
    if (!currentProjectId) {
      setNotebooks([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const listParams: NotebookSearchParams = {
        ...searchParams,
        view_mode: 'manage',
        ...(isMachineLearningNotebook ? { biz_type: 'machine_learning' } : { biz_type: 'llm' }),
      }
      const response = await notebookService.getNotebookInstances(listParams, currentProjectId)
      const items = response.data?.items || []
      const total = response.data?.total || 0
      const currentPageResp = response.data?.page || searchParams.page || 1
      const pageSizeResp = response.data?.size || searchParams.size || 10
      if (currentPageResp > 1 && items.length === 0) {
        // 回到第一页，重新查询
        setCurrentPage(1)
        setSearchParams((prev) => ({
          ...prev,
          page: 1,
        }))
        return
      }
      setNotebooks(items)
      setTotal(total)
      setCurrentPage(currentPageResp)
      setPageSize(pageSizeResp)
    }
    catch (error) {
      // message.error('获取Notebook列表失败');
      console.error('Failed to fetch notebooks:', error)
    }
    finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    setNotebooks([])
    setTotal(0)
    fetchNotebooks()
  }, [projectId, currentProject?.id, searchParams, isMachineLearningNotebook])

  useEffect(() => {
    const currentProjectId = Number(projectId) || currentProject?.id
    if (!currentProjectId) {
      setProjectMembers([])
      return
    }

    projectMemberApi.list(currentProjectId, { page: 1, size: 100 })
      .then((response) => {
        const members = (response.items || response.rows || []) as NotebookProjectMember[]
        setProjectMembers(members)
      })
      .catch((error) => {
        console.error('Failed to fetch project members:', error)
        setProjectMembers([])
      })
  }, [projectId, currentProject?.id])

  // 搜索处理（表单提交）
  const handleSearch = (values: {
    instance_name?: string
    created_id?: string
  }) => {
    const instanceName = values.instance_name?.trim()
    setSearchParams((prev) => ({
      ...prev,
      instance_name: instanceName || undefined,
      created_id: values.created_id ? [values.created_id] : undefined,
      page: 1,
    }))
    setCurrentPage(1)
  }
  // 重置搜索
  const handleResetSearch = () => {
    debouncedNotebookNameSearch.cancel()
    searchForm.resetFields()
    setSearchParams((prev) => ({ ...prev, instance_name: undefined, status: undefined, is_public: undefined, created_id: undefined, page: 1 }))
    setCurrentPage(1)
  }
  const handleNotebookNameSearchChange = (value: string) => {
    debouncedNotebookNameSearch(value)
  }
  const handleCreatedByChange = (value?: string) => {
    setSearchParams((prev) => ({
      ...prev,
      created_id: value ? [value] : undefined,
      page: 1,
    }))
    setCurrentPage(1)
  }
  // 分页处理
  const handlePageChange = (page: number, size: number) => {
    setCurrentPage(page)
    setPageSize(size)
    setSearchParams((prev) => ({
      ...prev,
      page,
      size,
    }))
  }
  // 创建新Notebook
  const handleCreateNotebook = () => {
    if (!notebookBasePath)
      return
    navigate(`${notebookBasePath}/create`)
  }
  // 编辑Notebook
  const handleEditNotebook = (id: string | number) => {
    if (!notebookBasePath)
      return
    navigate(`${notebookBasePath}/edit/${id}`)
  }
  // 刷新列表
  const handleRefresh = () => {
    fetchNotebooks()
    message.success('刷新成功')
  }
  // 查看详情
  const handleViewNotebook = (id: string | number, name: string) => {
    if (!notebookBasePath)
      return
    navigate(`${notebookBasePath}/${id}`)
  }
  // 启动Notebook
  const handleStartNotebook = async (id: string | number) => {
    setStartLoading(id)
    try {
      const currentProjectId = Number(projectId) || currentProject?.id
      if (!currentProjectId) {
        // message.error('未找到项目信息，无法启动');
        return
      }
      await notebookService.startNotebookInstance(id, currentProjectId)
      // if(res.status === '停止' ||  res.status === '失败'){
      //   message.error(res.status);
      //   return;
      // }
      message.success('Notebook启动成功')
      setTimeout(() => {
        fetchNotebooks()
      }, 1000)
    }
    catch (error) {
      // message.error('启动Notebook失败');
      console.error('Failed to start notebook:', error)
    }
    finally {
      setStartLoading(null)
    }
  }
  // 停止Notebook
  const handleStopNotebook = async (id: number) => {
    setStopLoading(id)
    try {
      const currentProjectId = Number(projectId) || currentProject?.id
      if (!currentProjectId) {
        // message.error('未找到项目信息，无法停止');
        return
      }
      await notebookService.stopNotebookInstance(id, currentProjectId)
      message.success('Notebook停止成功')
      fetchNotebooks()
    }
    catch (error) {
      // message.error('停止Notebook失败');
      console.error('Failed to stop notebook:', error)
    }
    finally {
      setStopLoading(null)
    }
  }
  // 删除Notebook
  const handleDeleteNotebook = async (notebook: NotebookInstance) => {
    Modal.confirm({
      title: '确认删除',
      content: (
        <div>
          <p>
            确定要删除Notebook实例
            <strong>{notebook.instance_name}</strong>
            {' '}
            吗？
          </p>
          <p className="text-[var(--lab-color-danger)] text-[12px]">
            ⚠️ 此操作不可逆，删除后所有数据将丢失！
          </p>
        </div>
      ),
      okText: '确认删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          const currentProjectId = Number(projectId) || currentProject?.id
          if (!currentProjectId) {
            // message.error('未找到项目信息，无法删除');
            return
          }
          const res = await registryMirrorService.isBuildingImage(notebook.id)
          if (res) {
            message.error('当前notebook正在保存镜像，请稍后再试')
            return
          }
          await notebookService.deleteNotebookInstance(notebook.id, currentProjectId)
          message.success('Notebook删除成功')
          fetchNotebooks()
        }
        catch (error) {
          // message.error('删除Notebook失败');
          console.error('Failed to delete notebook:', error)
        }
      },
    })
  }
  // 打开Notebook
  const handleOpenNotebook = (accessUrl: string) => {
    window.open(accessUrl, '_blank')
  }
  // 复制镜像
  const handleCopyImage = (image: string) => {
    copyToClipboard(image, '镜像')
  }
  // 渲染状态标签
  const renderStatusTag = (status: string) => {
    if (isMachineLearningNotebook && ['创建中'].includes(status)) {
      return (
        <Tag
          color="default"
          icon={(
            <Tooltip title="数据处理中">
              <ExclamationCircleOutlined />
            </Tooltip>
          )}
        >
          {status}
        </Tag>
      )
    }

    // 直接使用字符串状态
    switch (status) {
      case '创建':
        return (
          <Tag color="default" icon={<ClockCircleOutlined />}>
            创建
          </Tag>
        )
      case '准备中':
        return (
          <Tag color="processing" icon={<SyncOutlined spin />}>
            准备中
          </Tag>
        )
      case '运行中':
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            运行中
          </Tag>
        )
      case '停止':
        return (
          <Tag color="default" icon={<StopOutlined />}>
            停止
          </Tag>
        )
      case '失败':
        return (
          <Tag color="error" icon={<ExclamationCircleOutlined />}>
            失败
          </Tag>
        )
      default:
        return (
          <Tag color="default" icon={<ClockCircleOutlined />}>
            {status}
          </Tag>
        )
    }
  }
  const renderPublicTag = (isPublic: boolean) => {
    if (isPublic) {
      return '公开'
    }
    else {
      return '私有'
    }
  }
  // 渲染资源配置
  const renderResourceConfig = (notebook: NotebookInstance | any) => {
    const items = []
    let cpuInfo = ''
    let memoryInfo = ''
    let gpuInfo = ''
    // 格式化数字，去掉多余的小数点
    const formatNumber = (value: string | number) => {
      const num = typeof value === 'string' ? parseFloat(value) : value
      if (isNaN(num))
        return '0'
      return num % 1 === 0 ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '')
    }
    // CPU配置
    if (notebook.resource_cpu_request && notebook.resource_cpu_limit) {
      const cpuReq = formatNumber(notebook.resource_cpu_request)
      const cpuLimit = formatNumber(notebook.resource_cpu_limit)
      cpuInfo = `${cpuReq}~${cpuLimit} Cores`
      items.push(`CPU: ${cpuInfo}`)
    }
    else if (notebook.resources?.cpu) {
      cpuInfo = `${notebook.resources.cpu.request}~${notebook.resources.cpu.limit}`
      items.push(`CPU: ${cpuInfo}`)
    }
    // 内存配置
    if (notebook.resource_memory_request && notebook.resource_memory_limit) {
      const memReq = formatNumber(notebook.resource_memory_request)
      const memLimit = formatNumber(notebook.resource_memory_limit)
      memoryInfo = `${memReq}~${memLimit} GB`
      items.push(`内存: ${memoryInfo}`)
    }
    else if (notebook.resources?.memory) {
      memoryInfo = `${notebook.resources.memory.request}~${notebook.resources.memory.limit}`
      items.push(`内存: ${memoryInfo}`)
    }
    // GPU配置
    const hasGpu = notebook.gpu_type && notebook.gpu_count
    const hasNestedGpu = notebook.resources?.gpu && notebook.resources.gpu.enabled
    if (hasGpu) {
      gpuInfo = `${notebook.gpu_count}x ${notebook.gpu_type}`
      items.push(`GPU: ${gpuInfo}`)
    }
    else if (hasNestedGpu) {
      gpuInfo = `${notebook.resources.gpu.count}x ${notebook.resources.gpu.type}`
      items.push(`GPU: ${gpuInfo}`)
    }
    // 主要显示内容
    const primaryDisplay = hasGpu || hasNestedGpu ? (
      <div>
        <div className="text-[12px] font-bold text-[var(--lab-color-brand-primary)]">
          {notebook.gpu_count || notebook.resources?.gpu?.count}
          x
          {' '}
          {notebook?.ext?.category === 'NPU' ? 'NPU' : 'GPU'}
        </div>
        <div className="text-[10px] text-[var(--lab-color-text-muted)]">
          {cpuInfo && `CPU: ${cpuInfo.split(' ')[0]}`}
        </div>
      </div>
    ) : (
      <div>
        <div className="text-[12px] font-bold">
          CPU Only
        </div>
        <div className="text-[10px] text-[var(--lab-color-text-muted)]">
          {cpuInfo && `${cpuInfo.split(' ')[0]} Cores`}
        </div>
      </div>
    )
    return (
      <Tooltip
        color="blue"
        title={(
          <div>
            {items.map((item, index) => (<div key={index}>{item}</div>))}
            {(notebook.resource_memory_request || notebook.resource_memory_limit) && (
              <div className="mt-[8px] pt-[8px]" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                <div className="text-[12px] text-[var(--lab-color-surface-elevated)]">
                  <div>
                    内存请求:
                    {notebook.resource_memory_request ? `${formatNumber(notebook.resource_memory_request)} GB` : '未设置'}
                  </div>
                  <div>
                    内存限制:
                    {notebook.resource_memory_limit ? `${formatNumber(notebook.resource_memory_limit)} GB` : '未设置'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      >
        {primaryDisplay}
      </Tooltip>
    )
  }
  // 辅助函数：判断状态
  const isStatusRunning = (status: string) => {
    // 运行中状态 - 显示停止按钮
    return ['运行中', '排队中'].includes(status)
  }
  const isStatusStopped = (status: string) => {
    // 创建、停止或失败状态 - 显示启动按钮
    return ['已创建', '失败', '已终止'].includes(status)
  }

  const isStatusEdit = (status: string) => {
    return !['已创建', '已终止', '失败'].includes(status)
  }
  const stopNotebook = async (notebookId: number, imageName: string) => {
    setLoading(true)
    const res = await registryMirrorService.isBuildingImage(notebookId)
    setLoading(false)
    if (res) {
      message.error('当前notebook正在保存镜像，请稍后再试')
      return
    }
    setSaveEnvironmentConfirmModalVisible(true)
    setSaveEnvironmentConfirmNotebookId(notebookId)
    setSaveEnvironmentImageName(`${parseImage(imageName).image}:${parseImage(imageName).tag}`)
  }
  const handlePublishCase = (notebook: NotebookInstance) => {
    navigate(`${notebookBasePath}/publish-case/${notebook.id}`)
  }
  const handleApplyTableFilter = (key: NotebookTableFilterKey, values: string[]) => {
    setSearchParams((prev) => ({
      ...prev,
      [key]: values.length > 0 ? values : undefined,
      page: 1,
    }))
    setCurrentPage(1)
  }

  const renderTableFilterDropdown = (
    key: NotebookTableFilterKey,
    title: string,
    options: NotebookTableFilterOption[],
    emptyText = '暂无可筛选项',
  ) => {
    return ({ selectedKeys, setSelectedKeys, confirm, clearFilters }: any) => (
      <div className="my-notebook-table-filter">
        <div className="my-notebook-table-filter-title">
          筛选
          {title}
        </div>
        <div className="my-notebook-table-filter-options">
          {options.length > 0
            ? (
                <Checkbox.Group
                  value={selectedKeys as string[]}
                  onChange={(checkedValues) => setSelectedKeys(checkedValues as string[])}
                  className="my-notebook-table-filter-group"
                >
                  {options.map((option) => (
                    <label key={option.value} className="my-notebook-table-filter-option">
                      <Checkbox value={option.value} />
                      <span className="my-notebook-table-filter-label">{option.label}</span>
                    </label>
                  ))}
                </Checkbox.Group>
              )
            : (
                <div className="my-notebook-table-filter-empty">{emptyText}</div>
              )}
        </div>
        <div className="my-notebook-table-filter-footer">
          <Button
            size="small"
            onClick={() => {
              clearFilters?.()
              handleApplyTableFilter(key, [])
              confirm({ closeDropdown: true })
            }}
          >
            清空
          </Button>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              handleApplyTableFilter(key, selectedKeys as string[])
              confirm({ closeDropdown: true })
            }}
          >
            应用
          </Button>
        </div>
      </div>
    )
  }

  const renderFilterIcon = (filtered: boolean) => (
    <FilterOutlined className={filtered ? 'my-notebook-table-filter-icon-active' : 'my-notebook-table-filter-icon'} />
  )

  // 表格列定义
  const columns = [
    {
      title: 'Notebook名称',
      dataIndex: 'instance_name',
      key: 'instance_name',
      width: 140,
      fixed: 'left' as const,
      render: (text: string, record: NotebookInstance) => (
        <div>
          <Text strong>{text}</Text>
          {record.describe && (
            <Tooltip
              title={(
                <div className="line-clamp-4 max-w-[320px] break-words">
                  {record.describe}
                </div>
              )}
              placement="topLeft"
            >
              <div className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-[var(--lab-color-text-muted)]">
                {record.describe}
              </div>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: '镜像',
      dataIndex: 'image',
      key: 'image',
      width: 380,
      render: (text: string) => {
        const [namespace, image, tag] = getImageDisplayParts(text)
        if (!(namespace && image && tag)) {
          return <span className="font-medium break-all">{text}</span>
        }
        return (
          <div className="flex flex-col gap-1 leading-5 py-4">
            <div className="flex items-start">
              <span className="w-[72px] shrink-0 text-gray-500">命名空间：</span>
              <span className="min-w-0 flex-1 break-all font-bold">{namespace}</span>
            </div>
            <div className="flex items-start">
              <span className="w-[72px] shrink-0 text-gray-500">名称：</span>
              <span className="min-w-0 flex-1 break-all font-bold">{image}</span>
            </div>
            <div className="flex items-start">
              <span className="w-[72px] shrink-0 text-gray-500">镜像版本：</span>
              <span className="min-w-0 flex-1 break-all font-bold">{tag}</span>
            </div>
          </div>
        )
      },
    },
    {
      title: 'SSH配置',
      dataIndex: 'is_ssh',
      key: 'is_ssh',
      align: 'center',
      width: 100,
      render: (is_ssh: boolean) => (<Tag color="blue">{is_ssh ? '已支持' : '未支持'}</Tag>),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      width: 120,
      filteredValue: searchParams.status || null,
      filterDropdown: renderTableFilterDropdown('status', '状态', statusFilterOptions.filter(
        (item) => !['定时待启动', '已完成'].includes(item.value)),
      ),
      filterIcon: renderFilterIcon,
      render: (status: string) => renderStatusTag(status),
    },
    {
      title: '访问权限',
      dataIndex: 'is_public',
      key: 'is_public',
      align: 'center',
      width: 120,
      filteredValue: searchParams.is_public || null,
      filterDropdown: renderTableFilterDropdown('is_public', '访问权限', accessFilterOptions),
      filterIcon: renderFilterIcon,
      render: (is_public: boolean) => renderPublicTag(is_public),
    },
    {
      title: '资源规格',
      dataIndex: 'resources',
      key: 'resources',
      align: 'center',
      width: 120,
      render: (_, record: NotebookInstance) => renderResourceConfig(record),
    },
    {
      title: '最大运行时长',
      dataIndex: 'running_hours',
      key: 'running_hours',
      align: 'center',
      width: 140,
      render: (_, record: NotebookInstance) => {
        return <Text>{formatMaxRuntimeMinutes(record.max_runtime_minutes)}</Text>
      },
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      align: 'center',
      width: 120,
      render: (_, record: NotebookInstance) => {
        return <Text>{record.created_by}</Text>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'center',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      align: 'center',
      fixed: 'right' as const,
      render: (_, record: NotebookInstance) => {
        const { status } = record
        const canOperate = record.can_operate === true
        const actions: TableActionItem[] = [
          {
            key: 'start',
            label: '启动',
            disabled: !canOperate || !isStatusStopped(status),
            loading: startLoading === record.id,
            onClick: () => handleStartNotebook(record.id),
          },
          { key: 'edit', disabled: !canOperate || isStatusEdit(status), label: '编辑', onClick: () => handleEditNotebook(record.id) },
          {
            key: 'open',
            label: '打开',
            disabled: !canOperate || !(isStatusRunning(status) && !!record.access_url && record.status !== '排队中'),
            onClick: () => handleOpenNotebook(record.access_url!),
          },
          {
            key: 'saveEnv',
            label: '保存环境',
            disabled: !canOperate || !isStatusRunning(status),
            onClick: () => controlSaveEnvironmentModal(record.id, record.image),
          },
          {
            key: 'stop',
            label: '停止',
            disabled: !canOperate || !isStatusRunning(status),
            loading: stopLoading === record.id,
            onClick: () => stopNotebook(record.id, record.image),
          },
          { key: 'view', label: '详情', disabled: !canOperate, onClick: () => handleViewNotebook(record.id, record.instance_name) },
          { key: 'publish', label: '发布为案例', disabled: !canOperate, onClick: () => handlePublishCase(record) },
          { key: 'delete', label: '删除', disabled: !canOperate, danger: true, onClick: () => handleDeleteNotebook(record) },
        ]
        return <TableActionColumn actions={actions} />
      },
    },
  ]
  const navigateToMirror = () => {
    queryClient.invalidateQueries({ queryKey: ['customImageList'] })
    navigate(`${notebookBasePath}/mirror`)
  }
  return (
    <div>
      <TableToolbar
        form={searchForm}
        onSearch={handleSearch}
        className="my-notebook-toolbar"
        searchFormItems={(
          <>
            <Form.Item name="instance_name" className="mb-0">
              <Input
                placeholder="搜索Notebook"
                prefix={<SearchOutlined />}
                className="my-notebook-search-input"
                allowClear
                onChange={(event) => handleNotebookNameSearchChange(event.target.value)}
              />
            </Form.Item>
            <Form.Item name="created_id" className="mb-0">
              <Select
                placeholder="搜索创建人"
                allowClear
                showSearch
                className="min-w-[180px]"
                optionFilterProp="label"
                options={createdByFilterOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                onChange={handleCreatedByChange}
              />
            </Form.Item>
          </>
        )}
        rightActions={[
          {
            key: 'refresh',
            label: '刷新',
            onClick: handleRefresh,
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
            label: '创建Notebook',
            type: 'primary',
            onClick: handleCreateNotebook,
          },
          {
            key: 'customImage',
            label: '自定义镜像',
            type: 'primary',
            onClick: () => navigate(`${notebookBasePath}/mirror`),
          },
        ]}
      />
      <div
        className="overflow-x-auto rounded-[6px] min-w-[100%]"
        style={{
          border: '1px solid #f0f0f0',
        }}
      >
        <Table
          columns={columns as TableColumnsType<NotebookInstance>}
          dataSource={notebooks}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          size="middle"
          pagination={getTablePagination({
            total,
            current: currentPage,
            pageSize,
            onChange: handlePageChange,
          })}
        />
      </div>

      <SaveEnvironmentModal
        open={saveEnvironmentModalVisible}
        onCancel={() => {
          setSaveEnvironmentModalVisible(!saveEnvironmentModalVisible)
        }}
        notebookId={saveEnvironmentNotebookId}
        imageName={saveEnvironmentImageName}
        projectId={Number(projectId) || currentProject?.id}
        onSaved={navigateToMirror}
      />

      <SaveEnvironmentConfirmModal
        open={saveEnvironmentConfirmModalVisible}
        onCancel={() => {
          setSaveEnvironmentConfirmModalVisible(!saveEnvironmentConfirmModalVisible)
        }}
        notebookId={saveEnvironmentConfirmNotebookId}
        projectId={Number(projectId) || currentProject?.id}
        imageName={saveEnvironmentImageName}
        stopNotebook={handleStopNotebook}
        onSaved={navigateToMirror}
      />
    </div>
  )
}
export default MyNoteBook
