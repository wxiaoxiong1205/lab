import React from 'react'
import { Button, Card, Col, Divider, Row, Steps, Typography, message } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiOutlined, AppstoreOutlined, BookOutlined, ClusterOutlined, DatabaseOutlined, EditOutlined, ExperimentOutlined, FormOutlined, RocketOutlined, ThunderboltOutlined } from '@ant-design/icons'
import useI18n from '../hooks/useI18n'
import { useProjectStore } from '../stores/projectStore'
import { useAuthStore } from '../stores/authStore'
import { collectAllowedPaths, getEffectiveUserMenus, normalizePath } from '../utils/permission'
import { withBasePath } from '../utils/path'
import './styles/HomePage.css'

const { Title, Paragraph, Text } = Typography
const { Step } = Steps
/**
 * 项目首页组件
 * 向用户展示AI模型全生命周期开发平台的主要功能和工作流程，帮助用户快速上手
 */
const HomePage: React.FC = () => {
  const { projectId } = useParams<{
    projectId: string
  }>()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const { userMenus } = useAuthStore()
  const effectiveUserMenus = getEffectiveUserMenus(userMenus)
  const baseUrl = `/project/${projectId}`
  // 全生命周期工作流步骤
  const workflowSteps = [
    {
      title: '数据管理',
      description: '统一纳管训练、测试与推理数据，支持多格式批量导入与版本追溯，构建高可用数据资产库',
      icon: <DatabaseOutlined />,
      link: `${baseUrl}/datasets`,
    },
    {
      title: '数据标注',
      description: '集成自动标注与多人协同机制，实现“AI 辅助+人工校验”闭环',
      icon: <EditOutlined />,
      link: `${baseUrl}/data-annotation`,
    },
    {
      title: '数据处理',
      description: '一键完成缺失值清洗、去重、增强与分布洞察等数据处理，持续优化训练集',
      icon: <RocketOutlined />,
      link: `${baseUrl}/data-cleaning`,
    },
    {
      title: '模型训练',
      description: '可视化配置文本/图像生成、理解等任务，内置SFT、DPO等训练模板，可提高大模型训练效率',
      icon: <AppstoreOutlined />,
      link: `${baseUrl}/training`,
    },
    {
      title: '模型管理',
      description: '统一管理训练产生的模型，支持快速配置以支持模型后续评估和指标对比',
      icon: <ExperimentOutlined />,
      link: `${baseUrl}/model`,
    },
    {
      title: '模型服务',
      description: '支持大模型API能力接入，或将模型发布为在线服务',
      icon: <BookOutlined />,
      link: `${baseUrl}/service/inference/external`,
    },
    {
      title: '模型评估',
      description: '多维度评估模型效果，自动生成评估报告，助力模型迭代决策',
      icon: <ClusterOutlined />,
      link: `${baseUrl}/effect-evaluation`,
    },
  ]
  // 更新用例场景，反映全生命周期能力
  const useCaseCards = [
    {
      title: '端到端模型开发',
      description: '从数据准备到模型评估的完整开发流程，支持迭代优化',
      icon: <RocketOutlined className="text-[32px]" />,
    },
    {
      title: '大模型微调训练',
      description: '基于Kubernetes的分布式训练，支持7B-70B参数大模型微调',
      icon: <ClusterOutlined className="text-[32px]" />,
    },
    {
      title: '数据质量管控',
      description: '专业数据标注，清洗，增强能力，确保训练数据质量和一致性',
      icon: <EditOutlined className="text-[32px]" />,
    },
    {
      title: '模型效果评估',
      description: '多维度评估指标，支持模型对比和A/B测试',
      icon: <ExperimentOutlined className="text-[32px]" />,
    },
    {
      title: '协作研发环境',
      description: '在线Notebook环境，支持团队协作和资源共享',
      icon: <BookOutlined className="text-[32px]" />,
    },
    {
      title: '模型管理',
      description: '完整的模型生命周期管理，支持版本追溯',
      icon: <ThunderboltOutlined className="text-[32px]" />,
    },
  ]
  const handleLink = (step: {
    title: string
    link: string
    icon: React.ReactNode
    description: string
  }) => {
    // 检查是否有项目
    if (!projectId || !currentProject) {
      message.warning('请先创建或选择一个项目')
      return
    }
    // 检查菜单权限：只有存在菜单数据中的路径才允许跳转
    if (effectiveUserMenus && effectiveUserMenus.length > 0) {
      // 标准化路径，移除项目ID前缀
      const normalizedPath = normalizePath(step.link)
      // 收集所有允许访问的路径
      const allowedPaths = collectAllowedPaths(effectiveUserMenus)
      // 检查是否有精确匹配
      const hasExactMatch = allowedPaths.has(normalizedPath)
      // 检查是否有前缀匹配（支持子路由）
      const hasPrefixMatch = Array.from(allowedPaths).some((path) => normalizedPath.startsWith(`${path}/`) || normalizedPath.startsWith(`${path}?`))
      if (!hasExactMatch && !hasPrefixMatch) {
        message.warning('您没有权限访问该功能')
        return
      }
    }
    navigate(step.link)
  }
  return (
    <div
      className="p-[20px_0]"
      style={{
        background: '#f5f5f5',
      }}
    >
      <div className="text-center mb-10">
        <Title level={2}>{t('欢迎使用Deepexi大模型开发平台')}</Title>
        <Paragraph>从数据准备到模型评估，大模型全生命周期管理</Paragraph>
      </div>

      {/* 快速开始 */}
      <Card title="快速开始指南" className="mb-6" variant="borderless">
        <div className="homepage-steps-wrapper">
          <Steps current={-1} direction="horizontal" responsive>
            {workflowSteps.map((step, index) => (
              <Step
                key={index}
                title={(
                  <span className="homepage-step-title" onClick={() => handleLink(step)}>
                    <Text strong>{step.title}</Text>
                  </span>
                )}
                description={(
                  <div className="homepage-step-description">
                    <Paragraph>{step.description}</Paragraph>
                  </div>
                )}
                icon={step.icon}
              />
            ))}
          </Steps>
        </div>
      </Card>

      {/* 主要工作流程 */}
      <Card title="AI模型全生命周期开发流程" className="mb-6" variant="borderless">
        <div className="flex justify-center mb-4">
          <img
            src={withBasePath('/workflow-diagram.png')}
            alt="AI Model Lifecycle Workflow"
            className="max-w-full h-auto"
            onError={(e) => {
            // 如果图片加载错误，显示备用文本
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
            }}
          />
        </div>
        {/* <Paragraph>
          平台提供完整的AI模型开发生命周期支持，包括数据管理、标注、训练、管理、评估等各个环节。
          支持从数据准备到模型部署的端到端工作流程，帮助AI工程师高效完成模型开发任务。
        </Paragraph> */}

        {/* <div style={{ margin: "16px 0" }}>
          <Text strong>开发流程指导</Text>
          <ul style={{ paddingLeft: 24 }}>
            <li>数据管理：统一纳管训练、测试与推理数据，支持多格式批量导入与版本追溯，构建高可用数据资产库</li>
            <li>数据标注：集成自动标注与多人协同机制，实现“AI 辅助+人工校验”闭环</li>
            <li>数据处理：一键完成缺失值清洗、去重、增强与分布洞察等数据处理，持续优化训练集。</li>
            <li>模型训练：可视化配置文本/图像生成、理解等任务，内置SFT、DPO等训练模板，可提高大模型训练效率</li>
            <li>模型管理：统一管理训练产生的模型，支持快速配置以支持模型后续评估</li>
            <li>模型服务：支持大模型API能力接入，或将模型发布为在线服务</li>
            <li>模型评估：多维度评估模型效果，自动生成评估报告，助力模型迭代决策</li>
          </ul>
        </div> */}
      </Card>

      {/* 用例场景 */}
      <Card title="平台核心能力" variant="borderless">
        <Row gutter={[16, 16]}>
          {useCaseCards.map((card, index) => (
            <Col xs={24} sm={12} lg={8} key={index}>
              <Card className="h-full" hoverable>
                <div className="text-center mb-4">
                  {card.icon}
                </div>
                <Title level={4} className="text-center">
                  {card.title}
                </Title>
                <Paragraph className="text-center">{card.description}</Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 帮助和支持 */}
      {/* <Divider />
        <div style={{ textAlign: "center", margin: "24px 0" }}>
          <Paragraph>需要帮助？查看我们的文档或联系支持。</Paragraph>
          <Button type="link" onClick={() => window.location.href = '/docs/product-planning'}>技术文档</Button>
          <Button type="link">技术支持</Button>
        </div> */}
    </div>
  )
}
export default HomePage
