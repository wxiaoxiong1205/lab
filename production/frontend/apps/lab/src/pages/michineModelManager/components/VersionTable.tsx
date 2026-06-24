import { Button, Dropdown, Popconfirm, Table, Tooltip, Typography, message } from 'antd'
import type { MenuProps } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, EditOutlined, MoreOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { getMlModelStatus } from '../data'
import StatusTag from './StatusTag'
import type { MlModelVersion } from '@/types/mlModel'
import { downloadUrlFile } from '@/utils/download'
import { getBackendConfig, getBackendURLFromParams } from '@/utils/getBackendURL'

/** 与状态列文案一致：已完成 / 失败 / 已创建（「完成」「待启动」与 data 映射一致） */
function getVersionRowActions(status?: string) {
  const text = getMlModelStatus(status).text
  const isCompleted = text === '已完成' || text === '完成'
  const isFailed = text === '失败'
  const isCreated = text === '已创建' || text === '待启动'
  return {
    canEdit: isFailed,
    canDelete: isCompleted || isFailed || isCreated,
  }
}
function buildDownloadUri(uri: string) {
  const normalizedUri = uri.startsWith('/') ? uri : `/${uri}`
  return `/storage/download${normalizedUri}`
}
function getFilenameFromUri(uri?: string | null) {
  if (!uri)
    return 'download'
  const pathname = uri.split('?')[0]
  const segments = pathname.split('/').filter(Boolean)
  return segments.at(-1) || 'download'
}
function getApiBaseURL() {
  return getBackendURLFromParams()
    || getBackendConfig()?.baseURL
    || (import.meta.env.DEV ? `${import.meta.env.VITE_PREFIX_BASE_URL}/api/v1` : '/lab-backend/api/v1')
}
function buildBrowserDownloadUrl(uri: string) {
  const baseURL = getApiBaseURL().replace(/\/+$/, '')
  return `${baseURL}${buildDownloadUri(uri)}`
}
function handleFileDownload(uri: string) {
  downloadUrlFile(buildBrowserDownloadUrl(uri), getFilenameFromUri(uri), '_blank')
}
interface VersionTableProps {
  dataSource: MlModelVersion[]
  loading?: boolean
  onDelete: (record: MlModelVersion) => void
  onEdit: (record: MlModelVersion) => void
}
const VersionTable = ({ dataSource, loading, onDelete, onEdit }: VersionTableProps) => {
  const columns: ColumnsType<MlModelVersion> = [
    {
      title: '版本',
      dataIndex: 'model_version',
      key: 'model_version',
      width: 120,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      render: (value) => (
        <Tooltip
          title={(
            <div className="!max-h-50 overflow-auto max-w-[320px] break-words">
              {value}
            </div>
          )}
        >
          <div className="w-full inline-block overflow-hidden text-ellipsis whitespace-nowrap">
            {value}
          </div>
        </Tooltip>
      ),
    },
    {
      title: '模型来源',
      dataIndex: 'source_type',
      key: 'source_type',
      width: 140,
      render: (_, record) => {
        const ref = record?.notebook_name + record.source_ref?.trim()
        if (record.source_type === 'notebook') {
          return (
            <Tooltip title={ref
              ? (
                  <div>
                    <div className="mb-1 text-xs opacity-[0.85]">数据层级</div>
                    <div className="max-w-sm whitespace-pre-wrap break-all">{ref}</div>
                  </div>
                )
              : undefined}
            >
              <span className="cursor-default border-b border-dotted border-current">Notebook获取</span>
            </Tooltip>
          )
        }
        if (record.source_type === 'local_upload') {
          return '本地上传'
        }
        return record.source_type || '-'
      },
    },
    {
      title: '网络结构',
      dataIndex: 'network_structure',
      key: 'network_structure',
      width: 240,
      render: (value) => (
        <Button type="link" className="w-full px-0 text-left">
          <Typography.Text className="w-full text-left" ellipsis={{ tooltip: value ? String(value) : undefined }}>
            {value || '-'}
          </Typography.Text>
        </Button>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value) => <StatusTag status={value} />,
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (value) => dayjs(value).format('YYYY/MM/DD'),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_, record) => {
        const { canEdit, canDelete } = getVersionRowActions(record.status)
        const downloadMenuItems: MenuProps['items'] = [
          record.artifact_uri
            ? {
                key: 'artifact',
                label: '权重文件',
                onClick: () => {
                  handleFileDownload(record.artifact_uri!)
                  message.success('权重文件开始下载')
                },
              }
            : null,
          record.tokenizer_uri
            ? {
                key: 'tokenizer',
                label: '分词器文件',
                onClick: () => {
                  handleFileDownload(record.tokenizer_uri!)
                  message.success('分词器文件开始下载')
                },
              }
            : null,
        ].filter(Boolean)
        const deleteButton = (<Button type="link" danger className="px-0" icon={<DeleteOutlined />} disabled={!canDelete}>删除 </Button>)
        return (
          <div className="lab-table-action-cell">
            <Button
              type="link"
              className="px-0"
              icon={<EditOutlined />}
              disabled={!canEdit}
              onClick={() => {
                if (canEdit) {
                  onEdit(record)
                }
              }}
            >
              编辑
            </Button>
            {canDelete
              ? (
                  <Popconfirm title="确认删除版本" description={`确定删除版本 ${record.model_version} 吗？`} onConfirm={() => onDelete(record)} okText="确认" cancelText="取消">
                    {deleteButton}
                  </Popconfirm>
                )
              : deleteButton}
            {downloadMenuItems.length > 0
              ? (
                  <Dropdown menu={{ items: downloadMenuItems }} trigger={['hover']}>
                    <Button type="link" className="lab-table-action-more px-0" icon={<MoreOutlined />} aria-label="更多操作" />
                  </Dropdown>
                )
              : null}
          </div>
        )
      },
    },
  ]
  return (<Table rowKey="id" columns={columns} dataSource={dataSource} loading={loading} pagination={false} scroll={{ x: 960 }} />)
}
export default VersionTable
