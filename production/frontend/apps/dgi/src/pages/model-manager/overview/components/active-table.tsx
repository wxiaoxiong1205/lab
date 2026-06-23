import { Col, Row, Table } from 'antd'
import { memo, useContext } from 'react'
import { DashboardContext } from '../config/dashboard-context'
import { useTransform } from '@/locales'
import AutoTooltip from '@/components/auto-tooltip'

// 临时的模型分类映射
const modelCategoriesMap = {
  llm: 'llm',
  embedding: 'embedding',
  reranker: 'reranker',
}

// 临时的文件大小转换函数
const convertFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// PageTools 组件
const PageTools: React.FC<{ style?: React.CSSProperties, left?: React.ReactNode, right?: boolean }> = ({
  style,
  left,
  right,
}) => {
  return (
    <div style={style}>
      {left}
    </div>
  )
}

const NACategories = [
  modelCategoriesMap.llm,
  modelCategoriesMap.embedding,
  modelCategoriesMap.reranker,
]

const ActiveTable = () => {
  const { $t } = useTransform()
  const data = useContext(DashboardContext).active_models || []
  const modelColumns = [
    {
      title: $t('名称'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (text: any, record: any) => {
        return (
          <AutoTooltip ghost>
            <span>{text}</span>
          </AutoTooltip>
        )
      },
    },
    {
      title: $t('显存'),
      dataIndex: 'resource_claim.memory',
      key: 'vram',
      ellipsis: true,
      render: (text: any, record: any) => {
        return (
          <AutoTooltip ghost>
            {convertFileSize(record.resource_claim?.vram || 0)}
            {' '}
            /
            {' '}
            {convertFileSize(record.resource_claim?.ram || 0)}
          </AutoTooltip>
        )
      },
    },
    {
      title: $t('副本数'),
      dataIndex: 'instance_count',
      key: 'instance_count',
    },
    // {
    //   title: 'Token数',
    //   dataIndex: 'token_count',
    //   key: 'token_count',
    //   ellipsis: true,
    //   render: (text: any, record: any) => {
    //     let val = text;
    //     if (!text) {
    //       val = !NACategories.includes(record.categories?.[0]) ? 'N/A' : 0;
    //     }
    //     return (
    //       <AutoTooltip ghost>
    //         <span>{val}</span>
    //       </AutoTooltip>
    //     );
    //   }
    // }
  ]
  return (
    <Row gutter={[20, 0]}>
      <Col xs={24} sm={24} md={24} lg={24} xl={24}>
        <PageTools
          style={{ margin: '26px 0px' }}
          left={(
            <span className="font-bold">
              活跃模型
            </span>
          )}
          right={false}
        />
        <div>
          <Table
            columns={modelColumns}
            dataSource={data}
            pagination={false}
            rowKey="id"
          />
        </div>
      </Col>
    </Row>
  )
}

export default memo(ActiveTable)
