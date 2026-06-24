import React, { useMemo } from 'react'
import { Card, Col, Form, InputNumber, Row, Tabs } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import ResourceConfig from './ResourceConfig'

type RayNodeFieldName =
  | 'submit_graphics_card_resource'
  | 'head_graphics_card_resource'
  | 'worker_graphics_card_resource'

interface GrpoRayResourceConfigProps {
  projectId?: number
  SupportedGpuCategory?: { value: string, name: string, description?: string }[]
  onAllocatableResourcesChange?: (resources: any) => void
  onResourceLoadingChange?: (loading: boolean) => void
  preserveResourceValuesOnAllocatableChange?: boolean
}

const nodeFieldPath = (nodeName: RayNodeFieldName, fieldName: string) => [
  'ray_resource_config',
  nodeName,
  fieldName,
]

const GrpoRayResourceConfig: React.FC<GrpoRayResourceConfigProps> = ({
  projectId,
  SupportedGpuCategory,
  onAllocatableResourcesChange,
  onResourceLoadingChange,
  preserveResourceValuesOnAllocatableChange,
}) => {
  const renderNodeForm = (nodeName: RayNodeFieldName, options?: { showReplicas?: boolean, allowZeroGpuCount?: boolean, readonlyZeroGpuCount?: boolean }) => (
    <div className="grpo-ray-resource-tab-panel">
      <ResourceConfig
        projectId={projectId}
        SupportedGpuCategory={SupportedGpuCategory}
        onAllocatableResourcesChange={onAllocatableResourcesChange}
        onResourceLoadingChange={onResourceLoadingChange}
        preserveResourceValuesOnAllocatableChange={preserveResourceValuesOnAllocatableChange}
        allowZeroGpuCount={options?.allowZeroGpuCount}
        readonlyZeroGpuCount={options?.readonlyZeroGpuCount}
        hideGpuAdaptationWarning
        skipLocalStorageEcho
        embed
        fieldNames={{
          gpuType: nodeFieldPath(nodeName, 'card_selector'),
          gpuCount: nodeFieldPath(nodeName, 'count'),
          gpuModel: nodeFieldPath(nodeName, 'card_model'),
          gpuMemory: nodeFieldPath(nodeName, 'card_memory'),
          k8sResourceType: nodeFieldPath(nodeName, 'k8s_resource_type'),
          graphicsCardResource: ['ray_resource_config', nodeName],
        }}
      />

      {options?.showReplicas && (
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name={['ray_resource_config', 'worker_replicas']}
              label="Worker Replicas"
              rules={[{ required: true, message: '请输入 Worker Replicas' }]}
            >
              <InputNumber min={1} step={1} precision={0} className="w-full" placeholder="请输入 Worker Replicas" />
            </Form.Item>
          </Col>
        </Row>
      )}
    </div>
  )

  const tabItems = useMemo(() => [
    {
      key: 'submit',
      label: 'Submit',
      forceRender: true,
      children: renderNodeForm('submit_graphics_card_resource', { allowZeroGpuCount: true, readonlyZeroGpuCount: true }),
    },
    {
      key: 'head',
      label: 'Head',
      forceRender: true,
      children: renderNodeForm('head_graphics_card_resource', { allowZeroGpuCount: true, readonlyZeroGpuCount: true }),
    },
    {
      key: 'worker',
      label: 'Worker',
      forceRender: true,
      children: renderNodeForm('worker_graphics_card_resource', { showReplicas: true }),
    },
  ], [
    projectId,
    SupportedGpuCategory,
    onAllocatableResourcesChange,
    onResourceLoadingChange,
    preserveResourceValuesOnAllocatableChange,
  ])

  return (
    <Card
      title={(
        <div className="flex items-center !rounded-md">
          <ThunderboltOutlined className="mr-2 !text-red-500" />
          资源配置
        </div>
      )}
      size="small"
    >
      <Tabs type="card" size="small" items={tabItems} />
    </Card>
  )
}

export default GrpoRayResourceConfig
