import { Card, Col, Row, Skeleton, Space, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import type { EvaluationType } from '@/types/ReportDetailTypes.ts'
import type { DatasetModelRelation, ProjectEvaluationTaskDetail } from '@/services/modelEvaluationServices'

const { Title, Text } = Typography

interface ReportBasicInfoCardProps {
  loading: boolean
  evaluationType: EvaluationType
  taskDetail: ProjectEvaluationTaskDetail | null
  formatArrayToString: (arr?: string[]) => string
  formatEvaluationType: (type?: string) => string
  formatEvaluationMethod: (method?: string) => string
}

function DescriptionText({ value }: { value?: string }) {
  if (!value) {
    return <Text>-</Text>
  }

  return (
    <Tooltip
      title={(
        <div className="!max-h-50 overflow-auto max-w-[320px] break-words">
          {value}
        </div>
      )}
    >
      <Text className="max-w-[400px] inline-block overflow-hidden text-ellipsis whitespace-nowrap">
        {value}
      </Text>
    </Tooltip>
  )
}

export default function ReportBasicInfoCard({
  loading,
  evaluationType,
  taskDetail,
  formatArrayToString,
  formatEvaluationType,
  formatEvaluationMethod,
}: ReportBasicInfoCardProps) {
  return (
    <Card className="mb-4 min-h-[200px]">
      <Title level={5} className="mb-4">基本信息</Title>
      {loading ? (
        <Skeleton active paragraph={{ rows: 9 }} />
      ) : evaluationType === 'benchmark' ? (
        <Row gutter={[24, 16]}>
          <Col span={8}>
            <Space size={0}>
              <Text type="secondary">任务名称：</Text>
              <Text>{taskDetail?.name || '-'}</Text>
            </Space>
          </Col>
          <Col span={8}>
            <Space size={0}>
              <Text type="secondary">创建人：</Text>
              <Text>{taskDetail?.created_by || '-'}</Text>
            </Space>
          </Col>
          <Col span={8}>
            <div className="flex items-start gap-0">
              <Text type="secondary" className="flex-shrink-0">待评估模型服务：</Text>
              <Text>
                {(taskDetail as any)?.models?.map((m: any) => `${m.model_name}${m.model_version ? `-${m.model_version}` : ''}`).join('、') || '-'}
              </Text>
            </div>
          </Col>
          <Col span={8}>
            <Space size={0}>
              <Text type="secondary">创建时间：</Text>
              <Text>
                {taskDetail?.created_at
                  ? dayjs(taskDetail.created_at).format('YYYY-MM-DD HH:mm:ss')
                  : '-'}
              </Text>
            </Space>
          </Col>
          <Col span={8}>
            <div className="flex items-start gap-0">
              <Text type="secondary" className="flex-shrink-0">基准评估数据集：</Text>
              <Text>
                {(taskDetail as any)?.datasets?.map((d: any) => d.dataset_name).join('、') || '-'}
              </Text>
            </div>
          </Col>
          <Col span={8}>
            <div className="flex items-start gap-0">
              <Text type="secondary" className="flex-shrink-0">描述：</Text>
              <DescriptionText value={taskDetail?.description} />
            </div>
          </Col>
        </Row>
      ) : (
        <Row gutter={[24, 16]}>
          <Col span={8}>
            <Space size={0}>
              <Text type="secondary">任务名称：</Text>
              <Text>{taskDetail?.name || '-'}</Text>
            </Space>
          </Col>
          <Col span={8}>
            <div className="flex items-start gap-0">
              <Text type="secondary" className="flex-shrink-0">待评估模型服务：</Text>
              <Text>
                {formatArrayToString(
                  taskDetail?.dataset_model_relations
                    ?.map((r) => Object.prototype.hasOwnProperty.call(r, 'evaluated_model_name') ? r.evaluated_model_name : null)
                    .filter((n): n is string => n !== null && n !== undefined && n !== ''),
                ) || '-'}
              </Text>
            </div>
          </Col>
          <Col span={8}>
            <div className="flex items-start gap-0">
              <Text type="secondary" className="flex-shrink-0">推理结果集：</Text>
              <Text>
                {formatArrayToString(
                  taskDetail?.dataset_model_relations
                    ?.map((r) => {
                      const obj = r as DatasetModelRelation & { inference_result_dataset_name?: string }
                      return obj.inference_result_dataset_name
                    })
                    .filter((n): n is string => typeof n === 'string' && n !== ''),
                ) || '-'}
              </Text>
              {evaluationType === 'manual' && (
                <Tag color="green" className="ml-2">
                  采样率：
                  {taskDetail?.sampling_rate != null ? `${taskDetail.sampling_rate}%` : '-'}
                </Tag>
              )}
            </div>
          </Col>
          <Col span={8}>
            <Space size={0}>
              <Text type="secondary">评估类型：</Text>
              <Text>{formatEvaluationType(taskDetail?.evaluation_type)}</Text>
            </Space>
          </Col>
          <Col span={8}>
            <Space size={0}>
              <Text type="secondary">评估类别：</Text>
              <Text>
                {taskDetail?.dataset_type === 'image-generation'
                  ? '图像生成'
                  : ['text-generation', 'business'].includes(taskDetail?.dataset_type || '')
                    ? '文本生成'
                    : '图像理解'}
              </Text>
            </Space>
          </Col>
          <Col span={8}>
            <Space size={0}>
              <Text type="secondary">评估方法：</Text>
              <Text>{formatEvaluationMethod(taskDetail?.evaluation_method)}</Text>
            </Space>
          </Col>
          {(taskDetail?.evaluation_method === 'referee' || taskDetail?.evaluation_method === 'all') && (
            <Col span={8}>
              <Space size={0}>
                <Text type="secondary">裁判员模型服务：</Text>
                <Text>
                  {taskDetail?.referee_model_id
                    ? `${taskDetail.referee_model_name ? ` ${taskDetail.referee_model_name}` : ''}/${taskDetail.referee_type === 'model' ? '离线' : '在线'}`
                    : '-'}
                </Text>
              </Space>
            </Col>
          )}
          <Col span={8}>
            <Space size={0}>
              <Text type="secondary">创建人：</Text>
              <Text>{taskDetail?.created_by || '-'}</Text>
            </Space>
          </Col>
          <Col span={8}>
            <Space size={0}>
              <Text type="secondary">创建时间：</Text>
              <Text>
                {taskDetail?.created_at
                  ? dayjs(taskDetail.created_at).format('YYYY-MM-DD HH:mm:ss')
                  : '-'}
              </Text>
            </Space>
          </Col>
          <Col span={8}>
            <div className="flex items-start gap-0">
              <Text type="secondary" className="flex-shrink-0">描述：</Text>
              <DescriptionText value={taskDetail?.description} />
            </div>
          </Col>
        </Row>
      )}
    </Card>
  )
}
