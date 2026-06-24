import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TableColumnsType } from 'antd'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Spin, Table, Tag, Tooltip, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ArrowLeftOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import type { GetCustomImageListParams, RegistryMirrorImage } from '@/services/RegistryMirrorService'
import { NotebookCustomImageType, registryMirrorService } from '@/services/RegistryMirrorService'
import { registryService } from '@/services/registryService'
import { CodeView } from '@/components/codeView'
import TableToolbar from '@/components/common/TableToolbar'
import { TagsSelect } from '@/components/notebook/TagsSelect'
import { tagsService } from '@/services/tagsServie'
import { calculatePageAfterDelete } from '@/utils/paginationUtils'
import { getImageDisplayParts } from '@/utils/parseImage'

export default function CustomImage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const addImageType = useMemo(() => {
    if (pathname.includes('finetune/notebooks/mirror'))
      return NotebookCustomImageType.baseModelNotebook
    if (pathname.includes('machine-notebook/mirror'))
      return NotebookCustomImageType.machineLearningNotebook
    return NotebookCustomImageType.baseModelNotebook
  }, [pathname])
  const queryClient = useQueryClient()
  const [addForm] = Form.useForm<{ namespace: string, image_name: string, describe?: string }>()
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addSubmitting, setAddSubmitting] = useState(false)
  /** 用于拉取命名空间的仓库 id（多仓库时可在弹窗内切换） */
  const [namespaceRegistryId, setNamespaceRegistryId] = useState<number | null>(null)
  const [searchParams, setSearchParams] = useState<GetCustomImageListParams>({
    project_id: Number(projectId),
    size: 10,
    page: 1,
    image_name: '',
    business_type: 'custom_image',
    image_type: addImageType,
  })

  useEffect(() => {
    const Id = Number(projectId)
    if (!Number.isFinite(Id))
      return
    setSearchParams((prev) =>
      prev.project_id === Id ? prev : { ...prev, project_id: Id, page: 1 },
    )
  }, [projectId])

  useEffect(() => {
    setSearchParams((prev) =>
      prev.image_type === addImageType ? prev : { ...prev, image_type: addImageType, page: 1 },
    )
  }, [addImageType])

  const { data: tags, isLoading: tagsLoading } = useQuery({
    queryKey: ['tags', 'custom_image'],
    queryFn: () => tagsService.getTagsByBusinessType('custom_image'),
    staleTime: 0,
    gcTime: 0,
  })

  // 临时搜索输入值
  const [searchInputValue, setSearchInputValue] = useState<string>('')

  const [viewLogId, setViewLogId] = useState<number>(undefined)
  const { data: logText, isLoading: isLogLoading } = useQuery({
    queryKey: ['logText', viewLogId],
    queryFn: () => {
      return registryMirrorService.getBuildLog({
        task_id: viewLogId,
        end_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        days: 30,
      }).then((res) => res.logs.join('\n'))
    },
    enabled: !!viewLogId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
    refetchInterval: 3000,
  })

  const { data: customImageList, isLoading, refetch: refetchCustomImageList } = useQuery({
    queryKey: ['customImageList', searchParams],
    queryFn: () => {
      return registryMirrorService.getCustomImageList(searchParams)
    },
    refetchOnMount: 'always',
    staleTime: 0,
  })

  const { data: registryList, isLoading: registryListLoading } = useQuery({
    queryKey: ['registryList', 'customImagePage'],
    queryFn: () => registryService.getRegistryConfigs({ page: 1, page_size: 100 }),
    staleTime: 60_000,
  })

  const registryItems = registryList?.items ?? []

  useEffect(() => {
    const items = registryList?.items ?? []
    if (items.length === 0) {
      setNamespaceRegistryId(null)
      return
    }
    setNamespaceRegistryId((prev) => {
      if (prev != null && items.some((r) => r.id === prev))
        return prev
      return items[0].id
    })
  }, [registryList])

  const { data: namespaceListData, isLoading: namespaceListLoading } = useQuery({
    queryKey: ['customImageNamespaces', namespaceRegistryId],
    queryFn: () =>
      registryMirrorService.getNamespaceEnum({
        repository_id: namespaceRegistryId!,
        search_type: 1,
        namespaces: '',
        image_name: '',
        page: 1,
        size: 100,
        image_type: addImageType,
      }),
    enabled: namespaceRegistryId != null,
    staleTime: 0,
  })

  const addModalNamespace = Form.useWatch('namespace', addForm)

  const { data: imageNameListData, isLoading: imageNameListLoading } = useQuery({
    queryKey: ['customImageImageNames', namespaceRegistryId, addModalNamespace, addImageType],
    queryFn: () =>
      registryMirrorService.getNamespaceEnum({
        repository_id: namespaceRegistryId!,
        search_type: 2,
        namespaces: addModalNamespace!,
        image_name: '',
        page: 1,
        size: 100,
        image_type: addImageType,
      }),
    enabled: addModalOpen && namespaceRegistryId != null && !!addModalNamespace,
    staleTime: 0,
  })

  const namespaceOptions = useMemo(() => {
    const items = namespaceListData?.items ?? []
    return items.map((ns: string) => ({ label: ns, value: ns }))
  }, [namespaceListData?.items])

  const imageNameOptions = useMemo(() => {
    const items = imageNameListData?.items ?? []
    return items.map((name: string) => ({ label: name, value: name }))
  }, [imageNameListData?.items])

  // 搜索功能 - 点击搜索按钮时触发
  const handleSearch = () => {
    setSearchParams({
      ...searchParams,
      image_name: searchInputValue.trim(),
      page: 1,
    })
  }

  // 取消搜索
  const handleCancelSearch = () => {
    setSearchInputValue('')
    setSearchParams({
      ...searchParams,
      image_name: '',
      page: 1,
    })
  }

  const handleCreate = () => {
    if (!projectId) {
      message.error('缺少项目信息')
      return
    }
    if (registryListLoading) {
      message.info('正在加载镜像仓库，请稍候')
      return
    }
    if (namespaceRegistryId == null) {
      message.warning('暂无可用镜像仓库，请先配置仓库')
      return
    }
    void queryClient.invalidateQueries({ queryKey: ['customImageNamespaces', namespaceRegistryId] })
    void queryClient.invalidateQueries({ queryKey: ['customImageImageNames', namespaceRegistryId] })
    addForm.resetFields()
    setAddModalOpen(true)
  }

  const handleAddModalOk = () => {
    addForm.submit()
  }

  const handleAddImageSubmit = async (values: { namespace: string, image_name: string, describe?: string }) => {
    if (!projectId || namespaceRegistryId == null)
      return
    setAddSubmitting(true)
    try {
      await registryMirrorService.addImage(Number(projectId), {
        namespace: values.namespace,
        image_name: values.image_name.trim(),
        describe: values.describe?.trim(),
        image_type: addImageType,
      })
      message.success('添加成功')
      setAddModalOpen(false)
      addForm.resetFields()
      refetchCustomImageList()
    }
    catch (error: any) {
      message.error(error?.response?.data?.detail || '添加镜像失败')
    }
    finally {
      setAddSubmitting(false)
    }
  }

  // 删除功能
  const handleDelete = (id: number) => {
    registryMirrorService.deleteCustomImage(id).then(() => {
      const targetPage = calculatePageAfterDelete(searchParams.page, searchParams.size, customImageList?.total, 1)

      if (targetPage !== searchParams.page) {
        setSearchParams((prev) => ({
          ...prev,
          page: targetPage,
        }))
      }

      message.success('删除成功')
      refetchCustomImageList()
    })
  }

  // 渲染状态标签
  const renderStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string, text: string }> = {
      已完成: { color: 'success', text: '已完成' },
      失败: { color: 'error', text: '失败' },
      运行中: { color: 'processing', text: '运行中' },
      排队中: { color: 'warning', text: '排队中' },
      准备中: { color: 'processing', text: '准备中' },
      创建: { color: 'default', text: '创建' },
    }

    const statusConfig = statusMap[status] || { color: 'default', text: status }
    return <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
  }

  // 关闭日志弹窗
  const handleCloseLogModal = () => {
    setViewLogId(undefined)
  }

  const setEditTagId = (record: RegistryMirrorImage) => {
    let selectedTagsValue = record.tags.map((tag) => tag.tag_element_id)
    const onTagsChange = (value: number[]) => {
      selectedTagsValue = value
    }
    Modal.confirm({
      title: '编辑标签',
      content: <TagsSelect tags={tags?.data.filter((tag) => tag.elements.length > 0)} value={selectedTagsValue} onChange={onTagsChange} />,
      icon: null,
      onOk: () => {
        tagsService.saveTags({
          business_type: 'custom_image',
          business_id: record.output_image_id,
          tag_element_ids: selectedTagsValue,
        }).then(() => {
          message.success('编辑标签成功')
          refetchCustomImageList()
        })
      },
    })
  }

  // 表格列定义
  const columns: TableColumnsType<RegistryMirrorImage> = [
    {
      title: '镜像',
      dataIndex: 'output_image',
      key: 'name',
      width: 380,
      render: (text: string) => {
        const [namespace, image, tag] = getImageDisplayParts(text)

        if (!(namespace && image && tag)) {
          return <span className="font-medium break-all">{text}</span>
        }

        return (
          <div className="flex flex-col gap-1 leading-5">
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
      title: '描述',
      dataIndex: 'describe',
      key: 'describe',
      width: 200,
      render: (text?: string) =>
        text || (
          <span className="text-gray-500">暂无描述</span>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status: string) => renderStatusTag(status),
    },
    {
      title: '任务来源',
      dataIndex: 'business_name',
      key: 'business_name',
      width: 200,
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text} className="image-card-tooltip">
          <span className="font-medium inline-block max-w-[220px] overflow-hidden whitespace-nowrap text-ellipsis align-bottom">
            {text}
          </span>
        </Tooltip>
      ),
    },
    {
      title: '标签',
      dataIndex: 'base_image',
      key: 'tags',
      width: 250,
      render: (_: any, record: RegistryMirrorImage) => (
        <>
          {record.tags && record.tags.length > 0 ? (
            record.tags.map((tag) => (
              <Tag key={tag.tag_element_id} color={tag.tag_class_name === '框架' ? 'blue' : 'green'}>
                {tag.tag_element_name}
              </Tag>
            ))
          ) : (
            <span className="text-gray-500">暂无标签</span>
          )}
        </>
      ),
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      width: 160,
    },
    {
      title: '创建时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right',
      align: 'center',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => setEditTagId(record)} disabled={record.status !== '已完成'}>编辑标签</Button>
          {(record.status === '已完成' || record.status === '失败') && (
            <Popconfirm
              title="确认删除"
              description={`确定要删除镜像 ${record.name} 吗？删除后将无法恢复。`}
              onConfirm={() => handleDelete(record.id)}
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="link"
                size="small"
              >
                删除
              </Button>
            </Popconfirm>
          )}

          <Button
            type="link"
            size="small"
            onClick={() => setViewLogId(record.id)}
          >
            日志
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="custom-image-container lab-list-page-shell">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        返回
      </Button>
      <TableToolbar
        searchFormItems={(
          <div>
            <Input
              placeholder="请输入镜像名称"
              className="w-[240px]"
              value={searchInputValue}
              onChange={(e) => setSearchInputValue(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              onClear={handleCancelSearch}
            />

            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              className="ml-2"
            >
              搜索
            </Button>
          </div>
        )}
        rightActions={[
          {
            key: 'search',
            label: '刷新',
            type: 'default',
            icon: <ReloadOutlined />,
            onClick: refetchCustomImageList,
          },
          {
            key: 'create',
            label: '添加镜像',
            type: 'default',
            onClick: handleCreate,
          },
        ]}
      />
      <Table
        columns={columns}
        dataSource={customImageList?.items || []}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 1200 }}
        pagination={{
          current: searchParams.page,
          pageSize: searchParams.size,
          total: customImageList?.total || 0,
          showSizeChanger: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          onChange: (page, size) => {
            setSearchParams({
              ...searchParams,
              page,
              size,
            })
          },
        }}
        className="!mb-4"
      />

      <Modal
        open={!!viewLogId}
        onCancel={handleCloseLogModal}
        width="80%"
        title="日志"
        centered
        cancelText="取消"
        okText="确认"
        footer={null}
      >
        {CodeView({
          text: logText || '',
          language: 'log',
          customStyle: {
            height: '60vh',
          },
          featureControl: {
            wordCount: false,
          },
        })}
      </Modal>

      <Modal
        title="添加镜像"
        width={800}
        open={addModalOpen}
        onCancel={() => {
          setAddModalOpen(false)
          addForm.resetFields()
        }}
        onOk={handleAddModalOk}
        confirmLoading={addSubmitting}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={addForm}
          layout="vertical"
          onFinish={handleAddImageSubmit}
        >
          {registryItems.length > 1 && (
            <Form.Item label="镜像仓库" required>
              <Select
                value={namespaceRegistryId ?? undefined}
                placeholder="请选择镜像仓库"
                loading={registryListLoading}
                options={registryItems.map((r) => ({ label: r.name, value: r.id }))}
                onChange={(id: number) => {
                  setNamespaceRegistryId(id)
                  addForm.setFieldsValue({ namespace: undefined, image_name: undefined })
                }}
              />
            </Form.Item>
          )}
          <Form.Item
            name="namespace"
            label="命名空间"
            rules={[{ required: true, message: '请选择命名空间' }]}
          >
            <Select
              placeholder={namespaceRegistryId ? '请选择命名空间' : '请先选择镜像仓库'}
              disabled={namespaceRegistryId == null}
              loading={namespaceListLoading}
              options={namespaceOptions}
              showSearch
              optionFilterProp="label"
              notFoundContent={namespaceListLoading ? <Spin size="small" /> : '暂无命名空间'}
              onChange={() => {
                addForm.setFieldsValue({ image_name: undefined })
              }}
            />
          </Form.Item>
          <Form.Item
            name="image_name"
            label="镜像名称"
            rules={[{ required: true, message: '请选择镜像名称' }]}
          >
            <Select
              placeholder={addModalNamespace ? '请选择镜像名称' : '请先选择命名空间'}
              disabled={!addModalNamespace}
              loading={imageNameListLoading}
              options={imageNameOptions}
              showSearch
              optionFilterProp="label"
              notFoundContent={imageNameListLoading ? <Spin size="small" /> : '暂无镜像名称'}
            />
          </Form.Item>
          <Form.Item name="describe" label="描述">
            <Input.TextArea placeholder="请输入描述（选填）" rows={3} allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
