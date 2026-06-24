import { useQuery } from '@tanstack/react-query'
import { Button, Input, Menu, Modal, Space, Table, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { DeleteOutlined, EditOutlined, InfoCircleOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { tagsService } from '@/services/tagsServie'
import { EditTagsModal } from '@/components/systemManage/EditTagsModal'
import type { classesItemType } from '@/types/tags'
import { useSystemSetting } from '@/hooks/system/systemSetting'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import './TagsSetting.css'

export const TagsSetting = () => {
  const [selectedMenu, setSelectedMenu] = useState('custom_image')
  const [searchText, setSearchText] = useState('')
  const [editTagsModalOpen, setEditTagsModalOpen] = useState(false)
  const [editTag, setEditTag] = useState<classesItemType | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { tagsSettingMenuItems } = useSystemSetting()

  const searchParams = useMemo(
    () => ({
      page,
      size: pageSize,
      business_type: selectedMenu,
      ...(searchText ? { name: searchText } : {}),
    }),
    [selectedMenu, searchText, page, pageSize],
  )

  useEffect(() => {
    setPage(1)
  }, [selectedMenu, searchText])

  const { data: tags, isLoading: tagsLoading, refetch: refetchTags } = useQuery({
    queryKey: ['tags', selectedMenu, searchText, page, pageSize],
    queryFn: () => tagsService.getClassesList(searchParams),
    staleTime: 0,
    gcTime: 0,
  })

  const tableData = tags?.items?.map((tag) => ({
    id: tag.id,
    name: tag.name,
    elements: tag.elements?.map((e) => e.tag_element_name).join(','),
  })) ?? []

  const plusTags = (existing?: { id: number, name: string }) => {
    const edit = existing != null
    let nameDraft = existing?.name ?? ''
    Modal.confirm({
      title: edit ? '编辑标签分类' : '添加标签分类',
      icon: null,
      content: (
        <Input
          key={edit ? `edit-class-${existing!.id}` : 'add-class'}
          defaultValue={nameDraft}
          placeholder="请输入标签名称"
          allowClear
          maxLength={128}
          autoFocus
          onChange={(e) => {
            nameDraft = e.target.value
          }}
        />
      ),
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        const name = nameDraft.trim()
        if (!name) {
          message.warning('请输入标签名称')
          return Promise.reject(new Error('empty'))
        }
        try {
          if (!edit) {
            await tagsService.createClass({
              name,
              business_type: selectedMenu,
              sort_order: tags?.total ?? 0,
            })
            message.success('添加成功')
          }
          else {
            await tagsService.updateClass(existing!.id, {
              name,
            })
            message.success('保存成功')
          }
          await refetchTags()
        }
        catch (e) {
          console.error(e)
          return Promise.reject(e)
        }
      },
    })
  }

  const deleteTags = (id: number) => {
    tagsService.deleteClass(id).then(() => {
      message.success('删除成功')
      refetchTags()
    })
  }

  const onEditElements = (id: number) => {
    setEditTag(tags?.items?.find((t) => t.id === id) ?? null)
    setEditTagsModalOpen(true)
  }

  const columns = [
    { width: 200, title: '标签名称', dataIndex: 'name', key: 'name' },
    {
      width: 400,
      title: '标签值',
      dataIndex: 'elements',
      key: 'elements',
      render: (text: string) =>
        text === ''
          ? <span className="text-gray-500">暂无标签值</span>
          : text,
    },
    {
      width: 120,
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      render: (_: unknown, record: { id: number, name: string }) => {
        const actions: TableActionItem[] = [
          {
            key: 'edit',
            label: '编辑',
            icon: <EditOutlined />,
            onClick: () => plusTags({ id: record.id, name: record.name }),
          },
          {
            key: 'view',
            label: '详情',
            icon: <InfoCircleOutlined />,
            onClick: () => onEditElements(record?.id),
          },
          {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            confirm: {
              title: '确定删除该标签？',
              description: '将删除该标签及其标签值。',
              onConfirm: () => { deleteTags(record.id) },
              okText: '确定',
              cancelText: '取消',
            },
          },
        ]

        return (
          <Space size={24} className="tags-setting-actions">
            <TableActionColumn actions={actions} maxVisible={2} />
          </Space>
        )
      },
    },
  ]

  return (
    <div className="flex w-full min-w-0">
      <Menu
        mode="inline"
        selectedKeys={[selectedMenu]}
        items={tagsSettingMenuItems}
        onClick={({ key }) => setSelectedMenu(key)}
        className="!w-[220px] shrink-0"
      />

      <div className="min-w-0 flex-1 overflow-x-auto p-4">
        <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <Input
            placeholder="请输入标签名称"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={() => refetchTags()}
            allowClear
            className="w-[240px]"
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => plusTags()}>
            添加标签
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={tableData}
          rowKey={(r) => String(r.id)}
          loading={tagsLoading}
          className="tags-setting-table"
          pagination={{
            current: page,
            pageSize,
            total: tags?.total ?? 0,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
          }}
          scroll={{ x: 'max-content' }}
        />
      </div>

      <EditTagsModal
        open={editTagsModalOpen}
        tag={editTag}
        onCancel={() => {
          setEditTagsModalOpen(false)
          setEditTag(null)
        }}
        onSuccess={() => refetchTags()}
      />
    </div>
  )
}
