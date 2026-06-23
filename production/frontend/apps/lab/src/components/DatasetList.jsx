import React, { useEffect, useState } from 'react'
import { Button, Modal, Space, Table, Tag, Tooltip, message } from 'antd'
import { DeleteOutlined, EditOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons'
import ReactJson from '@microlink/react-json-view'
import axios from 'axios'

const DatasetList = ({ projectId }) => {
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [selectedDataset, setSelectedDataset] = useState(null)
  const [jsonViewerVisible, setJsonViewerVisible] = useState(false)
  const fetchDatasets = async (page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const response = await axios.get(`/api/datasets/by-project/${projectId}/list`, {
        params: {
          skip: (page - 1) * pageSize,
          limit: pageSize,
        },
      })
      setDatasets(response.data)
      setPagination({
        ...pagination,
        current: page,
        total: response.data.length, // This should be updated with total count from backend
      })
    }
    catch (error) {
      console.error('Error fetching datasets:', error)
    }
    finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (projectId) {
      fetchDatasets()
    }
    // 添加消息监听器，处理来自 BatchProcessor 的刷新请求
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'REFRESH_DATASETS'
        && event.data.projectId === projectId) {
        message.success('Batch processing completed. Refreshing datasets...')
        fetchDatasets()
      }
    }
    window.addEventListener('message', handleMessage)
    // 清理函数
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [projectId])
  const handleTableChange = (pagination) => {
    fetchDatasets(pagination.current, pagination.pageSize)
  }
  const showJsonViewer = (dataset) => {
    setSelectedDataset(dataset)
    setJsonViewerVisible(true)
  }
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '问题',
      dataIndex: 'question',
      key: 'question',
      ellipsis: true,
    },
    {
      title: '元数据',
      dataIndex: 'meta_info',
      key: 'meta_info',
      width: 150,
      render: (meta_info, record) => (
        <Space>
          {/* 简洁预览 */}
          <div className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
            {Object.keys(meta_info).length > 0
              ? `${Object.keys(meta_info).length} 个字段`
              : '无元数据'}
          </div>

          {/* 查看按钮 */}
          {Object.keys(meta_info).length > 0 && (<Button type="text" icon={<EyeOutlined />} onClick={() => showJsonViewer(record)} size="small" />)}
        </Space>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags) => (
        <Space wrap>
          {tags && tags.map((tag) => (
            <Tag color="blue" key={tag.id}>
              {tag.name}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleString(),
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="middle">
          <Tooltip title="查看详情">
            <Button type="text" icon={<EyeOutlined />} onClick={() => console.log('View dataset', record.id)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" icon={<EditOutlined />} onClick={() => console.log('Edit dataset', record.id)} />
          </Tooltip>
          <Tooltip title="删除">
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => console.log('Delete dataset', record.id)} />
          </Tooltip>
        </Space>
      ),
    },
  ]
  return (
    <div>
      <div className="mb-4 text-right">
        <Button type="primary" icon={<SyncOutlined />} onClick={() => fetchDatasets(pagination.current, pagination.pageSize)} loading={loading}>
          刷新数据集
        </Button>
      </div>

      <Table columns={columns} dataSource={datasets} rowKey="id" pagination={pagination} loading={loading} onChange={handleTableChange} />

      {/* JSON Viewer Modal */}
      <Modal
        title={`元数据详情 - ${selectedDataset?.question || ''}`}
        open={jsonViewerVisible}
        onCancel={() => setJsonViewerVisible(false)}
        footer={[
          <Button key="close" onClick={() => setJsonViewerVisible(false)}>
            关闭
          </Button>,
        ]}
        width={800}
      >
        {selectedDataset && (<ReactJson className="max-h-[60vh] overflow-auto" src={selectedDataset.meta_info} theme="rjv-default" displayDataTypes={false} name={false} collapsed={1} enableClipboard />)}
      </Modal>
    </div>
  )
}
export default DatasetList
