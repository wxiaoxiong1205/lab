import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Button, Card, Col, Form, Input,
  Popconfirm, Row,
  Space, Spin, Tag,
  Typography,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined, CloudServerOutlined,
  CopyOutlined, DatabaseOutlined,
  DeleteOutlined, ExclamationCircleOutlined,
  LinkOutlined, PauseCircleOutlined, PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useRequest } from 'ahooks'
import { notebookService } from '../services/notebookService'
import { useProjectStore } from '../stores/projectStore'
import { copyToClipboard, handleInputContextMenu } from '../utils/clipboard'
import type {
  NotebookInstance,
  PortItems,
} from '../types'
import './styles/finetune.scss'
import { formatMaxRuntimeMinutes } from '../utils/timeProcessing'
import { useNotebookBasePath } from '@/hooks/getProjectPath'
import SaveEnvironmentConfirmModal from '@/components/notebook/SaveEnvironmentConfirmModal'
import {
  NotebookPortEditorModal,
  NotebookPortRowCard,
  resolvePortResourceId,
} from '@/components/notebook/NotebookPortEditor'
import type { NotebookPortEditorModalRef } from '@/components/notebook/NotebookPortEditor'
import { registryMirrorService } from '@/services/RegistryMirrorService'
import { getImageDisplayParts, parseImage } from '@/utils/parseImage'

const { Title, Text } = Typography

type TimerHandle = ReturnType<typeof setTimeout>

// 轮询配置常量
const POLLING_INTERVAL = 2000 // 轮询间隔：2秒
const MAX_POLLING_COUNT = 60 // 最大轮询次数：60次（约2分钟）
const MAX_ERROR_COUNT = 5 // 最大连续错误次数：5次
const SSH_PASSWORD_MASK = '******'

const getSshPasswordError = (password: string) => {
  if (password.length < 8) {
    return '密码长度不能少于 8 位'
  }
  const typeCount = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
  ].filter(Boolean).length
  if (typeCount < 2) {
    return '密码必须包含大写字母、小写字母、数字中的至少两类'
  }
  return ''
}

/**
 * Notebook详情页面
 * 显示Notebook的详细信息和状态
 */
