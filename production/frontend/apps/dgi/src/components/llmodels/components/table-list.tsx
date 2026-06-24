import {
  DownOutlined,
  QuestionCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import {
  Button,
  Empty,
  Input,
  Select,
  Space,
  Tooltip,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import _ from 'lodash'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MODELS_API,
  MODEL_INSTANCE_API,
  createModel,
  deleteModel,
  deleteModelInstance,
  queryModelInstancesList,
  updateModel,
} from '../apis'
import { modelsExpandKeysAtom } from '@/stores/models'
import AutoTooltip from '@/components/auto-tooltip'
import DeleteModal from '@/components/delete-modal'
import DropDownActions from '@/components/drop-down-actions'
import DropdownButtons from '@/components/drop-down-buttons'
import { PageSize } from '@/components/logs-viewer/config'
import PageTools from '@/components/page-tools'
import SealTable from '@/components/seal-table'
import { SealColumnProps } from '@/components/seal-table/types'
import { PageAction } from '@/components/gpustacks/config'
import useBodyScroll from '@/hooks/use-body-scroll'
import useExpandedRowKeys from '@/hooks/use-expanded-row-keys'
import useTableRowSelection from '@/hooks/use-table-row-selection'
import useTableSort from '@/hooks/use-table-sort'
import { ListItem as WorkerListItem } from '@/components/gpustacks/config/types'
import { handleBatchRequest } from '@/utils'
import { apiModelCheckAbilities } from '@/services/api'
import {
  InstanceRealtimeLogStatus,
  backendOptionsMap,
  modelCategories,
  modelCategoriesMap,
  modelSourceMap,
} from '../config'
import {
  ButtonList,
  categoryToPathMap,
  generateSource,
  modalConfig,
  setModelActionList,
  sourceOptions,
} from '../config/button-actions'
import type {
  FormData,
  ListItem,
  ModelInstanceListItem,
  SourceType,
} from '../config/types'
import { useGenerateFormEditInitialValues } from '../hooks'
import APIAccessInfoModal from './api-access-info'
import DeployModal from './deploy-modal'
import Instances from './instances'
import ModelTag from './model-tag'
import UpdateModel from './update-modal'
import ViewLogsModal from './view-logs-modal'
import { useTransform } from '@/locales'
import AddChannelModal from '@/pages/channel-manage/components/AddChannelModal'

interface ModelsProps {
  handleSearch: (params?: any) => void
  handleNameChange: (e: any) => void
  handleShowSizeChange?: (page: number, size: number) => void
  handlePageChange: (page: number, pageSize: number | undefined) => void
  handleDeleteSuccess: () => void
  handleDeleteChild: () => void
  handleCategoryChange: (val: any) => void
  onViewLogs: () => void
  onCancelViewLogs: () => void
  handleOnToggleExpandAll: () => void
  onStop?: (ids: number[]) => void
  onStart?: () => void
  queryParams: {
    page: number
    perPage: number
    query?: string
    categories?: string[]
  }
  deleteIds?: number[]
  workerList: WorkerListItem[]
  modelFileOptions: any[]
  catalogList?: any[]
  dataSource: ListItem[]
  loading: boolean
  loadend: boolean
  total: number
}

const getFormattedData = (record: any, extraData = {}) => ({
  id: record.id,
  data: {
    ..._.omit(record, [
      'id',
      'ready_replicas',
      'created_at',
      'updated_at',
      'rowIndex',
    ]),
    ...extraData,
  },
})

const Models: React.FC<ModelsProps> = ({
  handleNameChange,
  handleSearch,
  handlePageChange,
  handleDeleteSuccess,
  handleDeleteChild,
  onViewLogs,
  onCancelViewLogs,
  handleCategoryChange,
  handleOnToggleExpandAll,
  onStop,
  onStart,
  modelFileOptions,
  deleteIds,
  dataSource,
  workerList,
  catalogList,
  queryParams,
  loading,
  loadend,
  total,
}) => {
  const { getGPUList, generateFormValues, gpuDeviceList }
    = useGenerateFormEditInitialValues()
  const { saveScrollHeight, restoreScrollHeight } = useBodyScroll()
  const [updateFormInitials, setUpdateFormInitials] = useState<{
    gpuOptions: any[]
    modelFileOptions?: any[]
    data: any
    isGGUF: boolean
  }>({
    gpuOptions: [],
    modelFileOptions: [],
    data: {},
    isGGUF: false,
  })

  const [editId, setEditId] = useState<number | undefined>(undefined)
  const [modalOpen, setModalOpen] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [preSelectedModel, setPreSelectedModel] = useState<string | undefined>(undefined)

  const { $t } = useTransform()
  const [isLoading, setIsLoading] = useState(false)
  const [expandAtom, setExpandAtom] = useAtom(modelsExpandKeysAtom)
  const navigate = useNavigate()
  const rowSelection = useTableRowSelection()
  const {
    handleExpandChange,
    handleExpandAll,
    updateExpandedRowKeys,
    removeExpandedRowKey,
    expandedRowKeys,
  } = useExpandedRowKeys(expandAtom)
  const { sortOrder, setSortOrder } = useTableSort({
    defaultSortOrder: 'descend',
  })

  const [apiAccessInfo, setAPIAccessInfo] = useState<any>({
    show: false,
    data: {},
  })
  const [openLogModal, setOpenLogModal] = useState(false)
  const [openAddModal, setOpenAddModal] = useState(false)
  const [openDeployModal, setOpenDeployModal] = useState<{
    show: boolean
    width: number | string
    hasLinuxWorker?: boolean
    source: SourceType
    gpuOptions: any[]
    isGGUF?: boolean
    modelFileOptions?: any[]
  }>({
    show: false,
    hasLinuxWorker: false,
    width: 600,
    isGGUF: false,
    source: modelSourceMap.huggingface_value as SourceType,
    gpuOptions: [],
    modelFileOptions: [],
  })
  const currentData = useRef<ListItem>({} as ListItem)
  const [currentInstance, setCurrentInstance] = useState<{
    url: string
    status: string
    id?: number | string
    modelId?: number | string
    tail?: number
  }>({
    url: '',
    status: '',
  })
  const modalRef = useRef<any>(null)

  useEffect(() => {
    if (deleteIds?.length) {
      rowSelection.removeSelectedKey(deleteIds)
    }
  }, [deleteIds])

  useEffect(() => {
    const getData = async () => {
      await getGPUList()
    }
    getData()
    return () => {
      setExpandAtom([])
    }
  }, [])

  const setCurrentData = (data: ListItem) => {
    currentData.current = data
  }

  const handleOnSort = (dataIndex: string, order: any) => {
    setSortOrder(order)
  }

  const handleOnCell = useCallback(async (record: any) => {
    try {
      await updateModel(getFormattedData(record) as any)
      message.success($t('操作成功'))
    }
    catch (error) {
      // ignore
    }
  }, [])

  const handleStartModel = async (row: ListItem) => {
    await updateModel(getFormattedData(row, { replicas: 1 }) as any)
  }

  const handleStopModel = async (row: ListItem) => {
    await updateModel(getFormattedData(row, { replicas: 0 }) as any)
    removeExpandedRowKey([row.id])
  }

  const handleModalOk = useCallback(
    async (data: FormData) => {
      try {
        await updateModel({
          data,
          id: currentData.current?.id as number,
        })
        setOpenAddModal(false)
        message.success($t('操作成功'))
        setTimeout(() => {
          handleSearch()
        }, 150)
        restoreScrollHeight()
      }
      catch (error) { }
    },
    [handleSearch],
  )

  const handleModalCancel = useCallback(() => {
    setOpenAddModal(false)
    restoreScrollHeight()
  }, [])

  const handleDeployModalCancel = () => {
    setOpenDeployModal({
      ...openDeployModal,
      show: false,
    })
  }

  const handleCreateModel = useCallback(
    async (data: FormData) => {
      try {
        const modelData = await createModel({
          data,
        })
        setOpenDeployModal({
          ...openDeployModal,
          show: false,
        })
        setTimeout(() => {
          updateExpandedRowKeys([modelData.id, ...expandedRowKeys])
        }, 300)
        message.success($t('操作成功'))
        setTimeout(() => {
          handleSearch?.()
        }, 150)
      }
      catch (error) { }
    },
    [openDeployModal],
  )

  const handleLogModalCancel = useCallback(() => {
    setOpenLogModal(false)
    onCancelViewLogs()
    restoreScrollHeight()
  }, [onCancelViewLogs])

  const handleDelete = async (row: any) => {
    try {
      // 校验模型是否被引用
      const checkResult = await apiModelCheckAbilities([row.name])

      // 如果被引用，显示提示信息
      if (checkResult.data && checkResult.data.length > 0) {
        const isReferenced = checkResult?.data.find((item: { model_name: string, count: number }) => {
          return item.count > 0
        })
        if (isReferenced) {
          message.warning(`该模型已被渠道 ${isReferenced.channel_names} 引用，无法删除`)
          return
        }
      }

      modalRef.current?.show({
        content: $t('确定删除选中的模型吗？'),
        operation: $t('确定删除'),
        name: row.name,
        async onOk() {
          await deleteModel(row.id)
          removeExpandedRowKey([row.id])
          rowSelection.removeSelectedKey(row.id)
          handleDeleteSuccess()
          handleSearch()
        },
      })
    }
    catch (error) {
      console.error('校验模型引用状态失败:', error)
    }
  }

  const handleDeleteBatch = async () => {
    try {
      // 获取选中行的模型名称
      const selectedModels = dataSource.filter((item: any) =>
        rowSelection.selectedRowKeys.includes(item.id),
      )
      const modelNames = selectedModels.map((item: any) => item.name)

      // 校验所有选中模型是否被引用
      const checkResult = await apiModelCheckAbilities(modelNames)

      const isReferenced = checkResult?.data.find((item: { model_name: string, count: number }) => {
        return item.count > 0
      })
      if (isReferenced) {
        message.warning($t('所选模型中包含正在被使用中的模型，无法删除'))
        return
      }

      modalRef.current?.show({
        content: $t('确定删除选中的模型吗？'),
        operation: $t('确定删除'),
        selection: true,
        async onOk() {
          const successIds: any[] = []
          const res = await handleBatchRequest(
            rowSelection.selectedRowKeys,
            async (id: any) => {
              await deleteModel(id)
              successIds.push(id)
            },
          )
          rowSelection.removeSelectedKeys(successIds)
          handleDeleteSuccess()
          handleSearch()
          return res
        },
      })
    }
    catch (error) {
      console.error('校验模型引用状态失败:', error)
    }
  }

  const handleOpenPlayGround = (row: any) => {
    for (const [category, path] of Object.entries(categoryToPathMap)) {
      if (
        row.categories?.includes(category)
        && [
          modelCategoriesMap.text_to_speech,
          modelCategoriesMap.speech_to_text,
        ].includes(category)
      ) {
        navigate(`${path}&model=${row.name}`)
        return
      }
      if (row.categories?.includes(category)) {
        navigate(`${path}?model=${row.name}`)
        return
      }
    }
    navigate(`/playground/chat?model=${row.name}`)
  }

  const handleViewLogs = useCallback(
    async (row: any) => {
      try {
        setCurrentInstance({
          url: `${MODEL_INSTANCE_API}/${row.id}/logs`,
          status: row.state,
          id: row.id,
          modelId: row.model_id,
          tail: InstanceRealtimeLogStatus.includes(row.state)
            ? undefined
            : PageSize - 1,
        })
        setOpenLogModal(true)
        onViewLogs()
        saveScrollHeight()
      }
      catch (error) {
        console.log('error:', error)
      }
    },
    [onViewLogs],
  )
  const handleDeleteInstace = useCallback(
    (row: any) => {
      modalRef.current?.show({
        content: $t('确定删除选中的模型吗？'),
        okText: $t('确定删除'),
        operation: $t('确定删除'),
        name: row.name,
        async onOk() {
          await deleteModelInstance(row.id)
          handleDeleteChild()
        },
      })
    },
    [deleteModelInstance],
  )

  const getModelInstances = useCallback(async (row: any, options?: any) => {
    try {
      const params = {
        id: row.id,
        page: 1,
        perPage: 100,
      }
      const data = await queryModelInstancesList(params, {
        token: options?.token,
      })
      return data.items || []
    }
    catch (error) {
      return []
    }
  }, [])

  const generateChildrenRequestAPI = useCallback((params: any) => {
    return `${MODELS_API}/${params.id}/instances`
  }, [])

  const handleEdit = async (row: ListItem) => {
    const initialValues = generateFormValues(row, gpuDeviceList.current)
    setUpdateFormInitials({
      gpuOptions: gpuDeviceList.current,
      modelFileOptions,
      data: initialValues,
      isGGUF: row.backend === backendOptionsMap.llamaBox,
    })
    setCurrentData(row)
    setOpenAddModal(true)
    saveScrollHeight()
  }

  const handleViewAPIInfo = useCallback((row: ListItem) => {
    setAPIAccessInfo({
      show: true,
      data: {
        id: row.id,
        name: row.name,
        categories: row.categories,
        url: `${MODELS_API}/${row.id}/instances`,
      },
    })
  }, [])

  const handleViewExternalService = useCallback((row: ListItem) => {
    setPreSelectedModel(row.name) // 设置预选的模型名称
    setModalOpen(true)
  }, [])

  const handleSelect = useCallback(
    async (val: any, row: ListItem) => {
      try {
        if (val === 'edit') {
          handleEdit(row)
        }
        if (val === 'chat') {
          handleOpenPlayGround(row)
        }
        if (val === 'delete') {
          handleDelete(row)
        }
        if (val === 'start') {
          await handleStartModel(row)
          message.success($t('操作成功'))
          updateExpandedRowKeys([row.id, ...expandedRowKeys])
          onStart?.()
        }

        if (val === 'api') {
          handleViewAPIInfo(row)
        }

        if (val === 'external_service') {
          handleViewExternalService(row)
        }

        if (val === 'stop') {
          modalRef.current?.show({
            content: $t('确认停止选中的模型吗？'),
            title: $t('确认停止'),
            okText: $t('停止'),
            operation: $t('确认停止'),
            name: row.name,
            async onOk() {
              await handleStopModel(row)
              onStop?.([row.id])
            },
          })
        }
      }
      catch (error) {
        // ignore
      }
    },
    [
      handleEdit,
      handleOpenPlayGround,
      handleDelete,
      onStop,
      onStart,
      expandedRowKeys,
    ],
  )

  const handleChildSelect = useCallback(
    (val: any, row: ModelInstanceListItem) => {
      if (val === 'delete') {
        handleDeleteInstace(row)
      }
      if (val === 'viewlog') {
        handleViewLogs(row)
      }
    },
    [handleViewLogs, handleDeleteInstace],
  )

  const renderChildren = useCallback(
    (list: any, options: { parent?: any, [key: string]: any }) => {
      return (
        <Instances
          list={list}
          currentExpanded={options.currentExpanded}
          modelData={options.parent}
          workerList={workerList}
          handleChildSelect={handleChildSelect}
        >
        </Instances>
      )
    },
    [workerList],
  )

  const handleClickDropdown = (item: any) => {
    if (item.key === 'catalog') {
      navigate('/models/catalog')
      return
    }

    const config = modalConfig[item.key]
    const hasLinuxWorker = workerList.some(
      (worker) => _.toLower(worker.labels?.os) === 'linux',
    )

    if (config) {
      setOpenDeployModal({
        ...config,
        hasLinuxWorker,
        gpuOptions: gpuDeviceList.current,
        modelFileOptions,
      })
    }
  }

  const handleStartBatch = async () => {
    modalRef.current?.show({
      content: $t('确认启动选中的模型吗？'),
      title: $t('确认启动'),
      okText: $t('启动'),
      operation: $t('确认启动'),
      async onOk() {
        await handleBatchRequest(rowSelection.selectedRows, handleStartModel)
        onStart?.()
      },
    })
  }

  const handleStopBatch = async () => {
    modalRef.current?.show({
      content: $t('确认停止选中的模型吗？'),
      title: $t('确认停止'),
      okText: $t('停止'),
      operation: $t('确认停止'),
      async onOk() {
        await handleBatchRequest(rowSelection.selectedRows, handleStopModel)
        onStop?.(rowSelection.selectedRowKeys as number[])
      },
    })
  }

  const handleActionSelect = (val: any) => {
    if (val === 'delete') {
      handleDeleteBatch()
    }
    if (val === 'start') {
      handleStartBatch()
    }
    if (val === 'stop') {
      handleStopBatch()
    }
  }

  const columns: SealColumnProps[] = useMemo(() => {
    return [
      {
        title: $t('名称'),
        dataIndex: 'name',
        key: 'name',
        width: 400,
        span: 6,
        render: (text: string, record: ListItem) => (
          <span className="flex justify-center items-center gap-2" style={{ maxWidth: '100%' }}>
            <AutoTooltip ghost>
              <span className="ml-2">{text}</span>
            </AutoTooltip>
            <ModelTag categoryKey={record.categories?.[0] || ''} />
          </span>
        ),
      },
      {
        title: $t('来源'),
        dataIndex: 'source',
        key: 'source',
        span: 7,
        render: (text: string, record: ListItem) => (
          <span className="flex flex-column" style={{ width: '100%' }}>
            <AutoTooltip ghost>{generateSource(record)}</AutoTooltip>
          </span>
        ),
      },
      {
        title: (
          <Tooltip
            title={$t('副本数', {
              api: `${typeof window !== 'undefined' ? window.location.origin : ''}/v1`,
            })}
          >
            <span style={{ fontWeight: 'var(--font-weight-medium)' }}>
              {$t('副本数')}
            </span>
            <QuestionCircleOutlined className="m-l-5" />
          </Tooltip>
        ),
        dataIndex: 'replicas',
        key: 'replicas',
        align: 'center',
        span: 4,
        editable: {
          valueType: 'number',
          title: $t('副本数'),
        },
        render: (text: number, record: ListItem) => (
          <span style={{ paddingLeft: 10, minWidth: '33px' }}>
            {record.ready_replicas}
            {' '}
            /
            {record.replicas}
          </span>
        ),
      },
      {
        title: $t('创建时间'),
        dataIndex: 'created_at',
        key: 'created_at',
        defaultSortOrder: 'descend',
        sortOrder,
        sorter: false,
        span: 4,
        render: (text: number) => (
          <AutoTooltip ghost>
            {dayjs(text).format('YYYY-MM-DD HH:mm:ss')}
          </AutoTooltip>
        ),
      },
      {
        title: $t('操作'),
        key: 'operation',
        dataIndex: 'operation',
        span: 3,
        render: (text, record) => (
          <DropdownButtons
            items={setModelActionList(record)}
            onSelect={(val) => handleSelect(val, record)}
          />
        ),
      },
    ]
  }, [sortOrder, handleSelect])

  const handleToggleExpandAll = useCallback(
    (expanded: boolean) => {
      const keys = dataSource.map((item) => item.id)
      handleExpandAll(expanded, keys)
      if (expanded) {
        handleOnToggleExpandAll()
      }
    },
    [dataSource],
  )

  const handleAddChannelSuccess = () => {
    setModalOpen(false)
    setEditId(undefined)
  }

  return (
    <>
      {/* <PageContainer
        className="models-page-container"
        ghost
        header={{
          title: $t('模型'),
          style: {
            paddingInline: 'var(--layout-content-header-inlinepadding)'
          },
          breadcrumb: {}
        }}
        extra={[]}
      > */}
      <PageTools
        marginBottom={22}
        left={(
          <Space>
            <Input
              placeholder={$t('名称查询')}
              style={{ width: 230 }}
              size="middle"
              allowClear
              onChange={handleNameChange}
            >
            </Input>
            {/* <Select
              allowClear
              showSearch={false}
              placeholder={$t('按类别筛选')}
              style={{ width: 180 }}
              size="middle"
              maxTagCount={1}
              onChange={handleCategoryChange}
              options={modelCategories.filter((item) => item.value)}
            ></Select> */}
            <Button
              type="text"
              style={{ color: 'var(--ant-color-text-tertiary)' }}
              onClick={handleSearch}
              icon={<SyncOutlined></SyncOutlined>}
            >
            </Button>
          </Space>
        )}
        right={(
          <Space size={20}>
            {/* <DropDownActions
              menu={{
                items: sourceOptions,
                onClick: handleClickDropdown
              }}
              trigger={['hover']}
              placement="bottomRight"
            >
              <Button
                icon={<DownOutlined></DownOutlined>}
                type="primary"
                iconPosition="end"
              >
                {$t('部署模型')}
              </Button>
            </DropDownActions> */}
            <DropdownButtons
              items={ButtonList}
              extra={
                rowSelection.selectedRowKeys.length > 0 && (
                  <span>
                    (
                    {rowSelection.selectedRowKeys.length}
                    )
                  </span>
                )
              }
              size="default"
              showText
              disabled={!rowSelection.selectedRowKeys.length}
              onSelect={handleActionSelect}
            />
          </Space>
        )}
      >
      </PageTools>

      <SealTable
        columns={columns}
        dataSource={dataSource}
        rowSelection={rowSelection}
        expandedRowKeys={expandedRowKeys}
        onExpand={handleExpandChange}
        onExpandAll={handleToggleExpandAll}
        loading={loading}
        loadend={loadend}
        rowKey="id"
        childParentKey="model_id"
        expandable
        onSort={handleOnSort}
        onCell={handleOnCell}
        pollingChildren={false}
        watchChildren
        loadChildren={getModelInstances}
        loadChildrenAPI={generateChildrenRequestAPI}
        renderChildren={renderChildren}
        pagination={{
          showSizeChanger: true,
          pageSize: queryParams.perPage,
          current: queryParams.page,
          total,
          hideOnSinglePage: queryParams.perPage === 10,
          onChange: handlePageChange,
        }}
      >
      </SealTable>
      {/* </PageContainer> */}
      <UpdateModel
        open={openAddModal}
        action={PageAction.EDIT}
        title={$t('编辑模型')}
        updateFormInitials={updateFormInitials}
        onCancel={handleModalCancel}
        onOk={handleModalOk}
      >
      </UpdateModel>
      <DeployModal
        open={openDeployModal.show}
        action={PageAction.CREATE}
        title={$t('部署模型')}
        source={openDeployModal.source}
        width={openDeployModal.width}
        isGGUF={openDeployModal.isGGUF}
        hasLinuxWorker={openDeployModal.hasLinuxWorker}
        gpuOptions={openDeployModal.gpuOptions}
        modelFileOptions={openDeployModal.modelFileOptions || []}
        onCancel={handleDeployModalCancel}
        onOk={handleCreateModel}
      >
      </DeployModal>
      <ViewLogsModal
        url={currentInstance.url}
        tail={currentInstance.tail}
        id={currentInstance.id}
        modelId={currentInstance.modelId}
        open={openLogModal}
        onCancel={handleLogModalCancel}
      >
      </ViewLogsModal>
      <DeleteModal ref={modalRef}></DeleteModal>
      <APIAccessInfoModal
        open={apiAccessInfo.show}
        data={apiAccessInfo.data}
        onClose={() => {
          setAPIAccessInfo({
            ...apiAccessInfo,
            show: false,
          })
        }}
      >
      </APIAccessInfoModal>
      <AddChannelModal
        editId={editId}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditId(undefined)
          setPreSelectedModel(undefined) // 清除预选模型
        }}
        onSuccess={handleAddChannelSuccess}
        readOnly={readOnly}
        preSelectedModel={preSelectedModel} // 传入预选模型
      />
    </>
  )
}

export default Models
