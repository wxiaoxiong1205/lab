import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Empty, Input, Modal, Pagination, Spin, Tooltip, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { NotebookSquareSearchParams } from '@/types'
import { notebookService } from '@/services/notebookService'
import { calculatePageAfterDelete } from '@/utils/paginationUtils'
import { useNotebookBasePath } from '@/hooks/getProjectPath'

const { Search } = Input
const FAST_POLL_LIMIT = 3
const FAST_POLL_INTERVAL = 3000
const SLOW_POLL_INTERVAL = 60000
// notebook卡片
function NotebookCard(params: {
  title: string
  description: string
  isAvailable: boolean
  detail?: () => void
  copy?: () => void
  deleteFn?: () => void
}) {
  const { title, description, isAvailable, detail, copy, deleteFn } = params
  return (
    <Card>
      <div className="relative">
        <div className="flex items-center justify-between w-full">
          <Tooltip title={title}>
            <div className="text-lg font-bold line-clamp-1">{title}</div>
          </Tooltip>

          <Button type="text" danger icon={<span className="anticon"><DeleteOutlined /></span>} onClick={deleteFn} />
        </div>
        <div className="text-sm text-gray-500 mb-4 line-clamp-3 h-[3.75rem] overflow-ellipsis">{description}</div>
        <div className="flex items-center gap-2">
          <Button type="primary" ghost disabled={!isAvailable} onClick={detail}>
            查看详情
          </Button>
          <Button type="primary" disabled={!isAvailable} onClick={copy}>
            复制案例
          </Button>
        </div>
      </div>
    </Card>
  )
}
export default function NotebookSquare() {
  const [loading, setLoading] = useState(false)
  const pollingCountRef = useRef(0)
  const navigate = useNavigate()
  const { notebookBasePath } = useNotebookBasePath()
  const [searchParams, setSearchParams] = useState<NotebookSquareSearchParams>({
    page: 1,
    size: 10,
    name: '',
    biz_type: notebookBasePath.includes('machine-notebook') ? 'machine_learning' : 'llm',
  })
  const { data: list, isFetching, isLoading, refetch: refetchNotebookSquareList } = useQuery({
    queryKey: ['notebookSquareList', searchParams],
    queryFn: () => notebookService.getNotebookSquareList(searchParams),
    staleTime: 0,
    gcTime: 0,
  })
  useEffect(() => {
    pollingCountRef.current = 0
  }, [searchParams])
  useEffect(() => {
    const hasUnavailableCase = list?.items.some((item) => !item.is_available)
    if (!hasUnavailableCase) {
      pollingCountRef.current = 0
      return undefined
    }
    if (isFetching) {
      return undefined
    }
    const interval = pollingCountRef.current < FAST_POLL_LIMIT ? FAST_POLL_INTERVAL : SLOW_POLL_INTERVAL
    const timer = window.setTimeout(() => {
      pollingCountRef.current += 1
      refetchNotebookSquareList()
    }, interval)
    return () => {
      window.clearTimeout(timer)
    }
  }, [isFetching, list?.items, refetchNotebookSquareList])
  const handleSearch = (value: string) => {
    setSearchParams({ ...searchParams, name: value, page: 1 })
    refetchNotebookSquareList()
  }
  const handleRefresh = () => {
    refetchNotebookSquareList()
  }
  const handleViewDetail = (id: string) => {
    navigate(`${notebookBasePath}/case/${id}`)
  }
  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该案例吗？',
      okText: '确认删除',
      cancelText: '取消',
      onOk: () => {
        setLoading(true)
        notebookService.deleteCase(id).then(() => {
          const targetPage = calculatePageAfterDelete(searchParams.page, searchParams.size, list?.total, 1)
          if (targetPage !== searchParams.page) {
            setSearchParams((prev) => ({
              ...prev,
              page: targetPage,
            }))
          }
          refetchNotebookSquareList().then(() => {
            message.success('删除成功')
          }).catch((err) => {
            console.error(err)
          })
        }).finally(() => {
          setLoading(false)
        })
      },
    })
  }
  const handleCopy = (id: string) => {
    navigate(`${notebookBasePath}/create?source_example_id=${id}`)
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Search className="w-[200px]" placeholder="搜索名称" onSearch={handleSearch} allowClear />
        <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
          刷新
        </Button>
      </div>

      {loading || isLoading
        ? (
            <div className="flex justify-center items-center h-80">
              <Spin />
            </div>
          )
        : list?.items.length > 0
          ? (
              <div className="grid grid-cols-3 gap-4 mb-4">
                {list?.items.map((item) => (<NotebookCard key={item.id} title={item.name} description={item.describe} isAvailable={item.is_available} detail={() => handleViewDetail(item.id.toString())} deleteFn={() => handleDelete(item.id.toString())} copy={() => handleCopy(item.id.toString())} />))}
              </div>
            )
          : (
              <div className="flex justify-center items-center h-80">
                <Empty description="暂无数据" />
              </div>
            )}

      <div className="flex justify-end pb-8">
        <Pagination
          current={searchParams.page}
          pageSize={searchParams.size}
          total={list?.total}
          onChange={(page, pageSize) => {
            setSearchParams({ ...searchParams, page, size: pageSize })
            refetchNotebookSquareList()
          }}
          showSizeChanger
          showTotal={(total) => `共 ${total} 条`}
          pageSizeOptions={[10, 20, 30, 40, 50]}
        />
      </div>

    </div>
  )
}