const NotebookDetail: React.FC = () => {
  const navigate = useNavigate()
  const { projectId, notebookId } = useParams<{
    projectId: string
    notebookId: string
  }>()
  const { currentProject } = useProjectStore()
  const queryClient = useQueryClient()
  const { notebookBasePath } = useNotebookBasePath()

  const [notebook, setNotebook] = useState<NotebookInstance | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [actionLoading, setActionLoading] = useState<boolean>(false)
  const [sshForm] = Form.useForm()
  const [sshEditing, setSshEditing] = useState(false)
  const [sshSaving, setSshSaving] = useState(false)

  // 防抖相关 refs
  const startDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isProcessingRef = useRef<boolean>(false)

  // 轮询相关 refs
  const pollingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollingActiveRef = useRef<boolean>(false)
  const pollingCountRef = useRef<number>(0)
  const pollingErrorCountRef = useRef<number>(0)

  // 防抖延迟时间常量
  const DEBOUNCE_DELAY = 300
  const STATUS_UPDATE_DELAY = 500

  // 保存环境模态框相关状态
  const [saveEnvironmentConfirmModalVisible, setSaveEnvironmentConfirmModalVisible] = useState<boolean>(false)
  const [parseImageName, setParseImageName] = useState<string>('')

  const portEditorModalRef = useRef<NotebookPortEditorModalRef>(null)

  // 获取项目ID（统一处理）
  const getProjectId = useCallback((): number | null => {
    const id = projectId ? Number(projectId) : currentProject?.id
    return id && !isNaN(id) ? id : null
  }, [projectId, currentProject?.id])

  // 通用防抖函数
  const createDebouncedHandler = useCallback((
    ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    handler: () => void | Promise<void>,
    delay: number = DEBOUNCE_DELAY,
  ) => {
    if (ref.current) {
      clearTimeout(ref.current)
    }
    ref.current = setTimeout(async () => {
      await handler()
      ref.current = null
    }, delay)
  }, [])

  // 停止轮询
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    pollingActiveRef.current = false
    pollingCountRef.current = 0
    pollingErrorCountRef.current = 0
  }, [])

  // 清理所有定时器
  const cleanupTimers = useCallback(() => {
    [startDebounceRef, stopDebounceRef, openDebounceRef, refreshDebounceRef].forEach((ref) => {
      if (ref.current) {
        clearTimeout(ref.current)
        ref.current = null
      }
    })
    stopPolling()
  }, [stopPolling])

  // 判断是否为最终状态（不需要轮询的状态）
  const isFinalStatus = useCallback((status: string) => {
    return status === '运行中' || status === '停止' || status === '失败'
  }, [])

  // 启动轮询
  const startPolling = useCallback(() => {
    if (!notebookId) {
      console.warn('Notebook ID 不存在，无法启动轮询')
      return
    }

    // 如果已经在轮询，先停止
    if (pollingActiveRef.current) {
      stopPolling()
    }

    pollingActiveRef.current = true
    pollingCountRef.current = 0
    pollingErrorCountRef.current = 0

    // 轮询函数
    const poll = async () => {
      if (!pollingActiveRef.current || !notebookId) {
        return
      }

      // 检查最大轮询次数
      pollingCountRef.current += 1
      if (pollingCountRef.current > MAX_POLLING_COUNT) {
        console.warn('轮询达到最大次数，停止轮询')
        stopPolling()
        message.warning('Notebook状态更新超时，请手动刷新')
        return
      }

      const currentProjectId = getProjectId()
      if (!currentProjectId) {
        console.warn('项目ID不存在，停止轮询')
        stopPolling()
        return
      }

      try {
        const data = await notebookService.getNotebookInstance(notebookId, currentProjectId)

        // 成功获取数据，重置错误计数
        pollingErrorCountRef.current = 0

        // 更新状态
        setNotebook(data)

        // 如果状态变为最终状态，停止轮询
        if (isFinalStatus(data.status)) {
          stopPolling()
        }
      }
      catch (error) {
        console.error('轮询获取Notebook详情失败:', error)
        pollingErrorCountRef.current += 1

        // 如果连续错误次数超过限制，停止轮询
        if (pollingErrorCountRef.current >= MAX_ERROR_COUNT) {
          console.warn('轮询连续错误次数过多，停止轮询')
          stopPolling()
          message.error('获取Notebook状态失败，请手动刷新')
        }
      }
    }

    // 立即执行一次
    poll()

    // 设置轮询间隔
    pollingIntervalRef.current = setInterval(poll, POLLING_INTERVAL)
  }, [notebookId, getProjectId, stopPolling, isFinalStatus])

  const controlSaveEnvironmentModal = async (notebookId: number = 0, imageName: string = '') => {
    const res = await registryMirrorService.isBuildingImage(notebookId)
    if (res) {
      message.error('当前notebook正在保存镜像，请稍后再试')
      return
    }
    if (notebookId > 0) {
      setParseImageName(`${parseImage(imageName).image}:${parseImage(imageName).tag}`)
      setSaveEnvironmentConfirmModalVisible(true)
    }
  }

  // 获取Notebook详情
  const fetchNotebook = useCallback(async (skipDebounce = false, silent = false) => {
    if (!notebookId) {
      console.warn('Notebook ID 不存在，无法获取详情')
      return
    }

    const executeFetch = async () => {
      try {
        isProcessingRef.current = true
        if (!silent) {
          setLoading(true)
        }

        const currentProjectId = getProjectId()
        if (!currentProjectId) {
          message.error('未找到项目信息，无法获取详情')
          return
        }

        const data = await notebookService.getNotebookInstance(notebookId, currentProjectId)
        setNotebook(data)
      }
      catch (error) {
        console.error('Failed to fetch notebook:', error)
      }
      finally {
        if (!silent) {
          setLoading(false)
        }
        isProcessingRef.current = false
      }
    }

    // 手动刷新时，清除之前的防抖定时器并设置新的防抖
    if (!skipDebounce) {
      createDebouncedHandler(refreshDebounceRef, executeFetch)
      return
    }

    // 自动刷新时直接执行
    await executeFetch()
  }, [notebookId, getProjectId, createDebouncedHandler])

  const openNotebookPortAdd = useCallback(() => {
    portEditorModalRef.current?.openAdd()
  }, [])

  const openNotebookPortEdit = useCallback((port: PortItems) => {
    portEditorModalRef.current?.openEdit(port)
  }, [])

  const handleDeletePort = useCallback(async (port: PortItems) => {
    if (!notebook)
      return
    const currentProjectId = getProjectId()
    const nid = notebookId ?? String(notebook.id)
    if (!currentProjectId || !nid) {
      message.error('未找到项目或 Notebook 信息')
      return
    }
    try {
      await notebookService.deletePort(String(currentProjectId), nid, resolvePortResourceId(port))
      message.success('端口已删除')
      await fetchNotebook(true, true)
    }
    catch (error) {
      console.error(error)
      message.error('删除端口失败')
    }
  }, [notebook, notebookId, getProjectId, fetchNotebook])

  useEffect(() => {
    if (notebookId) {
      fetchNotebook()
    }
  }, [notebookId, fetchNotebook])

  // 自动刷新 - 当状态为创建中或删除中时
  useEffect(() => {
    if (!notebook) return

    const isCreating = notebook.status === 'creating'
    const isDeleting = notebook.status === 'deleting'
    if (!isCreating && !isDeleting) return

    const interval = setInterval(() => {
      if (notebook && (notebook.status === 'creating' || notebook.status === 'deleting')) {
        fetchNotebook(true, true)
      }
      else {
        clearInterval(interval)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [notebook?.status, fetchNotebook])

  // 监听状态变化，如果状态变为最终状态，停止轮询
  useEffect(() => {
    if (notebook && pollingActiveRef.current) {
      if (isFinalStatus(notebook.status)) {
        stopPolling()
      }
    }
  }, [notebook?.status, isFinalStatus, stopPolling])

  // 组件卸载时清理所有防抖定时器和轮询
  useEffect(() => {
    return cleanupTimers
  }, [cleanupTimers])

  // 乐观更新状态
  const updateStatusOptimistically = useCallback((status: string) => {
    setNotebook((prev) => prev ? { ...prev, status } : null)
  }, [])

  // 启动Notebook
  const handleStart = useCallback(async () => {
    if (!notebook) return

    if (isProcessingRef.current) {
      message.warning('正在启动，请稍后...')
      return
    }

    const executeStart = async () => {
      try {
        isProcessingRef.current = true
        setActionLoading(true)

        const currentProjectId = getProjectId()
        if (!currentProjectId) {
          message.error('未找到项目信息，无法启动')
          return
        }

        await notebookService.startNotebookInstance(notebook.id, currentProjectId)
        message.success('Notebook启动成功')

        // 立即乐观更新状态
        updateStatusOptimistically('准备中')

        // 延迟后开始轮询，确保后端状态已更新
        setTimeout(() => {
          startPolling()
        }, STATUS_UPDATE_DELAY)
      }
      catch (error) {
        message.error('启动Notebook失败')
        console.error('Failed to start notebook:', error)
      }
      finally {
        setActionLoading(false)
        isProcessingRef.current = false
      }
    }

    createDebouncedHandler(startDebounceRef, executeStart)
  }, [notebook, getProjectId, startPolling, updateStatusOptimistically, createDebouncedHandler])

  // 停止Notebook
  const handleStop = useCallback(async () => {
    if (!notebook) return

    if (isProcessingRef.current) {
      message.warning('正在停止，请稍后...')
      return
    }

    const executeStop = async () => {
      try {
        isProcessingRef.current = true
        setActionLoading(true)

        const currentProjectId = getProjectId()
        if (!currentProjectId) {
          message.error('未找到项目信息，无法停止')
          return
        }

        await notebookService.stopNotebookInstance(notebook.id, currentProjectId)
        message.success('Notebook停止成功')

        // 立即乐观更新状态
        updateStatusOptimistically('停止')

        // 延迟后获取最新状态，确保后端状态已更新
        setTimeout(() => {
          fetchNotebook(true, true)
        }, STATUS_UPDATE_DELAY)
      }
      catch (error) {
        message.error('停止Notebook失败')
        console.error('Failed to stop notebook:', error)
      }
      finally {
        setActionLoading(false)
        isProcessingRef.current = false
      }
    }

    createDebouncedHandler(stopDebounceRef, executeStop)
  }, [notebook, getProjectId, fetchNotebook, updateStatusOptimistically, createDebouncedHandler])

  // 删除Notebook
  const handleDelete = useCallback(async () => {
    if (!notebook) return

    try {
      setActionLoading(true)

      const currentProjectId = getProjectId()
      if (!currentProjectId) {
        message.error('未找到项目信息，无法删除')
        return
      }

      await notebookService.deleteNotebookInstance(notebook.id, currentProjectId)
      message.success('Notebook删除成功')

      // 返回列表页面
      if (notebookBasePath) {
        navigate(notebookBasePath)
      }
    }
    catch (error) {
      message.error('删除Notebook失败')
      console.error('Failed to delete notebook:', error)
    }
    finally {
      setActionLoading(false)
    }
  }, [notebook, getProjectId, notebookBasePath, navigate])

  // 打开Notebook
  const handleOpen = useCallback(() => {
    if (!notebook?.access_url) {
      message.warning('Notebook访问地址不存在')
      return
    }

    if (isProcessingRef.current) {
      message.warning('正在处理，请稍后...')
      return
    }

    const openUrl = () => {
      if (notebook?.access_url) {
        window.open(notebook.access_url, '_blank')
      }
    }

    createDebouncedHandler(openDebounceRef, openUrl)
  }, [notebook, createDebouncedHandler])

  // 渲染状态标签
  const renderStatusTag = useCallback((status: string) => {
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
  }, [])

  // 渲染运行时长
  const renderRunningTime = useCallback((running_hours: number, running_minutes: number, running_seconds: number) => {
    if (running_hours > 0 && running_minutes > 0 && running_seconds > 0) {
      return `${running_hours}小时${running_minutes}分钟${running_seconds}秒`
    }
    else if (running_hours > 0 && running_minutes > 0) {
      return `${running_hours}小时${running_minutes}分钟`
    }
    else if (running_hours > 0) {
      return `${running_hours}小时`
    }
    else if (running_minutes > 0 && running_seconds > 0) {
      return `${running_minutes}分钟${running_seconds}秒`
    }
    else if (running_minutes > 0) {
      return `${running_minutes}分钟`
    }
    else if (running_seconds > 0) {
      return `${running_seconds}秒`
    }
    else {
      return '-'
    }
  }, [])

  // 渲染操作按钮
  const renderActions = useCallback(() => {
    if (!notebook) return null

    const { status } = notebook
    const isRunning = status === '运行中'
    const isPreparing = status === '准备中'
    const isStopped = status === '已终止' || status === '已创建'
    const isFailed = status === '失败' || status === '已终止'

    return (
      <Space>
        {isPreparing && (
          <Button
            type="primary"
            icon={<SyncOutlined spin />}
            loading
            disabled
          >
            准备中
          </Button>
        )}

        {isRunning && notebook.access_url && (
          <Button
            type="primary"
            icon={<LinkOutlined />}
            onClick={handleOpen}
          >
            打开Notebook
          </Button>
        )}

        {(isStopped || isFailed) && (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleStart}
          // loading={actionLoading}
          // disabled={actionLoading}
          >
            启动
          </Button>
        )}

        {(isRunning || isPreparing) && (
          <Button
            icon={<PauseCircleOutlined />}
            loading={actionLoading}
            // disabled={isPreparing}
            onClick={() => controlSaveEnvironmentModal(notebook.id, notebook.image)}
          >
            停止
          </Button>
        )}

        <Button
          icon={<ReloadOutlined />}
          onClick={() => fetchNotebook()}
          disabled={isPreparing}
        >
          刷新
        </Button>

        {(isStopped || isFailed) && (
          <Popconfirm
            title="确定要删除这个Notebook吗？"
            onConfirm={handleDelete}
            okText="确定"
            cancelText="取消"
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={actionLoading}
            >
              删除
            </Button>
          </Popconfirm>
        )}
      </Space>
    )
  }, [notebook, handleStart, handleStop, handleDelete, handleOpen, actionLoading, fetchNotebook])

  // 格式化数字，去掉多余的小数点
  const formatNumber = useCallback((value: string | number): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return '-'
    return num % 1 === 0 ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '')
  }, [])

  // 渲染SSH配置项
  const renderSSHField = useCallback((label: string, value: string | undefined, fieldName: string) => {
    if (!value) return null

    return (
      <div className="mb-2 flex items-center justify-between">
        <Text strong className="mr-2">{label}</Text>
        <div className="w-[86%] flex items-center">
          <Input.TextArea
            readOnly
            rows={1}
            autoSize
            className="w-[70%] mr-2"
            value={value}
            onContextMenu={handleInputContextMenu}
          />
          {fieldName !== 'ssh_password' && (
            <Button
              type="text"
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(value, label)}
              size="small"
            />
          )}
        </div>
      </div>
    )
  }, [handleInputContextMenu])

  const openSshEdit = useCallback(() => {
    if (!notebook)
      return

    sshForm.setFieldsValue({
      ssh_username: notebook.ssh_username ?? '',
      ssh_password: SSH_PASSWORD_MASK,
    })
    setSshEditing(true)
  }, [notebook, sshForm])

  const handleSshPasswordFocus = useCallback(() => {
    if (sshForm.getFieldValue('ssh_password') === SSH_PASSWORD_MASK) {
      sshForm.setFieldValue('ssh_password', '')
    }
  }, [sshForm])

  const handleSshPasswordBlur = useCallback(() => {
    if (!String(sshForm.getFieldValue('ssh_password') ?? '').trim()) {
      sshForm.setFieldValue('ssh_password', SSH_PASSWORD_MASK)
    }
  }, [sshForm])

  const saveSshConfig = useCallback(async () => {
    if (!notebook)
      return

    const currentProjectId = getProjectId()
    if (!currentProjectId) {
      message.error('未找到项目信息，无法保存SSH配置')
      return
    }

    const values = sshForm.getFieldsValue()
    const sshUsername = String(values.ssh_username ?? '').trim()
    const rawPassword = String(values.ssh_password ?? '').trim()
    const sshPassword = rawPassword === SSH_PASSWORD_MASK ? '' : rawPassword

    if (!sshUsername && sshPassword) {
      message.error('请填写SSH配置用户名')
      return
    }

    const sshPasswordError = sshPassword ? getSshPasswordError(sshPassword) : ''
    if (sshPasswordError) {
      message.error(sshPasswordError)
      return
    }

    try {
      setSshSaving(true)
      await notebookService.setNotebookSsh({
        project_id: currentProjectId,
        notebook_id: notebook.id,
        is_ssh: Boolean(sshUsername),
        ssh_username: sshUsername,
        ...(sshPassword ? { ssh_password: sshPassword } : {}),
      })
      message.success('SSH配置保存成功')
      setSshEditing(false)
      await fetchNotebook(true, true)
    }
    catch (error) {
      console.error('保存SSH配置失败:', error)
      message.error('SSH配置保存失败')
    }
    finally {
      setSshSaving(false)
    }
  }, [fetchNotebook, getProjectId, notebook, sshForm])

  const navigateToMirror = () => {
    queryClient.invalidateQueries({ queryKey: ['customImageList'] })
    if (notebookBasePath) {
      navigate(`${notebookBasePath}/mirror`)
    }
  }

  // 渲染概览内容
  const renderOverview = useCallback(() => {
    if (!notebook) return null

    const portsList = notebook.ports ?? []
    // const showSshCard = notebook.status === '运行中' && !!notebook.ssh_username && !!notebook.ssh_key && !!notebook.ssh_url
    const showSshCard = !!notebook.ssh_username && !!notebook.ssh_url

    const datasetNamesLine = () => {
      const keys = ['training', 'validation', 'test', 'machine_learning_dataset']
      const CNnames = ['训练数据集', '验证数据集', '测试数据集', '机器学习数据集']
      const res = []
      keys.forEach((key, index) => {
        const value = notebook.dataset_names?.[key]
        if (value && value.length > 0) {
          res.push(value.map((item: string) => `${CNnames[index]}/${item}`).join(','))
        }
        else {
          res.push('')
        }
      })
      return res.filter((item) => item !== '').join(',')
    }

    const modelNamesLine = () => {
      const keys = ['base_models', 'finetuned_models', 'machine_learning_models']
      const CNnames = ['基础模型', '模型管理', '机器学习模型管理']
      const res = []
      keys.forEach((key, index) => {
        const value = notebook.model_names?.[key]
        if (value && value.length > 0) {
          res.push(value.map((item: string) => `${CNnames[index]}/${item}`).join(','))
        }
        else {
          res.push('')
        }
      })
      return res.filter((item) => item !== '').join(',')
    }

    return (
      <div>
        <Row gutter={[16, 16]} align="stretch">
          <Col span={12} className="flex">
            <Card size="small" title="基本信息" className="w-full">
              <div className="mb-2">
                <Text strong>名称：</Text>
                <Text>{notebook.instance_name}</Text>
              </div>
              <div className="mb-2">
                <Text strong>描述：</Text>
                <Text>{notebook.describe || '无'}</Text>
              </div>
              <div className="mb-2">
                <Text strong>状态：</Text>
                {renderStatusTag(notebook.status)}
              </div>
              <div className="mb-2">
                <Text strong>访问权限：</Text>
                <Tag color="blue">
                  {notebook.is_public ? '公开' : '私有'}
                </Tag>
              </div>
              <div className="mb-2">
                <Text strong>创建人：</Text>
                <Text>{notebook.created_by}</Text>
              </div>
              <div className="mb-2">
                <Text strong>命名空间：</Text>
                <Tag color="blue">{getImageDisplayParts(notebook.image)[0] || '-'}</Tag>
              </div>
              <div className="mb-2">
                <Text strong>名称：</Text>
                <Tag color="blue">{getImageDisplayParts(notebook.image)[1] || '-'}</Tag>
              </div>
              <div className="mb-2">
                <Text strong>镜像版本：</Text>
                <Tag color="blue">{getImageDisplayParts(notebook.image)[2] || '-'}</Tag>
              </div>
              <div className="mb-2">
                <Text strong>数据集：</Text>
                <Text>{datasetNamesLine()}</Text>
              </div>
              <div className="mb-2">
                <Text strong>模型：</Text>
                <Text>{modelNamesLine()}</Text>
              </div>
              {/* <div className="mb-2">
                <Text strong>AI服务：</Text>
                <Text>{notebook.model_service_name || '-'}</Text>
              </div> */}
              <div className="mb-2">
                <Text strong>运行时长：</Text>
                <Text>{renderRunningTime(notebook.running_hours, notebook.running_minutes, notebook.running_seconds)}</Text>
              </div>
              <div className="mb-2">
                <Text strong>最大运行时长：</Text>
                <Text>{formatMaxRuntimeMinutes(notebook.max_runtime_minutes)}</Text>
              </div>
              <div className="mb-2">
                <Text strong>创建时间：</Text>
                <Text>{new Date(notebook.created_at).toLocaleString()}</Text>
              </div>
              <div>
                <Text strong>更新时间：</Text>
                <Text>{new Date(notebook.updated_at).toLocaleString()}</Text>
              </div>
            </Card>
          </Col>

          <Col span={12} className="flex min-h-0">
            <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
              <Card
                size="small"
                title="资源配置"
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                styles={{ body: { flex: 1, minHeight: 0, overflow: 'auto' } }}
              >
                <div className="mb-2">
                  <Text strong>CPU：</Text>
                  <Text>
                    {formatNumber(notebook.resource_cpu_request)}
                    {' '}
                    ~
                    {' '}
                    {formatNumber(notebook.resource_cpu_limit)}
                    {' '}
                    Cores
                  </Text>
                </div>
                <div className="mb-2">
                  <Text strong>内存：</Text>
                  <Text>
                    {formatNumber(notebook.resource_memory_request)}
                    {' '}
                    ~
                    {' '}
                    {formatNumber(notebook.resource_memory_limit)}
                    {' '}
                    GB
                  </Text>
                </div>
                <div className="mb-2">
                  <Text strong>显卡类型：</Text>
                  <Text>
                    {notebook.ext?.model && notebook.ext?.memory
                      ? `${notebook.ext.category ? `${notebook.ext.category}/` : ''}${notebook.ext.model}(${notebook.ext.memory})`
                      : notebook?.gpu_type}
                  </Text>
                </div>
                <div className="mb-2">
                  <Text strong>显卡数量：</Text>
                  <Text>
                    {notebook.gpu_count > 0
                      ? `${notebook.gpu_count}x` : '-'}
                  </Text>
                </div>
                {/* <div style={{ marginBottom: 8 }}>
                <Text strong>访问地址：</Text>
                {notebook.access_url ? (
                  <a href={notebook.access_url} target="_blank" rel="noopener noreferrer">
                    {notebook.access_url}
                  </a>
                ) : (
                  <Text type="secondary">未分配</Text>
                )}
              </div> */}
              </Card>
              {showSshCard && (
                <Card
                  size="small"
                  title="SSH配置"
                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  styles={{ body: { flex: 1, minHeight: 0, overflow: 'auto' } }}
                  extra={(
                    <Button
                      size="small"
                      type={sshEditing ? 'primary' : 'default'}
                      loading={sshSaving}
                      onClick={sshEditing ? saveSshConfig : openSshEdit}
                    >
                      {sshEditing ? '保存' : '编辑'}
                    </Button>
                  )}
                >
                  {sshEditing ? (
                    <Form form={sshForm} layout="vertical">
                      <Form.Item name="ssh_username" label="用户名">
                        <Input maxLength={64} allowClear placeholder="请输入 SSH 用户名" />
                      </Form.Item>
                      <Form.Item name="ssh_password" label="密码" className="mb-0">
                        <Input.Password
                          maxLength={128}
                          allowClear
                          placeholder="请输入 SSH 密码"
                          onFocus={handleSshPasswordFocus}
                          onBlur={handleSshPasswordBlur}
                        />
                      </Form.Item>
                    </Form>
                  ) : (
                    <>
                      {renderSSHField('用户名', notebook.ssh_username, 'ssh_username')}
                      {renderSSHField('密码', '********', 'ssh_password')}
                      {/* {renderSSHField('SSH Key', notebook.ssh_key, 'ssh_key')} */}
                      {renderSSHField('SSH', notebook.ssh_url, 'ssh_url')}
                    </>
                  )}
                </Card>
              )}
            </div>
          </Col>

          <Col span={24}>
            <Card
              size="small"
              title="开放端口"
              extra={(
                <Button type="link" size="small" icon={<PlusOutlined />} onClick={openNotebookPortAdd}>
                  新增
                </Button>
              )}
            >
              <div className="flex flex-wrap gap-4">
                {portsList.length > 0
                  ? portsList.map((port) => (
                      <NotebookPortRowCard
                        key={port.id ?? `port-${port.container_port}-${port.protocol}`}
                        port={port}
                        onEdit={() => openNotebookPortEdit(port)}
                        onDelete={() => handleDeletePort(port)}
                      />
                    ))
                  : (
                      <Text type="secondary">暂无开放端口，请点击右上角「新增」添加。</Text>
                    )}
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    )
  }, [notebook, renderStatusTag, renderRunningTime, formatNumber, renderSSHField, sshEditing, sshSaving, sshForm, saveSshConfig, openSshEdit, handleSshPasswordFocus, handleSshPasswordBlur, openNotebookPortAdd, openNotebookPortEdit, handleDeletePort])

  // 返回列表
  const handleBack = useCallback(() => {
    if (notebookBasePath) {
      navigate(notebookBasePath)
    }
  }, [notebookBasePath, navigate])

  if (loading) {
    return (
      <div className="text-center p-12">
        <Spin size="large" />
      </div>
    )
  }

  if (!notebook) {
    return (
      <div className="text-center p-12">
        <Alert message="未找到Notebook信息" type="error" />
      </div>
    )
  }
  return (
    <div className="notebook-detail-container lab-list-page-shell">
      <Card>
        <div className="flex justify-between items-center mb-6">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回
          </Button>
          <div className="flex-shrink-0">
            {renderActions()}
          </div>
        </div>

        <div className="mt-6">
          {renderOverview()}
        </div>
      </Card>

      <NotebookPortEditorModal
        ref={portEditorModalRef}
        getProjectId={getProjectId}
        routeNotebookId={notebookId}
        notebookNumericId={notebook.id}
        onSuccess={() => fetchNotebook(true, true)}
      />

      <SaveEnvironmentConfirmModal
        open={saveEnvironmentConfirmModalVisible}
        onCancel={() => {
          setSaveEnvironmentConfirmModalVisible(!saveEnvironmentConfirmModalVisible)
        }}
        notebookId={notebook.id}
        projectId={Number(projectId) || currentProject?.id}
        imageName={parseImageName}
        stopNotebook={handleStop}
        onSaved={navigateToMirror}
      />
    </div>
  )
}

export default NotebookDetail
