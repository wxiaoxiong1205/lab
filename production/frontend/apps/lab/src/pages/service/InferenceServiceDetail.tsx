import type { DescriptionsProps } from 'antd'
import { Alert, Button, Card, Descriptions, Skeleton, Tabs, Tag, Tooltip } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import React, { useEffect, useState } from 'react'
import { inferenceServiceApi } from '../../services/inferenceService'
import type { Attribute, InferenceServiceDetail as InferenceServiceDetailType } from '../../types/inference'

const InferenceServiceDetailPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { serviceId } = useParams<{ serviceId: string }>()
  const { projectId } = useParams<{ projectId: string }>()
  const [descriptionList, setDescription] = useState<DescriptionsProps['items']>()

  // 调用真实API获取服务详情
  const { data: serviceDetail, isLoading, error } = useQuery<InferenceServiceDetailType>({
    queryKey: ['inference-service', serviceId],
    queryFn: async () => {
      if (!serviceId) {
        throw new Error('服务ID不存在')
      }
      const data = await inferenceServiceApi.getDetail(serviceId, projectId)
      return data
    },
  })

  // 格式化属性值显示
  const formatAttributeValue = (attr: Attribute) => {
    if (attr.input_type === '手动输入') {
      const value = attr.attr_value || '-'
      return (
        <Tooltip title={value}>
          <span className="max-w-[500px] truncate">
            {value}
          </span>
        </Tooltip>
      )
    }
    else if (attr.input_type === '下拉选择') {
      if (attr.options && attr.options.length > 0) {
        const values = attr.options.map((opt) => opt.option_value)
        const fullText = values.join(', ')
        return (
          <Tooltip title={fullText}>
            <span className="inline-block max-w-[500px] overflow-hidden">
              {values.map((value, index) => (
                <Tag key={index} className="max-w-[200px] truncate">
                  <span className="inline-block max-w-full truncate">
                    {value}
                  </span>
                </Tag>
              ))}
            </span>
          </Tooltip>
        )
      }
      return '-'
    }
    return '-'
  }

  // 更新描述列表
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
          children: serviceDetail.description || '-',
        },
        {
          key: 'base_url',
          label: 'Base URL',
          children: serviceDetail.base_url || '-',
        },
        {
          key: 'model_name',
          label: '模型名称',
          children: serviceDetail.model_name || '-',
        },
        {
          key: 'model_type',
          label: '模型类型',
          children: serviceDetail.model_type && serviceDetail.model_type.length > 0
            ? serviceDetail.model_type.map((type, index) => (
                <Tag key={index}>{type}</Tag>
              ))
            : '-',
        },
      ]

      // 添加属性值
      if (serviceDetail.attr_values && serviceDetail.attr_values.length > 0) {
        serviceDetail.attr_values.forEach((attr, index) => {
          const attrName = attr.name || `属性${index + 1}`
          items.push({
            key: `attr_${attr.attr_id}_${index}`,
            label: (
              <Tooltip title={attrName}>
                <span className="max-w-[150px] truncate">
                  {attrName}
                </span>
              </Tooltip>
            ),
            children: formatAttributeValue(attr),
          })
        })
      }
      setDescription(items)
    }
  }, [serviceDetail])

  const tabs = [
    {
      key: 'basic',
      label: '基本信息',
    },
  ]
  const [activeTab] = useState(tabs[0]?.key || 'basic')

  // 返回列表页
  const handleBack = () => {
    if (!projectId) {
      navigate(-1)
      return
    }

    navigate(`/project/${projectId}/${location.pathname.includes('/service/inference/external') ? 'service/inference/external' : 'online-inference'}`)
  }

  // 基本信息卡片
  const basicView = () => {
    return (
      <Descriptions className="!pl-1 !pt-4" column={1} items={descriptionList} />
    )
  }

  if (error) {
    return (
      <div className="inference-service-detail-container lab-list-page-shell">
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
    <div className="inference-service-detail-container lab-list-page-shell">
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

export default InferenceServiceDetailPage
