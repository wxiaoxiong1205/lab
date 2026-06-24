import React, { useEffect, useState } from 'react'
import { Button, Card, Col, DatePicker, Form, Input, Modal, Row, Select, Space, Table, Tag, Tooltip } from 'antd'
import { DeleteOutlined, EditOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import ReactJson from '@microlink/react-json-view'
import axios from 'axios'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Option } = Select
const DatasetSearch = ({ projectId }) => {
  const [datasets, setDatasets] = useState([])
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [selectedDataset, setSelectedDataset] = useState(null)
  const [jsonViewerVisible, setJsonViewerVisible] = useState(false)
  const [form] = Form.useForm()
  // 获取项目标签
  const fetchTags = async () => {
    try {
      const response = await axios.get(`/api/tags/by-project/${projectId}`)
      setTags(response.data)
    }
    catch (error) {
      console.error('Error fetching tags:', error)
    }
  }
  // 搜索数据集
  const searchDatasets = async (values, page = 1, pageSize = 10) => {
    setLoading(true)
    try {
      const params = {
        project_id: projectId,
        skip: (page - 1) * pageSize,
        limit: pageSize,
        ...values,
      }
      // 处理日期范围
      if (values.dateRange && values.dateRange.length === 2) {
        params.created_after = values.dateRange[0].toISOString()
        params.created_before = values.dateRange[1].toISOString()
        delete params.dateRange
      }
      const response = await axios.get('/api/datasets/search', { params })
      setDatasets(response.data)
      setPagination({
        ...pagination,
        current: page,
        total: response.data.length, // This should be updated with total count from backend
      })
    }
    catch (error) {
      console.error('Error searching datasets:', error)
    }
    finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (projectId) {
      fetchTags()
      // 初始搜索，不带任何过滤条件
      searchDatasets({})
    }
  }, [projectId])
  const handleTableChange = (pagination) => {
    const values = form.getFieldsValue()
    searchDatasets(values, pagination.current, pagination.pageSize)
  }
  const handleSearch = (values) => {
    searchDatasets(values)
  }
  const handleReset = () => {
    form.resetFields()
    searchDatasets({})
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
      <Card className="mb-4">
        <Form form={form} name="dataset_search" onFinish={handleSearch} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="question" label="问题">
                <Input placeholder="输入问题关键词" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tag_ids" label="标签">
                <Select mode="multiple" placeholder="选择标签" className="w-full">
                  {tags.map((tag) => (
                    <Option key={tag.id} value={tag.id}>
                      {tag.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tag_match_type" label="标签匹配方式" initialValue="any">
                <Select>
                  <Option value="any">匹配任意标签</Option>
                  <Option value="all">匹配所有标签</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="dateRange" label="创建时间范围">
                <RangePicker className="w-full" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sort_by" label="排序字段" initialValue="created_at">
                <Select>
                  <Option value="created_at">创建时间</Option>
                  <Option value="updated_at">更新时间</Option>
                  <Option value="question">问题</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sort_order" label="排序方向" initialValue="desc">
                <Select>
                  <Option value="desc">降序</Option>
                  <Option value="asc">升序</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row>
            <Col span={24} className="text-right">
              <Space>
                <Button onClick={handleReset} icon={<ReloadOutlined />}>
                  重置
                </Button>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                  搜索
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

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
export default DatasetSearch
