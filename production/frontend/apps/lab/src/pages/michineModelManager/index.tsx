import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Tabs, message } from 'antd'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ModelListTable from './components/ModelListTable'
import PageHeader from './components/PageHeader'
import { mlModelService } from '@/services/mlModelService'
import type { MlModelSummary } from '@/types/mlModel'

const MachineModelManagerPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { projectId } = useParams<{ projectId: string }>()
  const numericProjectId = Number(projectId)
  const [keyword, setKeyword] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data, isLoading } = useQuery({
    queryKey: ['ml-models', numericProjectId, currentPage, pageSize, keyword],
    queryFn: () => mlModelService.listByProject(numericProjectId, {
      name: keyword || undefined,
      page: currentPage,
      size: pageSize,
    }),
    enabled: Number.isFinite(numericProjectId),
  })

  const deleteMutation = useMutation({
    mutationFn: (record: MlModelSummary) => mlModelService.deleteModel(numericProjectId, record.model_name),
    onSuccess: async () => {
      message.success('删除成功')
      await queryClient.invalidateQueries({ queryKey: ['ml-models', numericProjectId] })
    },
  })

  return (
    <div className="machine-model-manager-container lab-list-page-shell">
      <PageHeader title="模型管理" />

      <Card bordered={false} bodyStyle={{ padding: 0 }}>
        <Tabs
          defaultActiveKey="mine"
          items={[{ key: 'mine', label: '我的模型' }]}
          tabBarExtraContent={(
            <div className="flex items-center gap-3">
              <Input
                allowClear
                prefix={<SearchOutlined className="text-[#bfbfbf]" />}
                placeholder="按名称搜索"
                className="w-[240px]"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value)
                  setCurrentPage(1)
                }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate(`/project/${projectId}/michine-model-manager/create`)}
              >
                创建模型
              </Button>
            </div>
          )}
        />

        <ModelListTable
          current={currentPage}
          dataSource={data?.items ?? []}
          loading={isLoading || deleteMutation.isPending}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onDelete={(record) => deleteMutation.mutate(record)}
          onPageChange={(page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }}
        />
      </Card>
    </div>
  )
}

export default MachineModelManagerPage
