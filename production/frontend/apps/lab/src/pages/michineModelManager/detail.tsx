import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Descriptions, Empty, Typography, message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import VersionTable from './components/VersionTable'
import { getMlModelTypeHierarchyLabel } from './data'
import { mlModelService } from '@/services/mlModelService'
import type { MlModelVersion } from '@/types/mlModel'

const MachineModelManagerDetailPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { projectId, modelId } = useParams<{ projectId: string, modelId: string }>()
  const numericProjectId = Number(projectId)
  const modelName = decodeURIComponent(modelId ?? '')

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['ml-model-versions', numericProjectId, modelName],
    queryFn: () => mlModelService.getVersions(numericProjectId, modelName),
    enabled: Number.isFinite(numericProjectId) && !!modelName,
    refetchOnMount: 'always',
  })

  const deleteMutation = useMutation({
    mutationFn: (record: MlModelVersion) => mlModelService.deleteModel(
      numericProjectId,
      modelName,
      record.model_version,
    ),
    onSuccess: async (_, record) => {
      message.success(`版本 ${record.model_version} 删除成功`)
      await queryClient.invalidateQueries({ queryKey: ['ml-model-versions', numericProjectId, modelName] })
      await queryClient.invalidateQueries({ queryKey: ['ml-models', numericProjectId] })
    },
  })

  const latestVersion = versions[0]

  return (
    <Card className="m-6 min-h-full">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        返回
      </Button>

      <Card className="!mb-4">
        <Typography.Title level={5} className="!text-[#262626] !mb-4">
          模型信息
        </Typography.Title>
        <Descriptions column={1} labelStyle={{ width: 100 }}>
          <Descriptions.Item label="模型名称">{latestVersion?.name ?? modelName}</Descriptions.Item>
          <Descriptions.Item label="模型类型">
            {latestVersion
              ? getMlModelTypeHierarchyLabel(latestVersion.model_type, latestVersion.task_type)
              : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <Typography.Title level={5} className="!text-[#262626] !mb-0">
            模型版本
          </Typography.Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate(`/project/${projectId}/michine-model-manager/${encodeURIComponent(modelName)}/create-version`)}
          >
            新增版本
          </Button>
        </div>
        {versions.length > 0 || isLoading
          ? (
              <VersionTable
                dataSource={versions}
                loading={isLoading || deleteMutation.isPending}
                onDelete={(record) => deleteMutation.mutate(record)}
                onEdit={(record) => {
                  navigate(
                    `/project/${projectId}/michine-model-manager/${encodeURIComponent(modelName)}/create-version?versionId=${record.id}`,
                  )
                }}
              />
            )
          : <Empty description="暂无版本数据" />}
      </Card>
    </Card>
  )
}

export default MachineModelManagerDetailPage
