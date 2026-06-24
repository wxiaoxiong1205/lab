import React, { useEffect, useState } from 'react'
import { Card, Col, Empty, Row, Spin, Tabs, Typography } from 'antd'
import { BranchesOutlined, BulbOutlined, DatabaseOutlined, ExperimentOutlined, PartitionOutlined, PictureOutlined, RocketOutlined, ScanOutlined, SearchOutlined, TableOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { PresetModelTemplate } from '../mock/mockPresetModelService'
import { TechnicalDomain, TemplateCategory } from '../mock/mockPresetModelService'
import TaskCreateModal from '../components/preset-model/TaskCreateModal'
import PresetModelTaskList from './PresetModelTaskList'
import './PresetModelMarket.css'

const { Title, Paragraph } = Typography
const { TabPane } = Tabs
// 难度级别类型
type DifficultyLevel = 'easy' | 'medium' | 'hard'
// 扩展模板接口，为了适应新的UI需求
interface ExtendedTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  domain: TechnicalDomain
  difficulty: DifficultyLevel
  supportedFormats: string[]
  supportedModels: string[]
  defaultConfig: {
    epochs: number
    learningRate: number
    batchSize: number
    validationSplit: number
  }
  estimatedTime: string
  tags: string[]
  icon: string
  popularity: number
}
// 扩展模板数据以适应新的分类结构
const extendedTemplates: ExtendedTemplate[] = [
  // 通用模型 - 计算机视觉
  {
    id: 'cv_single_classification',
    name: '图像分类-单图单标签',
    description: '对单张图像进行单一类别分类，适用于基础的图像识别任务',
    category: TemplateCategory.GENERAL,
    domain: TechnicalDomain.COMPUTER_VISION,
    difficulty: 'easy' as DifficultyLevel,
    supportedFormats: ['JPG', 'PNG', 'BMP'],
    supportedModels: ['ResNet50', 'VGG16', 'MobileNet'],
    defaultConfig: {
      epochs: 50,
      learningRate: 0.001,
      batchSize: 32,
      validationSplit: 0.2,
    },
    estimatedTime: '2-4小时',
    tags: ['图像分类', '单标签', '深度学习'],
    icon: 'PictureOutlined',
    popularity: 95,
  },
  {
    id: 'cv_multi_classification',
    name: '图像分类-单图多标签',
    description: '对单张图像进行多个类别标签预测，适用于复杂场景的图像识别',
    category: TemplateCategory.GENERAL,
    domain: TechnicalDomain.COMPUTER_VISION,
    difficulty: 'medium' as DifficultyLevel,
    supportedFormats: ['JPG', 'PNG', 'BMP'],
    supportedModels: ['ResNet101', 'DenseNet121', 'EfficientNet'],
    defaultConfig: {
      epochs: 60,
      learningRate: 0.0005,
      batchSize: 16,
      validationSplit: 0.2,
    },
    estimatedTime: '3-6小时',
    tags: ['图像分类', '多标签', '深度学习'],
    icon: 'PictureOutlined',
    popularity: 88,
  },
  {
    id: 'cv_object_detection',
    name: '物体检测',
    description: '检测图像中的物体位置和类别，输出边界框和置信度',
    category: TemplateCategory.GENERAL,
    domain: TechnicalDomain.COMPUTER_VISION,
    difficulty: 'hard' as DifficultyLevel,
    supportedFormats: ['JPG', 'PNG', 'BMP'],
    supportedModels: ['YOLO v5', 'Faster R-CNN', 'SSD'],
    defaultConfig: {
      epochs: 100,
      learningRate: 0.001,
      batchSize: 8,
      validationSplit: 0.2,
    },
    estimatedTime: '6-12小时',
    tags: ['目标检测', '边界框', '深度学习'],
    icon: 'ScanOutlined',
    popularity: 92,
  },
  {
    id: 'cv_instance_segmentation',
    name: '图像分割-实例分割',
    description: '将图像中的每个物体实例进行精确分割，区分不同实例',
    category: TemplateCategory.GENERAL,
    domain: TechnicalDomain.COMPUTER_VISION,
    difficulty: 'hard' as DifficultyLevel,
    supportedFormats: ['JPG', 'PNG', 'BMP'],
    supportedModels: ['Mask R-CNN', 'YOLACT', 'SOLOv2'],
    defaultConfig: {
      epochs: 120,
      learningRate: 0.0005,
      batchSize: 4,
      validationSplit: 0.2,
    },
    estimatedTime: '8-16小时',
    tags: ['实例分割', '语义理解', '深度学习'],
    icon: 'PartitionOutlined',
    popularity: 78,
  },
  {
    id: 'cv_semantic_segmentation',
    name: '图像分割-语义分割',
    description: '对图像中的每个像素进行类别标注，生成语义分割图',
    category: TemplateCategory.GENERAL,
    domain: TechnicalDomain.COMPUTER_VISION,
    difficulty: 'hard' as DifficultyLevel,
    supportedFormats: ['JPG', 'PNG', 'BMP'],
    supportedModels: ['U-Net', 'DeepLab v3+', 'PSPNet'],
    defaultConfig: {
      epochs: 100,
      learningRate: 0.001,
      batchSize: 8,
      validationSplit: 0.2,
    },
    estimatedTime: '6-12小时',
    tags: ['语义分割', '像素级', '深度学习'],
    icon: 'BranchesOutlined',
    popularity: 82,
  },
  // 通用模型 - 机器学习
  {
    id: 'ml_tabular_detection',
    name: '表格数据检测',
    description: '基于表格数据进行异常检测、分类或回归任务',
    category: TemplateCategory.GENERAL,
    domain: TechnicalDomain.STRUCTURED_DATA,
    difficulty: 'easy' as DifficultyLevel,
    supportedFormats: ['CSV', 'Excel', 'JSON'],
    supportedModels: ['XGBoost', 'Random Forest', 'LightGBM'],
    defaultConfig: {
      epochs: 100,
      learningRate: 0.1,
      batchSize: 256,
      validationSplit: 0.2,
    },
    estimatedTime: '1-2小时',
    tags: ['表格数据', '机器学习', '特征工程'],
    icon: 'TableOutlined',
    popularity: 90,
  },
  // 行业模型示例
  {
    id: 'industry_finance_risk',
    name: '金融风控模型',
    description: '基于用户行为和信用数据进行风险评估和欺诈检测',
    category: TemplateCategory.INDUSTRY,
    domain: TechnicalDomain.STRUCTURED_DATA,
    difficulty: 'medium' as DifficultyLevel,
    supportedFormats: ['CSV', 'JSON'],
    supportedModels: ['XGBoost', 'Neural Network', 'Ensemble'],
    defaultConfig: {
      epochs: 150,
      learningRate: 0.05,
      batchSize: 128,
      validationSplit: 0.2,
    },
    estimatedTime: '2-4小时',
    tags: ['金融', '风控', '异常检测'],
    icon: 'BulbOutlined',
    popularity: 85,
  },
  {
    id: 'industry_medical_diagnosis',
    name: '医疗影像诊断',
    description: '基于医疗影像数据进行疾病诊断和病变检测',
    category: TemplateCategory.INDUSTRY,
    domain: TechnicalDomain.COMPUTER_VISION,
    difficulty: 'hard' as DifficultyLevel,
    supportedFormats: ['DICOM', 'JPG', 'PNG'],
    supportedModels: ['ResNet3D', 'DenseNet3D', 'U-Net'],
    defaultConfig: {
      epochs: 200,
      learningRate: 0.0001,
      batchSize: 4,
      validationSplit: 0.2,
    },
    estimatedTime: '12-24小时',
    tags: ['医疗', '影像诊断', '深度学习'],
    icon: 'ExperimentOutlined',
    popularity: 75,
  },
]
// 第一级tab配置
const primaryTabs = [
  { key: 'general', name: '通用模型', icon: <DatabaseOutlined /> },
  { key: 'industry', name: '行业模型', icon: <BulbOutlined /> },
]
// 第二级tab配置
const secondaryTabs = {
  general: [
    {
      key: 'computer_vision',
      name: '计算机视觉模型',
      icon: <PictureOutlined />,
      templates: ['cv_single_classification', 'cv_multi_classification', 'cv_object_detection', 'cv_instance_segmentation', 'cv_semantic_segmentation'],
    },
    {
      key: 'machine_learning',
      name: '机器学习模型',
      icon: <TableOutlined />,
      templates: ['ml_tabular_detection'],
    },
  ],
  industry: [
    {
      key: 'finance',
      name: '金融行业模型',
      icon: <BulbOutlined />,
      templates: ['industry_finance_risk'],
    },
    {
      key: 'medical',
      name: '医疗行业模型',
      icon: <ExperimentOutlined />,
      templates: ['industry_medical_diagnosis'],
    },
  ],
  nas: [
    {
      key: 'auto_search',
      name: '自动搜索模型',
      icon: <SearchOutlined />,
      templates: [],
    },
  ],
}
// 模板卡片组件
const TemplateCard: React.FC<{
  template: ExtendedTemplate
  onSelect: (template: ExtendedTemplate) => void
}> = ({ template, onSelect }) => {
  const getIconComponent = (iconName: string) => {
    const iconMap = {
      PictureOutlined: <PictureOutlined className="text-[16px] text-[var(--lab-color-brand-primary)]" />,
      ScanOutlined: <ScanOutlined className="text-[16px] text-[var(--lab-color-success)]" />,
      PartitionOutlined: <PartitionOutlined className="text-[16px] text-[var(--lab-color-warning)]" />,
      BranchesOutlined: <BranchesOutlined className="text-[16px] text-[var(--lab-color-purple)]" />,
      TableOutlined: <TableOutlined className="text-[16px] text-[var(--lab-color-cyan)]" />,
      BulbOutlined: <BulbOutlined className="text-[16px] text-[var(--lab-color-magenta)]" />,
      ExperimentOutlined: <ExperimentOutlined className="text-[16px] text-[var(--lab-color-danger)]" />,
    }
    return iconMap[iconName] || <RocketOutlined className="text-[16px] text-[var(--lab-color-brand-primary)]" />
  }
  return (
    <Card hoverable size="small" className="template-card h-[100px] cursor-pointer" bodyStyle={{ padding: '8px' }} onClick={() => onSelect(template)}>
      <div className="flex flex-col items-center text-center h-full">
        {/* 居中图片 */}
        <div className="mb-1.5">
          {getIconComponent(template.icon)}
        </div>

        {/* 标题 */}
        <Title level={5} className="mb-1 text-[12px] font-medium overflow-hidden text-ellipsis whitespace-nowrap w-full">
          {template.name}
        </Title>

        {/* 描述 */}
        <Paragraph
          className="preset-template-description mb-[0] text-[10px] overflow-hidden"
        >
          {template.description}
        </Paragraph>
      </div>
    </Card>
  )
}
// 主页面组件
const PresetModelMarket: React.FC = () => {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<ExtendedTemplate[]>([])
  const [loading] = useState(false)
  const [primaryActiveTab, setPrimaryActiveTab] = useState('general')
  const [secondaryActiveTab, setSecondaryActiveTab] = useState('computer_vision')
  // 任务创建弹窗状态
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<PresetModelTemplate | null>(null)
  // 初始化扩展模板数据
  useEffect(() => {
    setTemplates(extendedTemplates)
  }, [])
  // 处理第一级tab切换
  const handlePrimaryTabChange = (key: string) => {
    setPrimaryActiveTab(key)
    // 切换第一级tab时，自动选择第一个第二级tab
    const firstSecondaryTab = secondaryTabs[key]?.[0]?.key
    if (firstSecondaryTab) {
      setSecondaryActiveTab(firstSecondaryTab)
    }
  }
  // 处理模板选择 - 打开创建任务弹窗
  const handleTemplateSelect = (template: ExtendedTemplate) => {
    // 将ExtendedTemplate转换为PresetModelTemplate
    const presetTemplate: PresetModelTemplate = {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      domain: template.domain,
      tags: template.tags,
      icon: template.icon,
      difficulty: template.difficulty,
      estimatedTime: template.estimatedTime,
      supportedModels: template.supportedModels,
      supportedDataFormats: template.supportedFormats,
      defaultConfig: {
        epochs: template.defaultConfig.epochs,
        learningRate: template.defaultConfig.learningRate,
        batchSize: template.defaultConfig.batchSize,
      },
      requirements: {
        minGpu: 'GTX 1060',
        minMemory: '8GB',
        minStorage: '50GB',
      },
      examples: [],
    }
    setSelectedTemplate(presetTemplate)
    setCreateModalVisible(true)
  }
  // 处理任务创建成功
  const handleTaskCreateSuccess = (taskId: string) => {
    setCreateModalVisible(false)
    setSelectedTemplate(null)
    // 跳转到任务详情页面或刷新列表
    navigate(`/preset-model/task/${taskId}`)
  }
  // 获取当前显示的模板
  const getCurrentTemplates = () => {
    const currentSecondaryTab = secondaryTabs[primaryActiveTab]?.find((tab) => tab.key === secondaryActiveTab)
    if (!currentSecondaryTab)
      return []
    return templates.filter((template) => currentSecondaryTab.templates.includes(template.id))
  }
  const currentTemplates = getCurrentTemplates()
  return (
    <div className="preset-model-market h-[100vh] flex flex-col p-[16px]">
      {/* 上半部分：模板选择区域 */}
      <div className="preset-template-panel overflow-hidden mb-[16px] flex flex-col">
        {/* 页面头部 - 压缩 */}
        <div className="page-header mb-3 text-center">
          <Title className="m-[0_0_6px_0]" level={4}>
            <RocketOutlined />
            {' '}
            小模型调参
          </Title>
          <Paragraph className="m-0 text-[12px] text-[var(--lab-color-text-muted)]">
            专为企业固定场景的算法和轻量级AI模型设计的快速调参任务，方便快速落地上手使用。
          </Paragraph>
        </div>

        {/* 第一级Tab - 压缩 */}
        <Card size="small" className="mb-2">
          <Tabs activeKey={primaryActiveTab} onChange={handlePrimaryTabChange} tabBarStyle={{ marginBottom: '0' }}>
            {primaryTabs.map((tab) => (
              <TabPane
                tab={(
                  <span>
                    {tab.icon}
                    <span className="ml-2">{tab.name}</span>
                  </span>
                )}
                key={tab.key}
              />
            ))}
          </Tabs>
        </Card>

        {/* 第二级Tab和内容 - 自适应剩余高度 */}
        <Card
          size="small"
          className="flex-1 overflow-hidden flex flex-col"
          bodyStyle={{
            padding: '16px',
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Tabs activeKey={secondaryActiveTab} onChange={setSecondaryActiveTab} tabBarStyle={{ marginBottom: '8px' }}>
            {secondaryTabs[primaryActiveTab]?.map((tab) => (
              <TabPane
                tab={(
                  <span>
                    {tab.icon}
                    <span className="ml-2">{tab.name}</span>
                  </span>
                )}
                key={tab.key}
              />
            ))}
          </Tabs>

          {/* 模板列表 - 自适应剩余高度 */}
          <div className="flex-1 overflow-auto">
            <Spin spinning={loading}>
              {currentTemplates.length > 0 ? (
                <Row gutter={[8, 8]}>
                  {currentTemplates.map((template) => (
                    <Col key={template.id} xs={12} sm={8} lg={6} xl={4}>
                      <TemplateCard template={template} onSelect={handleTemplateSelect} />
                    </Col>
                  ))}
                </Row>
              ) : (
                <Empty
                  className="p-[20px_0]"
                  description={primaryActiveTab === 'nas'
                    ? '神经网络搜索功能开发中...'
                    : '该分类下暂无模板'}
                />
              )}
            </Spin>
          </div>
        </Card>
      </div>

      {/* 下半部分：任务列表 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <PresetModelTaskList activeSecondaryTab={secondaryActiveTab} />
      </div>

      {/* 任务创建弹窗 */}
      <TaskCreateModal
        visible={createModalVisible}
        onClose={() => {
          setCreateModalVisible(false)
          setSelectedTemplate(null)
        }}
        onSuccess={handleTaskCreateSuccess}
        initialTemplate={selectedTemplate || undefined}
      />
    </div>
  )
}
export default PresetModelMarket
