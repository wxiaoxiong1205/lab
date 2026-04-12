import React, { useState } from 'react'
import { message, Tag } from 'antd'
import {
  AppstoreOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import { mockImageRecords } from '../../data/mockDataAll'
import type { ColumnsType } from 'antd/es/table'
import type { ImageRecord } from '../../types/shared'

const ImageListPage: React.FC = () => {
  const [data] = useState<ImageRecord[]>(mockImageRecords)

  const columns: ColumnsType<ImageRecord> = [
    { title: '镜像名称', dataIndex: 'name', key: 'name', render: (val: string) => (
      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{val}</span>
    )},
    { title: '镜像描述', dataIndex: 'description', key: 'description' },
    { title: '镜像分类', dataIndex: 'category', key: 'category', render: (val: string) => <Tag>{val}</Tag> },
    { title: '镜像仓库', dataIndex: 'registry', key: 'registry' },
    { title: '命名空间', dataIndex: 'namespace', key: 'namespace' },
    { title: '添加时间', dataIndex: 'addedAt', key: 'addedAt' },
  ]

  return (
    <SharedListPage
      title="镜像列表"
      titleIcon={<AppstoreOutlined style={{ color: '#fff', fontSize: 18 }} />}
      subtitle="平台镜像列表管理，查看所有可用镜像"
      searchPlaceholder="请输入镜像名称"
      searchField="name"
      columns={columns}
      dataSource={data}
      showCreateButton={false}
      onRefresh={() => message.success('刷新成功')}
      emptyText="暂无镜像"
    />
  )
}

export default ImageListPage
