import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Divider, Form, Input, Modal, Progress, Row, Select, Space, Spin, Statistic, Table, Tabs, Tag, Typography, Upload, message } from 'antd'
import { CheckCircleOutlined, CloudUploadOutlined, DownloadOutlined, EyeOutlined, LineChartOutlined, PlayCircleOutlined, RocketOutlined, ShareAltOutlined, TrophyOutlined, UploadOutlined, WarningOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { Line } from '@ant-design/plots'
import type { PresetModelTask } from '../mock/mockPresetModelService'
import { type PresetModelResult, mockPresetModelService } from '../mock/mockPresetModelService'

const { Title, Text, Paragraph } = Typography
const { TabPane } = Tabs
const { TextArea } = Input
const { Option } = Select
// 混淆矩阵组件
const ConfusionMatrix: React.FC<{
  matrix: number[][]
}> = ({ matrix }) => {
  const labels = ['类别A', '类别B', '类别C', '类别D']
  return (
    <div className="p-4">
      <table className="w-[100%] border-collapse">
        <thead>
          <tr>
            <th className="p-[8px]" style={{ border: '1px solid #d9d9d9', background: '#fafafa' }}>实际\预测</th>
            {labels.map((label) => (
              <th className="p-[8px]" key={label} style={{ border: '1px solid #d9d9d9', background: '#fafafa' }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="p-[8px] font-bold" style={{ border: '1px solid #d9d9d9', background: '#fafafa' }}>
                {labels[i]}
              </td>
              {row.map((cell, j) => (
                <td
                  className="p-[8px] text-center"
                  key={j}
                  style={{
                    border: '1px solid #d9d9d9',
                    backgroundColor: i === j ? '#e6f7ff' : '#fff',
                    fontWeight: i === j ? 'bold' : 'normal',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
// 在线体验组件
const OnlinePreview: React.FC<{
  task: PresetModelTask
}> = ({ task }) => {
  const [form] = Form.useForm()
  const [predicting, setPredicting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const handlePredict = async () => {
    try {
      const values = await form.validateFields()
      setPredicting(true)
      // 模拟预测
      setTimeout(() => {
        const mockResults = [
          '预测结果：正面情感 (置信度: 94.2%)',
          '预测结果：类别A (置信度: 89.7%)',
          '预测结果：高风险用户 (置信度: 76.3%)',
          '预测结果：相关性强 (置信度: 91.8%)',
        ]
        setResult(mockResults[Math.floor(Math.random() * mockResults.length)])
        setPredicting(false)
      }, 2000)
    }
    catch {
      message.error('请填写预测数据')
    }
  }
  const getInputPlaceholder = () => {
    if (task.templateName.includes('图像')) {
      return '上传图像文件进行预测...'
    }
    else if (task.templateName.includes('文本')) {
      return '输入文本内容进行情感分析...'
    }
    else {
      return '输入数据进行预测...'
    }
  }
  return (
    <Card title={(
      <>
        <PlayCircleOutlined />
        {' '}
        在线预测体验
      </>
    )}
    >
      <Form form={form} layout="vertical">
        {task.templateName.includes('图像') ? (
          <Form.Item name="image" label="上传图像">
            <Upload.Dragger name="file" multiple={false} beforeUpload={() => false} accept="image/*">
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽图像文件到此区域</p>
              <p className="ant-upload-hint">支持 JPG、PNG 格式图像</p>
            </Upload.Dragger>
          </Form.Item>
        ) : (
          <Form.Item name="input" label="输入数据" rules={[{ required: true, message: '请输入预测数据' }]}>
            <TextArea rows={4} placeholder={getInputPlaceholder()} />
          </Form.Item>
        )}

        <Form.Item>
          <Space>
            <Button type="primary" onClick={handlePredict} loading={predicting} icon={<RocketOutlined />}>
              开始预测
            </Button>
            <Button onClick={() => { form.resetFields(); setResult(null) }}>
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {result && (<Alert message="预测结果" description={result} type="success" showIcon className="mt-4" />)}
    </Card>
  )
}
// 部署配置模态框
const DeployModal: React.FC<{
  visible: boolean
  onClose: () => void
  onDeploy: (config: any) => void
  loading: boolean
}> = ({ visible, onClose, onDeploy, loading }) => {
  const [form] = Form.useForm()
  const handleDeploy = async () => {
    try {
      const values = await form.validateFields()
      onDeploy(values)
    }
    catch {
      message.error('请完善部署配置')
    }
  }
  return (
    <Modal
      title={(
        <>
          <CloudUploadOutlined />
          {' '}
          模型部署配置
        </>
      )}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="deploy" type="primary" loading={loading} onClick={handleDeploy} icon={<RocketOutlined />}>
          立即部署
        </Button>,
      ]}
      width={600}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="部署名称" rules={[{ required: true, message: '请输入部署名称' }]}>
          <Input placeholder="输入模型部署名称" />
        </Form.Item>

        <Form.Item name="description" label="部署描述" rules={[{ required: true, message: '请输入部署描述' }]}>
          <TextArea rows={3} placeholder="描述此次部署的用途和说明" />
        </Form.Item>

        <Form.Item name="environment" label="部署环境" initialValue="production">
          <Select>
            <Option value="development">开发环境</Option>
            <Option value="staging">测试环境</Option>
            <Option value="production">生产环境</Option>
          </Select>
        </Form.Item>

        <Form.Item name="instances" label="实例数量" initialValue={2}>
          <Select>
            <Option value={1}>1个实例</Option>
            <Option value={2}>2个实例</Option>
            <Option value={3}>3个实例</Option>
            <Option value={5}>5个实例</Option>
          </Select>
        </Form.Item>

        <Form.Item name="autoScaling" label="自动扩缩容" initialValue>
          <Select>
            <Option value>启用</Option>
            <Option value={false}>禁用</Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  )
}
// 主组件
const PresetModelResultPage: React.FC = () => {
  const { taskId } = useParams<{
    taskId: string
  }>()
  const navigate = useNavigate()
  const [task, setTask] = useState<PresetModelTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [deployModalVisible, setDeployModalVisible] = useState(false)
  const [deploying, setDeploying] = useState(false)
  // 加载任务结果
  useEffect(() => {
    const loadTaskResult = async () => {
      if (!taskId) {
        message.error('缺少任务ID')
        navigate('/preset-model/tasks')
        return
      }
      try {
        const response = await mockPresetModelService.getTask(taskId)
        const taskData = response.data
        if (!taskData.result) {
          message.error('任务结果不存在')
          navigate('/preset-model/tasks')
          return
        }
        setTask(taskData)
      }
      catch {
        message.error('加载任务结果失败')
        navigate('/preset-model/tasks')
      }
      finally {
        setLoading(false)
      }
    }
    loadTaskResult()
  }, [taskId, navigate])
  // 处理部署
  const handleDeploy = async (config: any) => {
    setDeploying(true)
    try {
      await mockPresetModelService.deployModel(taskId!, config)
      setDeployModalVisible(false)
      // 重新加载任务数据以获取部署状态
      const response = await mockPresetModelService.getTask(taskId!)
      setTask(response.data)
    }
    catch {
      message.error('模型部署失败')
    }
    finally {
      setDeploying(false)
    }
  }
  if (loading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spin size="large" />
      </div>
    )
  }
  if (!task || !task.result) {
    return null
  }
  const result = task.result
  // 训练指标图表数据
  const chartData = result.trainingMetrics.map((metric) => [
    { epoch: metric.epoch, value: metric.loss, type: '训练损失' },
    { epoch: metric.epoch, value: metric.valLoss, type: '验证损失' },
    { epoch: metric.epoch, value: metric.accuracy, type: '训练准确率' },
    { epoch: metric.epoch, value: metric.valAccuracy, type: '验证准确率' },
  ]).flat()
  // 试验结果表格列
  const trialColumns = [
    {
      title: '试验ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
    },
    {
      title: '超参数',
      dataIndex: 'hyperparameters',
      key: 'hyperparameters',
      render: (params: Record<string, unknown>) => (
        <div>
          {Object.entries(params).map(([key, value]) => (
            <div key={key} className="text-[12px]">
              <Text code>
                {key}
                :
                {' '}
                {String(value)}
              </Text>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: '得分',
      dataIndex: 'score',
      key: 'score',
      render: (score: number) => (
        <Text strong style={{ color: score > 0.9 ? '#52c41a' : score > 0.8 ? '#faad14' : '#ff4d4f' }}>
          {(score * 100).toFixed(1)}
          %
        </Text>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      render: (duration: number) => `${Math.floor(duration / 60)}分${duration % 60}秒`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'success' ? 'green' : 'red'}>
          {status === 'success' ? '成功' : '失败'}
        </Tag>
      ),
    },
  ]
  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <Title level={2}>
          <TrophyOutlined />
          {' '}
          任务结果分析
        </Title>
        <Paragraph>
          任务名称：
          {task.name}
          {' '}
          | 模板：
          {task.templateName}
        </Paragraph>
      </div>

      {/* 核心指标卡片 */}
      <Row gutter={16} className="mb-6">
        <Col span={6}>
          <Card>
            <Statistic title="最佳准确率" value={result.bestModel.accuracy * 100} precision={2} suffix="%" valueStyle={{ color: '#3f8600' }} prefix={<TrophyOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="最低损失" value={result.bestModel.loss} precision={3} valueStyle={{ color: '#cf1322' }} prefix={<LineChartOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="F1得分" value={result.bestModel.f1Score * 100} precision={2} suffix="%" valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="精确率" value={result.bestModel.precision * 100} precision={2} suffix="%" valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
      </Row>

      {/* 主要内容区域 */}
      <Row gutter={16}>
        <Col span={16}>
          {/* 训练过程可视化 */}
          <Card
            title={(
              <>
                <LineChartOutlined />
                {' '}
                训练过程可视化
              </>
            )}
            className="mb-4"
          >
            <Line
              data={chartData}
              xField="epoch"
              yField="value"
              seriesField="type"
              smooth
              animation={{
                appear: {
                  animation: 'path-in',
                  duration: 1000,
                },
              }}
              height={300}
            />
          </Card>

          {/* 详细分析 */}
          <Card>
            <Tabs defaultActiveKey="confusion">
              <TabPane tab="混淆矩阵" key="confusion">
                {result.confusionMatrix && (<ConfusionMatrix matrix={result.confusionMatrix} />)}
              </TabPane>
              <TabPane tab="试验详情" key="trials">
                <Table columns={trialColumns} dataSource={result.trials} rowKey="id" size="small" pagination={{ pageSize: 5 }} />
              </TabPane>
            </Tabs>
          </Card>
        </Col>

        <Col span={8}>
          {/* 最佳模型信息 */}
          <Card
            title={(
              <>
                <CheckCircleOutlined />
                {' '}
                最佳模型
              </>
            )}
            className="mb-4"
          >
            <div className="mb-4">
              <Text strong>模型名称：</Text>
              <Text>{result.bestModel.name}</Text>
            </div>
            <Divider />
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="召回率" value={result.bestModel.recall * 100} precision={1} suffix="%" />
              </Col>
              <Col span={12}>
                <Statistic title="F1得分" value={result.bestModel.f1Score * 100} precision={1} suffix="%" />
              </Col>
            </Row>
          </Card>

          {/* 部署状态 */}
          <Card
            title={(
              <>
                <CloudUploadOutlined />
                {' '}
                部署状态
              </>
            )}
            className="mb-4"
          >
            {result.deploymentInfo ? (
              <div>
                <div className="mb-4">
                  <Text strong>部署状态：</Text>
                  <Tag
                    color={result.deploymentInfo.status === 'deployed' ? 'green'
                      : result.deploymentInfo.status === 'deploying' ? 'blue' : 'red'}
                    icon={result.deploymentInfo.status === 'deployed' ? <CheckCircleOutlined />
                      : result.deploymentInfo.status === 'deploying' ? <PlayCircleOutlined /> : <WarningOutlined />}
                  >
                    {result.deploymentInfo.status === 'deployed' ? '已部署'
                      : result.deploymentInfo.status === 'deploying' ? '部署中' : '部署失败'}
                  </Tag>
                </div>

                {result.deploymentInfo.status === 'deployed' && (
                  <>
                    <div className="mb-2">
                      <Text strong>API端点：</Text>
                      <br />
                      <Text code copyable className="text-[12px]">
                        {result.deploymentInfo.apiEndpoint}
                      </Text>
                    </div>

                    <Divider />

                    <Row gutter={16}>
                      <Col span={24}>
                        <Statistic className="mb-[16px]" title="总请求数" value={result.deploymentInfo.metrics.requests} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="平均响应时间" value={result.deploymentInfo.metrics.avgResponseTime} suffix="ms" />
                      </Col>
                      <Col span={12}>
                        <Statistic title="错误率" value={result.deploymentInfo.metrics.errorRate * 100} precision={2} suffix="%" />
                      </Col>
                    </Row>
                  </>
                )}

                {result.deploymentInfo.status === 'deploying' && (<Progress percent={75} status="active" />)}
              </div>
            ) : (
              <div className="text-center">
                <Paragraph type="secondary">
                  模型尚未部署
                </Paragraph>
                <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setDeployModalVisible(true)}>
                  一键部署
                </Button>
              </div>
            )}
          </Card>

          {/* 操作按钮 */}
          <Card title="操作">
            <Space direction="vertical" className="w-full">
              <Button type="primary" icon={<DownloadOutlined />} className="w-full" onClick={() => message.success('模型下载功能开发中')}>
                下载模型
              </Button>
              <Button icon={<ShareAltOutlined />} className="w-full" onClick={() => message.success('分享功能开发中')}>
                分享结果
              </Button>
              <Button icon={<EyeOutlined />} className="w-full" onClick={() => navigate('/preset-model/tasks')}>
                返回任务列表
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 在线预测体验 */}
      <div className="mt-6">
        <OnlinePreview task={task} />
      </div>

      {/* 部署配置模态框 */}
      <DeployModal visible={deployModalVisible} onClose={() => setDeployModalVisible(false)} onDeploy={handleDeploy} loading={deploying} />
    </div>
  )
}
export default PresetModelResultPage
