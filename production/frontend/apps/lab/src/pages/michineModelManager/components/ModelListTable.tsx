import {
  Button,
  Popconfirm,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import type { MlModelSummary } from '@/types/mlModel'

interface ModelListTableProps {
  current: number
  dataSource: MlModelSummary[]
  loading?: boolean
  pageSize: number
  total: number
  onDelete: (record: MlModelSummary) => void
  onPageChange: (page: number, size: number) => void
}

const ModelListTable = ({
  current,
  dataSource,
  loading,
  onDelete,
  onPageChange,
  pageSize,
  total,
}: ModelListTableProps) => {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const columns: ColumnsType<MlModelSummary> = [
    {
      title: '模型名称',
      dataIndex: 'model_name',
      key: 'model_name',
      render: (_, record) => (
        <Typography.Text strong>{record.model_name}</Typography.Text>
      ),
    },
    {
      title: '版本数量',
      dataIndex: 'version_count',
      key: 'version_count',
      width: 180,
      render: (value) => (
        <Typography.Text className="text-[32px] leading-none text-[#595959]">
          {value}
        </Typography.Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <div className="lab-table-action-cell">
          <Button
            type="link"
            className="px-0"
            icon={<InfoCircleOutlined />}
            onClick={() => navigate(`/project/${projectId}/michine-model-manager/${encodeURIComponent(record.model_name)}`)}
          >
            详情
          </Button>
          <Popconfirm
            title="确认删除模型"
            description={`确定删除模型 ${record.model_name} 及其全部版本吗？`}
            onConfirm={() => onDelete(record)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" danger className="px-0" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ]

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      pagination={{
        current,
        total,
        pageSize,
        showSizeChanger: true,
        showTotal: (count, range) => `第 ${range[0]}-${range[1]} 条，共 ${count} 条`,
        onChange: onPageChange,
      }}
    />
  )
}

export default ModelListTable
