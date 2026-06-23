import type { DescriptionsProps } from 'antd'
import { Alert, Button, Card, Descriptions, Skeleton, Tabs, Tag, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import React from 'react'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { machineAnnotationService } from '@/services/machineAnnotation.ts'
import type { MachineAnnotationItem } from '@/types/machineLearing/machineAnnotationModel.ts'
import {
  ANNOTATION_TYPE_LABEL_MAP,
  DATASET_CATEGORY_MAP,
  TEMPLATE_TYPE_IMAGE_CLASSIFICATION,
  TEMPLATE_TYPE_IMAGE_SEGMENTATION,
  TEMPLATE_TYPE_OBJECT_DETECTION,
  TEMPLATE_TYPE_TEXT_CLASSIFICATION,
  TEMPLATE_TYPE_TEXT_ENTITY_RECOGNITION,
} from '@/services/machineLearnModel.ts'

const statusRenderMap: Record<string, React.ReactNode> = {
  running: <Tag color="green">运行中</Tag>,
  stopped: <Tag color="default">已停止</Tag>,
  error: <Tag color="red">异常</Tag>,
  未测试: <Tag color="blue">未测试</Tag>,
  测试通过: <Tag color="green">测试通过</Tag>,
  测试失败: <Tag color="red">测试失败</Tag>,
}

function renderConnectionStatus(status: string) {
  return statusRenderMap[status] ?? <Tag>{status || '-'}</Tag>
}

const MachineAnnotationDetails: React.FC = () => {
  const navigate = useNavigate()
  const { datasetId } = useParams<{ datasetId: string }>()
  const { projectId } = useParams<{ projectId: string }>()
  const [descriptionList, setDescription] = useState<DescriptionsProps['items']>()

  const templateLabelByValue = useMemo(() => {
    const rows = [
      ...TEMPLATE_TYPE_IMAGE_CLASSIFICATION,
      ...TEMPLATE_TYPE_OBJECT_DETECTION,
      ...TEMPLATE_TYPE_IMAGE_SEGMENTATION,
      ...TEMPLATE_TYPE_TEXT_CLASSIFICATION,
      ...TEMPLATE_TYPE_TEXT_ENTITY_RECOGNITION,
    ]
    return Object.fromEntries(rows.map((r) => [r.value, r.label])) as Record<string, string>
  }, [])

  const { data: serviceDetail, isLoading, error } = useQuery<MachineAnnotationItem>({
    queryKey: ['machine-annotation-detail', projectId, datasetId],
    staleTime: 0,
    queryFn: async () => {
      if (!datasetId || !projectId) {
        throw new Error('服务 ID 不存在')
      }
      const data = await machineAnnotationService.getDetail(Number(projectId), Number(datasetId))
      return data
    },
    enabled: !!projectId && !!datasetId,
  })

  useEffect(() => {
    if (serviceDetail) {
      const items: DescriptionsProps['items'] = [
        {
          key: 'name',
          label: '服务名称',
          children: serviceDetail.name || '-',
        },
        {
          key: 'description',
          label: '服务描述',
          children: (
            <Tooltip
              title={(
                <div className="!max-h-50 overflow-auto max-w-[320px] break-words">
                  {serviceDetail.description || undefined}
                </div>
              )}
            >
              <span className="max-w-[500px] inline-block truncate align-bottom">
                {serviceDetail.description || '-'}
              </span>
            </Tooltip>
          ),
        },
        {
          key: 'base_url',
          label: 'Base URL',
          children: (
            <Tooltip title={serviceDetail.base_url || undefined}>
              <span className="max-w-[500px] inline-block truncate align-bottom">
                {serviceDetail.base_url || '-'}
              </span>
            </Tooltip>
          ),
        },
        {
          key: 'data_type',
          label: '数据类型',
          children: DATASET_CATEGORY_MAP[serviceDetail.data_type] ?? serviceDetail.data_type ?? '-',
        },
        {
          key: 'annotation_type',
          label: '标注类型',
          children: ANNOTATION_TYPE_LABEL_MAP[serviceDetail.annotation_type] ?? serviceDetail.annotation_type ?? '-',
        },
        {
          key: 'template_type',
          label: '标注模板',
          children: templateLabelByValue[serviceDetail.template_type] ?? serviceDetail.template_type ?? '-',
        },
        // {
        //   key: 'category',
        //   label: '分类',
        //   children: serviceDetail.category || '-',
        // },
        {
          key: 'status',
          label: '连接状态',
          children: renderConnectionStatus(serviceDetail.status),
        },
        {
          key: 'created_by',
          label: '创建人',
          children: serviceDetail.created_by || '-',
        },
        {
          key: 'created_at',
          label: '创建时间',
          children: serviceDetail.created_at
            ? dayjs(serviceDetail.created_at).format('YYYY/MM/DD HH:mm:ss')
            : '-',
        },
      ]
      setDescription(items)
    }
  }, [serviceDetail, templateLabelByValue])

  const tabs = [
    {
      key: 'basic',
      label: '基本信息',
    },
  ]
  const [activeTab] = useState(tabs[0]?.key || 'basic')

  const handleBack = () => {
    navigate(`/project/${projectId}/machine-online-annotation-service`)
  }

  const basicView = () => {
    return (
      <Descriptions className="!pl-1 !pt-4" column={1} items={descriptionList} />
    )
  }

  if (error) {
    return (
      <div className="machine-online-annotation-detail-container lab-list-page-shell">
        <Card>
          <div className="mb-4">
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>
              返回
            </Button>
          </div>
          <Alert
            message="获取服务详情失败"
            description="请稍后重试或联系管理员"
            type="error"
            showIcon
            action={<Button type="primary" onClick={() => window.location.reload()}>刷新</Button>}
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="machine-online-annotation-detail-container lab-list-page-shell">
      <Card>
        <div className="mb-4">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回
          </Button>
        </div>
        <Tabs
          activeKey={activeTab}
          items={tabs}
        />

        {isLoading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : (
          serviceDetail && (
            activeTab === 'basic' ? basicView() : null
          )
        )}
      </Card>
    </div>
  )
}

export default MachineAnnotationDetails
