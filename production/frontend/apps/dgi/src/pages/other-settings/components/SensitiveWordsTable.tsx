import { useState } from 'react'
import { Button, Input, Popconfirm, Space, Table, message } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import {
  DeleteOutlined,
  ExperimentOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import SensitiveWordModal from './SensitiveWordModal'
import ImportModal from './ImportModal'
import CategoryTree from './CategoryTree'
import SecurityTestModal from './SecurityTestModal'
import { useTransform } from '@/locales'
import { apiGetSecurityServer, apiSensitiveWordDelete, apiSensitiveWordList } from '@/services/api'

interface SensitiveWordItem {
  parent_category: string
  word_id: string
  original_word: string
  creator: string
  updated_at: string
  category: string
  enhance: boolean
  category_id: number
}

export default function SensitiveWordsTable() {
  const { $t } = useTransform()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchWord, setSearchWord] = useState('')
  const [searchCreator, setSearchCreator] = useState('')
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [categoryStatistics, setCategoryStatistics] = useState<any>(null)
  // 预留弹窗状态
  const [modalType, setModalType] = useState<'add' | 'edit' | null>(null)
  const [editData, setEditData] = useState<SensitiveWordItem | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  // 效果测试弹窗状态
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [securityServerUrl, setSecurityServerUrl] = useState('')
  const [securityServerKey, setSecurityServerKey] = useState('')
  // 获取配置
  const {
    data: config,
    loading: configLoading,
    run: getConfig,
  } = useRequest(apiGetSecurityServer, {
    manual: true,
    onSuccess: (res) => {
      setSecurityServerUrl(res.data?.security_server || '')
      setSecurityServerKey(res.data?.security_server_key || '')
    },
  })

  // 获取敏感词列表
  const {
    data: tableData = [],
    loading,
    refresh,
  } = useRequest(
    () =>
      apiSensitiveWordList({
        page_number: pagination.current,
        page_size: pagination.pageSize,
        original_word: searchWord || undefined,
        creator: searchCreator || undefined,
        category_id: selectedCategory || undefined,
      }).then((res) => {
        setPagination((p) => ({
          ...p,
          total: res?.data?.total || 0,
          showTotal: (total) => $t('总共 {total} 条', { total }),
        }))
        // 保存分类统计数据
        setCategoryStatistics(res.data.categoryStatistics || null)
        return res.data.items || []
      }),
    {
      refreshDeps: [
        pagination.current,
        pagination.pageSize,
        searchWord,
        searchCreator,
        selectedCategory,
      ],
      debounceWait: 300,
    },
  )

  // 删除敏感词（单条/批量）
  const { run: deleteWords, loading: deleteLoading } = useRequest(
    async (ids: string[]) => {
      await apiSensitiveWordDelete({ word_ids: ids })
      message.success($t('删除成功'))
      setSelectedRowKeys([])
      if (tableData.length === ids.length && pagination.current! > 1) {
        setPagination((p) => ({ ...p, current: p.current! - 1 }))
      }
      else {
        refresh()
      }
    },
    { manual: true },
  )

  const columns: ColumnsType<SensitiveWordItem> = [
    { title: $t('敏感词'), dataIndex: 'original_word', key: 'original_word' },
    {
      title: $t('敏感词分类'), dataIndex: 'original_word', key: 'original_word', render: (_, record) => {
        return (
          <div>
            <span>{`${record?.parent_category}-${record?.category}`}</span>
          </div>
        )
      },
    },
    { title: $t('创建人'), dataIndex: 'creator', key: 'creator' },
    {
      title: $t('修改时间'),
      dataIndex: 'modified_at',
      key: 'modified_at',
      render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: $t('操作'),
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setModalType('edit')
              setEditData(record)
            }}
          >
            {$t('编辑')}
          </Button>
          <Popconfirm
            title={$t('确定要删除吗？')}
            onConfirm={() => deleteWords([record.word_id])}
            okButtonProps={{ loading: deleteLoading }}
            okText={$t('确定')}
            cancelText={$t('取消')}
          >
            <Button type="link" size="small" danger>
              {$t('删除')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 打开效果测试弹窗
  const handleOpenTestModal = () => {
    setTestModalOpen(true)
  }

  return (
    <div className="flex">
      <div className="flex-shrink-0">
        <CategoryTree
          onSelect={(nodes) => {
            setSelectedCategory(nodes[0] === -1 ? null : (nodes[0] as number))
            setPagination((p) => ({ ...p, current: 1 }))
          }}
          categoryStatistics={categoryStatistics}
        />
      </div>
      <div className="flex-1 pl-6">
        {/* 搜索区 */}
        <div className="flex flex-wrap gap-2 mb-4 justify-between">
          <Space>
            <Input
              placeholder={$t('敏感词')}
              value={searchWord}
              onChange={(e) => {
                setSearchWord(e.target.value)
                setPagination((p) => ({ ...p, current: 1 }))
              }}
              className="!w-[240px]"
              allowClear
            />
            <Input
              placeholder={$t('创建人')}
              value={searchCreator}
              onChange={(e) => {
                setSearchCreator(e.target.value)
                setPagination((p) => ({ ...p, current: 1 }))
              }}
              className="!w-[240px]"
              allowClear
            />
          </Space>
          <div>
            <Space>
              {selectedRowKeys.length > 0 && (
                <Popconfirm
                  title={$t('确定要删除吗？')}
                  onConfirm={() => deleteWords(selectedRowKeys as string[])}
                  okButtonProps={{ loading: deleteLoading }}
                >
                  <Button
                    icon={<DeleteOutlined />}
                    danger
                    loading={deleteLoading}
                  >
                    {$t('批量删除')}
                  </Button>
                </Popconfirm>
              )}
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setModalType('add')
                  setEditData(null)
                }}
              >
                {$t('新增敏感词')}
              </Button>
              <Button
                icon={<UploadOutlined />}
                onClick={() => setImportModalOpen(true)}
              >
                {$t('批量导入')}
              </Button>
              <Button
                icon={<ExperimentOutlined />}
                onClick={handleOpenTestModal}
              >
                {$t('效果测试')}
              </Button>
            </Space>
          </div>
        </div>
        {/* 表格 */}
        <Table
          rowKey="word_id"
          columns={columns}
          dataSource={tableData}
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            ...pagination,
            showTotal: (total) => $t('总共 {total} 条', { total }),
          }}
          onChange={setPagination}
        />
      </div>
      <SensitiveWordModal
        open={!!modalType}
        initialData={editData}
        onCancel={() => setModalType(null)}
        onSuccess={refresh}
      />
      <ImportModal
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        onSuccess={refresh}
      />

      <SecurityTestModal
        open={testModalOpen}
        onCancel={() => setTestModalOpen(false)}
        serverUrl={securityServerUrl}
        apiKey={securityServerKey}
      />
    </div>
  )
}
