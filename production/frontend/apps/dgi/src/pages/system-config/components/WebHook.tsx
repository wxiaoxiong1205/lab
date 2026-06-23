import { useState } from 'react'
import type { TablePaginationConfig } from 'antd'
import { Button, Input, Modal, Select, Space, Table, Tooltip, message } from 'antd'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import WebHookModal from './WebHookModal'
import type { WebHookItem } from './types'
import {
  apiCreateWebhookList,
  apiDeleteWebhook,
  apiGetWebhookDetail,
  apiGetWebhookList,
  apiGetWebhookTypeList,
  apiTestWebhook,
  apiUpdateWebhook,
} from '@/services/api'
import { $t } from '@/locales'

const WebHook = () => {
  const [searchText, setSearchText] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  const [editingWebHook, setEditingWebHook] = useState<WebHookItem | undefined>()
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
    showTotal: (total) => `总共 ${total} 条`,
  })

  const { data: webhookTypes = { data: [] } } = useRequest<{ data: { value: string, label: string }[] }, []>(apiGetWebhookTypeList, {
    onError: (err) => {
      message.error('获取 Webhook 类型失败')
    },
  })

  const { data: webhookList = { data: { items: [], total: 0 } }, loading, refresh } = useRequest<{ data: { items: WebHookItem[], total: number } }, []>(() => apiGetWebhookList({
    page: pagination.current || 1,
    page_size: pagination.pageSize || 10,
    name: searchText,
    type: typeFilter,
  }), {
    refreshDeps: [searchText, typeFilter, pagination.current, pagination.pageSize],
    onSuccess: (res) => {
      setPagination({
        ...pagination,
        total: res.data.total,
      })
    },
  })

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
    },
    {
      title: $t('Webhook名称'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: $t('Webhook地址'),
      dataIndex: 'url',
      key: 'url',
      ellipsis: {
        showTitle: false,
      },
      render: (url: string) => (
        <Tooltip placement="topLeft" title={url}>
          <span>{url}</span>
        </Tooltip>
      ),
    },
    {
      title: $t('Webhook类型'),
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeItem = webhookTypes?.data?.find((item: any) => item.value === type)
        return typeItem?.label || type
      },
    },
    {
      title: $t('加密方式'),
      dataIndex: 'encrypt_method',
      key: 'encrypt_method',
      render: (method: string) => ({
        none: '无',
        signature: '签名密钥',
      }[method] || method),
    },
    {
      title: $t('修改时间'),
      dataIndex: 'updated_time',
      key: 'updated_time',
      render: (text: number) => dayjs(text * 1000).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: $t('创建人'),
      dataIndex: 'creator',
      key: 'creator',
    },
    {
      title: $t('操作'),
      key: 'action',
      render: (_: unknown, record: WebHookItem) => (
        <Space size="middle">
          <a className="text-blue-600" onClick={() => handleTest(record)}>
            {$t('测试')}
          </a>
          <a className="text-blue-600" onClick={() => handleEdit(record)}>
            {$t('编辑')}
          </a>
          <a className="text-blue-600" onClick={() => handleDelete(record)}>
            {$t('删除')}
          </a>
        </Space>
      ),
    },
  ]

  const handleTest = async (record: WebHookItem) => {
    try {
      await apiTestWebhook(record.id)
      message.success($t('测试成功'))
    }
    catch (error) {
      // message.error($t('测试失败'))
    }
  }
  const handleDelete = async (record: WebHookItem) => {
    Modal.confirm({
      title: $t('确认删除'),
      content: `${$t('确定要删除 {name} 吗？', { name: record.name })}`,
      okText: $t('确认'),
      cancelText: $t('取消'),
      onOk: async () => {
        try {
          await apiDeleteWebhook(record.id)
          message.success($t('删除成功'))
          refresh()
        }
        catch (error) {
          // message.error($t('删除失败'))
        }
      },
    })
  }

  const handleCreate = () => {
    setEditingWebHook(undefined)
    setModalVisible(true)
  }

  const handleEdit = async (record: WebHookItem) => {
    try {
      const res = await apiGetWebhookDetail(record.id)
      setEditingWebHook(res.data)
      setModalVisible(true)
    }
    catch (error) {
      message.error($t('获取Webhook详情失败'))
    }
  }

  const handleModalClose = () => {
    setModalVisible(false)
    setEditingWebHook(undefined)
  }

  const handleSubmit = async (values: { name: string, url: string, type: string, encrypt_method: string, secret?: string, description?: string }) => {
    try {
      if (editingWebHook) {
        // 编辑模式
        await apiUpdateWebhook(editingWebHook.id, values)
        message.success($t('编辑成功'))
      }
      else {
        // 创建模式
        await apiCreateWebhookList({
          ...values,
          description: values.description, // 将 desc 转换为 description
        })
        message.success($t('创建成功'))
      }
      handleModalClose()
      refresh()
    }
    catch (error) {
      // message.error(editingWebHook ? $t('编辑失败') : $t('创建失败'));
    }
  }

  const tableData = webhookList?.data?.items || []

  return (
    <div className="bg-white min-h-full rounded-lg p-4">
      <div className="flex gap-4 mb-6">
        <Input
          placeholder={$t('请输入Webhook名称')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          prefix={<SearchOutlined className="text-gray-400" />}
          className="!w-[180px]"
        />
        <Select
          placeholder={$t('Webhook类型')}
          className="!w-[180px]"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: '', label: $t('全部') },
            ...(webhookTypes?.data || []).map((type: any) => ({
              value: type.value,
              label: type.label,
            })),
          ]}
        />
        <div className="flex-1" />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          className="bg-[#40A9FF]"
          onClick={() => handleCreate()}
        >
          {$t('新建Webhook')}
        </Button>
      </div>

      {/* 表格区域 */}
      <Table
        columns={columns}
        dataSource={webhookList?.data?.items}
        rowKey="id"
        loading={loading}
        pagination={pagination}
        scroll={{ y: 'calc(100vh - 340px)', x: 1200 }}
        onChange={(pagination) => {
          setPagination(pagination)
        }}
      />

      {/* WebHook弹窗 */}
      <WebHookModal
        open={modalVisible}
        editingWebHook={editingWebHook}
        typeList={[
          ...(webhookTypes?.data || []).map((type: any) => ({
            value: type.value,
            label: type.label,
          })),
        ]}
        onClose={handleModalClose}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

export default WebHook
