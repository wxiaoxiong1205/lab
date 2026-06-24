import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Button, Card, Col, Descriptions,
  Divider, Row, Space,
  Spin, Tabs,
  Tag, Typography,
  message,
} from 'antd'
import {
  ArrowLeftOutlined, BookOutlined,
  ClockCircleOutlined, CopyOutlined, FileOutlined,
  TagOutlined, UserOutlined,
} from '@ant-design/icons'
import { notebookService } from '../services/notebookService'
import type {
  NotebookCaseDetail,
} from '../types'
import CaseFileExplorer from '../components/notebook/CaseFileExplorer'
import CloneCaseModal from '../components/notebook/CloneCaseModal'
import './styles/finetune.scss'

const { Title, Text, Paragraph } = Typography
const { TabPane } = Tabs

/**
 * 案例详情页面
 * 类似GitHub仓库页面的布局，显示案例的完整信息
 */
const NotebookCaseDetailPage: React.FC = () => {
  const navigate = useNavigate()
  const { projectId, caseId } = useParams<{
    projectId: string
    caseId: string
  }>()
  const [caseDetail, setCaseDetail] = useState<NotebookCaseDetail | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [cloneModalVisible, setCloneModalVisible] = useState<boolean>(false)

  // 获取项目路径
  const getProjectPath = () => {
    if (projectId) {
      return `/project/${projectId}`
    }
    return '/'
  }

  // 获取案例详情
  const fetchCaseDetail = async () => {
    if (!caseId) return

    setLoading(true)
    try {
      const response = await notebookService.getCaseDetail(caseId)
      setCaseDetail(response)

      // 默认选择notebook文件
      if (response.notebook_file) {
        setSelectedFile(response.notebook_file)
      }
    }
    catch (error) {
      console.error('获取案例详情失败:', error)
      message.error('获取案例详情失败')
    }
    finally {
      setLoading(false)
    }
  }

  // 克隆案例
  const handleCloneCase = () => {
    setCloneModalVisible(true)
  }

  // 克隆成功回调
  const handleCloneSuccess = (notebookId: string) => {
    message.success('案例克隆成功')
    navigate(`${getProjectPath()}/finetune/notebooks/${notebookId}`)
  }

  // 关闭克隆弹窗
  const handleCloneCancel = () => {
    setCloneModalVisible(false)
  }

  // 文件选择处理
  const handleFileSelect = (filePath: string, _fileType: string) => {
    setSelectedFile(filePath)
    // 这里可以添加加载文件内容的逻辑
  }

  // 获取难度颜色
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'green'
      case 'intermediate': return 'orange'
      case 'advanced': return 'red'
      default: return 'default'
    }
  }

  // 获取难度文本
  const getDifficultyText = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return '初级'
      case 'intermediate': return '中级'
      case 'advanced': return '高级'
      default: return difficulty
    }
  }

  useEffect(() => {
    fetchCaseDetail()
  }, [caseId])

  if (loading) {
    return (
      <div className="text-center p-[50px]">
        <Spin size="large" />
      </div>
    )
  }

  if (!caseDetail) {
    return (
      <Alert
        message="案例不存在"
        description="请检查案例ID是否正确"
        type="error"
        showIcon
      />
    )
  }

  return (
    <div className="notebook-case-detail">
      {/* 头部导航 */}
      <Card className="header-card mb-4">
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              <Button
                type="link"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(`${getProjectPath()}/finetune/notebooks`)}
              >
                返回案例列表
              </Button>
              <Divider type="vertical" />
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                type="primary"
                icon={<CopyOutlined />}
                onClick={handleCloneCase}
              >
                克隆案例
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 案例信息头部 */}
      <Card className="case-info-card mb-4">
        <Row>
          <Col span={18}>
            <Space direction="vertical" size={16} className="w-full">
              <div>
                <Title level={2} className="mb-2">
                  <FileOutlined className="mr-2" />
                  {caseDetail.name}
                </Title>
                <Paragraph className="text-[16px] mb-4">
                  {caseDetail.description}
                </Paragraph>
              </div>

              {/* 案例元数据 */}
              <Space wrap>
                <Tag color={getDifficultyColor(caseDetail.difficulty)}>
                  {getDifficultyText(caseDetail.difficulty)}
                </Tag>
                <Tag icon={<ClockCircleOutlined />}>
                  {caseDetail.duration}
                  {' '}
                  分钟
                </Tag>
                <Tag icon={<UserOutlined />}>
                  {caseDetail.created_by}
                </Tag>
                <Tag icon={<TagOutlined />}>
                  v
                  {caseDetail.version}
                </Tag>
              </Space>

              {/* 技术栈标签 */}
              <div>
                <Text strong>技术栈: </Text>
                <Space wrap>
                  {caseDetail.tech_stack.map((tech, index) => (
                    <Tag key={index} color="blue">{tech}</Tag>
                  ))}
                </Space>
              </div>

              {/* 标签 */}
              <div>
                <Text strong>标签: </Text>
                <Space wrap>
                  {caseDetail.tags.map((tag, index) => (
                    <Tag key={index}>{tag}</Tag>
                  ))}
                </Space>
              </div>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 主要内容区域 */}
      <Row gutter={16}>
        <Col span={24}>
          <Card>
            <Tabs defaultActiveKey="files" size="large">
              <TabPane tab="文件" key="files">
                <CaseFileExplorer
                  caseDetail={caseDetail}
                  selectedFile={selectedFile}
                  onFileSelect={handleFileSelect}
                />
              </TabPane>

              <TabPane tab="README" key="readme">
                <div className="p-5">
                  {caseDetail.readme_content ? (
                    <div dangerouslySetInnerHTML={{ __html: caseDetail.readme_content }} />
                  ) : (
                    <Alert message="暂无README内容" type="info" />
                  )}
                </div>
              </TabPane>

              <TabPane tab="依赖" key="dependencies">
                <div className="p-5">
                  <Descriptions title="环境信息" column={2}>
                    <Descriptions.Item label="Python版本">
                      {caseDetail.environment.python_version}
                    </Descriptions.Item>
                    <Descriptions.Item label="Conda环境">
                      {caseDetail.environment.conda_environment || '无'}
                    </Descriptions.Item>
                  </Descriptions>

                  <Divider />

                  <Title level={4}>依赖包</Title>
                  <div className="flex flex-wrap gap-2">
                    {caseDetail.dependencies.map((dep, index) => (
                      <Tag key={index} color="processing">{dep}</Tag>
                    ))}
                  </div>
                </div>
              </TabPane>

              <TabPane tab="资源需求" key="resources">
                <div className="p-5">
                  <Descriptions title="资源配置" column={2}>
                    <Descriptions.Item label="CPU">
                      {caseDetail.resource_requirements.cpu}
                    </Descriptions.Item>
                    <Descriptions.Item label="内存">
                      {caseDetail.resource_requirements.memory}
                    </Descriptions.Item>
                    <Descriptions.Item label="存储">
                      {caseDetail.resource_requirements.storage}
                    </Descriptions.Item>
                    <Descriptions.Item label="GPU需求">
                      {caseDetail.resource_requirements.gpu_required ? (
                        <Tag color="red">
                          需要GPU (
                          {caseDetail.resource_requirements.gpu_type}
                          )
                        </Tag>
                      ) : (
                        <Tag color="green">不需要GPU</Tag>
                      )}
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              </TabPane>
            </Tabs>
          </Card>
        </Col>
      </Row>

      {/* 相关案例 */}
      {caseDetail.related_cases && caseDetail.related_cases.length > 0 && (
        <Card
          title="相关案例"
          className="mt-4"
        >
          <Row gutter={16}>
            {caseDetail.related_cases.map((relatedCase) => (
              <Col span={8} key={relatedCase.id}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => navigate(`${getProjectPath()}/finetune/notebooks/case/${relatedCase.id}`)}
                >
                  <Card.Meta
                    title={relatedCase.name}
                    description={relatedCase.description}
                  />
                  <div className="mt-2">
                    <Tag color={getDifficultyColor(relatedCase.difficulty)}>
                      {getDifficultyText(relatedCase.difficulty)}
                    </Tag>
                    <Tag>{relatedCase.category_name}</Tag>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 克隆案例弹窗 */}
      <CloneCaseModal
        visible={cloneModalVisible}
        onCancel={handleCloneCancel}
        onSuccess={handleCloneSuccess}
        caseDetail={caseDetail}
      />
    </div>
  )
}

export default NotebookCaseDetailPage
