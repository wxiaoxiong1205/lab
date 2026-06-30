import React from 'react'
import { Card, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ADAPTED_QWEN_BASE_MODELS, type AdaptedBaseModel } from '@/config/adaptedBaseModels'

const { Paragraph, Title } = Typography

const columns: ColumnsType<AdaptedBaseModel> = [
  {
    title: '模型Code',
    dataIndex: 'name',
    key: 'name',
    width: 260,
  },
  {
    title: '模型提供商',
    dataIndex: 'provider',
    key: 'provider',
    width: 140,
  },
  {
    title: '训练类型',
    dataIndex: 'modelType',
    key: 'modelType',
    width: 160,
    render: (value: AdaptedBaseModel['modelType']) => (
      <Tag color={value === 'image-understanding' ? 'gold' : 'cyan'}>
        {value === 'image-understanding' ? '图像理解' : '文本生成'}
      </Tag>
    ),
  },
  {
    title: '适配状态',
    key: 'adapted',
    width: 120,
    render: () => <Tag color="success">已适配</Tag>,
  },
  {
    title: '说明',
    dataIndex: 'description',
    key: 'description',
  },
]

const AdaptedModels: React.FC = () => {
  return (
    <div className="p-[32px_40px] max-w-[1200px] m-[0_auto]">
      <Title level={1}>大模型训练适配名单</Title>
      <Paragraph className="docs-muted text-[16px]">
        当前大模型训练创建页只展示下列已适配的 Qwen 系列模型。页面中的“已下载/未下载”状态来自模型仓库是否已有对应模型；模型仓库中的其它模型不会同步到大模型训练创建页。
      </Paragraph>
      <Card className="docs-card rounded-[8px]">
        <Table
          rowKey="name"
          columns={columns}
          dataSource={ADAPTED_QWEN_BASE_MODELS}
          pagination={false}
          scroll={{ x: 780 }}
        />
      </Card>
    </div>
  )
}

export default AdaptedModels
