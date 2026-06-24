import { useState } from 'react'
import {
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  message,
} from 'antd'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import type { TablePaginationConfig, TableProps } from 'antd'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import AddPluginModal from './AddPluginModal'
import { useTransform } from '@/locales'
import { apiPluginDelete, apiPluginList } from '@/services/api'

interface PluginItem {
  id: number
  name: string
  description: string
  creator: string
  created_time: number
  plugin_type?: string
}

enum PLUGIN_TYPE {
  BUILTIN = '内置',
  CUSTOM = '自定义',
}

export default function PluginManager() {
  const [searchText, setSearchText] = useState('')
  const [pluginType, setPluginType] = useState<string | undefined>(undefined)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'add' | 'edit'>('add')
  const [editingPlugin, setEditingPlugin] = useState<PluginItem>()
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const { $t } = useTransform()

  // 调用真实的插件列表 API
  const {
    data = [],
    loading,
    run: getList,
  } = useRequest(
    async () => {
      const res = await apiPluginList({
        page: pagination.current,
        page_size: pagination.pageSize,
        name: searchText,
        plugin_type: pluginType || undefined,
      })

      setPagination({
        ...pagination,
        current: res.data.pageNumber || pagination.current,
        pageSize: res.data.pageSize || pagination.pageSize,
        total: res.data.total || 0,
        showTotal: (total) => $t('总共 {total} 条', { total }),
      })

      return res.data.items || []
    },
    {
      refreshDeps: [searchText, pagination.current, pagination.pageSize, pluginType],
      debounceWait: 300,
    },
  )

  const columns: TableProps<PluginItem>['columns'] = [
    {
      title: $t('插件名称'),
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: '插件类型',
      dataIndex: 'plugin_type',
      key: 'plugin_type',
      width: 120,
      render: (text) => {
        if (text === PLUGIN_TYPE.BUILTIN) return '内置'
        if (text === PLUGIN_TYPE.CUSTOM) return '自定义'
        return text || '-'
      },
    },
    {
      title: $t('说明'),
      dataIndex: 'description',
      key: 'description',
      width: 250,
    },
    {
      title: $t('创建人'),
      dataIndex: 'creator',
      key: 'creator',
      width: 120,
    },
    {
      title: $t('创建时间'),
      dataIndex: 'created_time',
      key: 'created_time',
      width: 180,
      render: (text) => dayjs(text * 1000).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: $t('操作'),
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => {
        // 只有自定义插件才显示操作按钮
        if (record.plugin_type !== PLUGIN_TYPE.CUSTOM) {
          return null
        }

        return (
          <Space size="middle">
            <a
              className="text-blue-600"
              onClick={() => {
                setModalType('edit')
                setEditingPlugin(record)
                setModalOpen(true)
              }}
            >
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
        )
      },
    },
  ]

  const handleDelete = async (id: number) => {
    try {
      await apiPluginDelete(id)
      message.success($t('删除成功'))
      getList()
    }
    catch (error) {
      message.error($t('删除失败'))
    }
  }

  return (
    <div className="bg-white min-h-full rounded-lg">
      <div className="mb-6">
        <div className="flex gap-4">
          <Input
            placeholder={$t('请输入插件名称')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="!w-[180px]"
          />
          <Select
            placeholder="插件类型"
            className="w-40"
            value={pluginType}
            onChange={setPluginType}
            allowClear
          >
            <Select.Option value="">{$t('全部')}</Select.Option>
            <Select.Option value={PLUGIN_TYPE.BUILTIN}>内置</Select.Option>
            <Select.Option value={PLUGIN_TYPE.CUSTOM}>自定义</Select.Option>
          </Select>
          <div className="flex-1" />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            className="bg-[#40A9FF]"
            onClick={() => {
              setModalType('add')
              setEditingPlugin(undefined)
              setModalOpen(true)
            }}
          >
            {$t('新增插件')}
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

      <AddPluginModal
        type={modalType}
        open={modalOpen}
        initialData={editingPlugin}
        onCancel={() => {
          setModalOpen(false)
          setEditingPlugin(undefined)
        }}
        onSuccess={() => {
          setModalOpen(false)
          setEditingPlugin(undefined)
          getList()
        }}
      />
    </div>
  )
}
