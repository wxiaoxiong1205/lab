import type {
  CreateTrainingDatasetRequest,
  RoleConversation,
  TrainingDataset,
  TrainingDatasetSearchParams,
} from '../types'

// 示例Role(user+assistant)对话数据
const sampleConversations: RoleConversation[] = [
  {
    conversations: [
      { from: 'system', value: '你是一个专业的AI助手，能够帮助用户解答各种问题。' },
      { from: 'user', value: '请解释什么是机器学习？' },
      { from: 'assistant', value: '机器学习是人工智能的一个重要分支，它使计算机能够在不被明确编程的情况下学习和改进。通过分析大量数据，机器学习算法可以识别模式，做出预测，并随着接触更多数据而提高性能。' },
      { from: 'user', value: '能举个具体的例子吗？' },
      { from: 'assistant', value: '当然！一个经典的例子是电子邮件垃圾邮件过滤器。系统通过分析数千封标记为"垃圾邮件"和"非垃圾邮件"的邮件，学习识别垃圾邮件的特征，如特定关键词、发送者模式等，然后能够自动识别新的垃圾邮件。' },
    ],
  },
  {
    conversations: [
      { from: 'system', value: '你是一个专业的编程助手。' },
      { from: 'user', value: '如何在Python中创建一个类？' },
      { from: 'assistant', value: '在Python中创建类使用class关键字。基本语法如下：\n\nclass MyClass:\n    def __init__(self, name):\n        self.name = name\n    \n    def greet(self):\n        return f"Hello, {self.name}!"' },
    ],
  },
  {
    conversations: [
      { from: 'system', value: '你是一个劳动合同领域的专业法律顾问。' },
      { from: 'user', value: '公司要求我签订竞业限制协议，这合法吗？' },
      { from: 'assistant', value: '竞业限制协议在满足一定条件下是合法的。根据《劳动合同法》规定，用人单位可以与负有保密义务的劳动者在劳动合同或保密协议中约定竞业限制条款。但需要满足以下条件：1）您属于高级管理人员、高级技术人员或其他负有保密义务的人员；2）用人单位必须给予经济补偿；3）竞业限制期限不得超过二年；4）限制范围应当合理。如果公司不提供补偿金或限制范围过于宽泛，该协议可能无效。' },
    ],
  },
  {
    conversations: [
      { from: 'system', value: '你是一个劳动合同领域的专业法律顾问。' },
      { from: 'user', value: '试用期内公司可以随时解雇我吗？' },
      { from: 'assistant', value: '不是的。虽然试用期内用人单位解除劳动合同相对容易，但仍需符合法定条件。根据《劳动合同法》第21条和第39条，试用期内用人单位只能在以下情况解除合同：1）证明劳动者不符合录用条件；2）劳动者严重违反规章制度；3）严重失职，营私舞弊；4）被依法追究刑事责任等。用人单位需要有证据证明解除理由，不能无故辞退。如果违法解除，您有权要求继续履行合同或要求经济赔偿。' },
    ],
  },
  {
    conversations: [
      { from: 'system', value: '你是一个劳动合同领域的专业法律顾问。' },
      { from: 'user', value: '加班费应该怎么计算？' },
      { from: 'assistant', value: '加班费的计算标准根据加班时间不同而有所区别：\n\n1. 工作日延长工作时间：按照不低于小时工资标准的150%支付\n2. 休息日工作且不能安排补休：按照不低于日或小时工资标准的200%支付\n3. 法定休假日工作：按照不低于日或小时工资标准的300%支付\n\n小时工资基数=月工资÷21.75÷8（21.75为平均每月计薪天数）\n\n例如：月薪6000元，工作日加班1小时的加班费=6000÷21.75÷8×1.5=51.72元。注意，计算基数应包括基本工资、岗位津贴等，不能只按最低工资标准计算。' },
    ],
  },
  {
    conversations: [
      { from: 'system', value: '你是一个劳动合同领域的专业法律顾问。' },
      { from: 'user', value: '公司拖欠工资怎么办？' },
      { from: 'assistant', value: '面对公司拖欠工资，您可以采取以下维权措施：\n\n1. 先与公司协商，要求按时足额支付工资\n2. 向劳动监察部门投诉举报\n3. 向劳动仲裁委员会申请仲裁\n4. 对仲裁结果不服的，可以向法院起诉\n\n同时要注意：\n- 收集工资拖欠的证据（工资条、银行流水、劳动合同等）\n- 拖欠工资超过30天，可以解除劳动合同并要求经济补偿\n- 公司拖欠工资的，还应支付25%的经济补偿金\n- 维权期间要保留好相关证据和材料\n\n如果情况严重，建议尽快采取法律手段维护自身合法权益。' },
    ],
  },
]

// Mock数据 - 增加更多训练数据集示例
const mockTrainingDatasets: TrainingDataset[] = [
  {
    id: 2,
    project_id: 33,
    name: '技术问答数据集',
    description: '专注于技术领域的问答对话，适用于技术支持和编程助手训练',
    dataset_type: 'training',
    training_type: 'SFT-文本生成',
    format: 'sharegpt',
    file_path: '/datasets/training/tech_qa_dataset.json',
    file_size: 3145728,
    total_samples: 8000,
    conversation_count: 8000,
    data_content: sampleConversations,
    meta_info: {
      language: 'zh-CN',
      domain: 'technology',
      quality_score: 0.92,
    },
    created_at: '2024-01-20T14:30:00Z',
    updated_at: '2024-01-20T14:30:00Z',
  },
  {
    id: 3,
    project_id: 33,
    name: '客服对话数据集',
    description: '客服场景下的对话数据，包含常见问题处理和解决方案',
    dataset_type: 'training',
    training_type: 'SFT-文本生成',
    format: 'sharegpt',
    file_path: '/datasets/training/customer_service_dataset.json',
    file_size: 1572864,
    total_samples: 3000,
    conversation_count: 3000,
    data_content: sampleConversations,
    meta_info: {
      language: 'zh-CN',
      domain: 'customer_service',
      quality_score: 0.88,
    },
    created_at: '2024-01-25T09:15:00Z',
    updated_at: '2024-01-25T09:15:00Z',
  },
  {
    id: 4,
    project_id: 33,
    name: '多轮对话偏好数据集',
    description: '用于DPO训练的偏好对齐数据集，包含好坏回答对比',
    dataset_type: 'training',
    training_type: 'DPO-文本生成',
    format: 'json',
    file_path: '/datasets/training/preference_dataset.json',
    file_size: 4194304,
    total_samples: 2500,
    conversation_count: 2500,
    data_content: [],
    meta_info: {
      language: 'zh-CN',
      domain: 'general',
      quality_score: 0.90,
      preference_type: 'helpfulness',
    },
    created_at: '2024-02-01T16:45:00Z',
    updated_at: '2024-02-01T16:45:00Z',
  },
  {
    id: 5,
    project_id: 33,
    name: '教育问答数据集',
    description: '教育领域的问答数据，涵盖数学、物理、化学等学科',
    dataset_type: 'training',
    training_type: 'SFT-文本生成',
    format: 'sharegpt',
    file_path: '/datasets/training/education_qa_dataset.json',
    file_size: 2621440,
    total_samples: 6000,
    conversation_count: 6000,
    data_content: sampleConversations,
    meta_info: {
      language: 'zh-CN',
      domain: 'education',
      quality_score: 0.94,
      subjects: ['数学', '物理', '化学', '生物'],
    },
    created_at: '2024-02-05T11:20:00Z',
    updated_at: '2024-02-05T11:20:00Z',
  },
  {
    id: 6,
    project_id: 33,
    name: '医疗咨询数据集',
    description: '医疗健康咨询对话数据，用于训练医疗助手模型',
    dataset_type: 'training',
    training_type: 'SFT-文本生成',
    format: 'sharegpt',
    file_path: '/datasets/training/medical_consultation_dataset.json',
    file_size: 3670016,
    total_samples: 7500,
    conversation_count: 7500,
    data_content: sampleConversations,
    meta_info: {
      language: 'zh-CN',
      domain: 'medical',
      quality_score: 0.96,
      medical_fields: ['内科', '外科', '儿科'],
    },
    created_at: '2024-02-10T13:30:00Z',
    updated_at: '2024-02-10T13:30:00Z',
  },
]

/**
 * 训练数据集Mock服务
 */
export const mockTrainingDatasetService = {
  /**
   * 获取训练数据集列表
   */
  async list(params: TrainingDatasetSearchParams = {}) {
    console.log('mockTrainingDatasetService.list called with params:', params)

    let filtered = [...mockTrainingDatasets]

    // 按项目ID过滤
    if (params.project_id) {
      filtered = filtered.filter((dataset) =>
        dataset.project_id === params.project_id,
      )
    }

    // 应用搜索过滤
    if (params.name) {
      filtered = filtered.filter((dataset) =>
        dataset.name.toLowerCase().includes(params.name!.toLowerCase()),
      )
    }

    if (params.dataset_type) {
      filtered = filtered.filter((dataset) =>
        dataset.dataset_type === params.dataset_type,
      )
    }

    if (params.format) {
      filtered = filtered.filter((dataset) =>
        dataset.format === params.format,
      )
    }

    // 应用分页
    const skip = params.skip || 0
    const limit = params.limit || 20
    const paginatedItems = filtered.slice(skip, skip + limit)

    return {
      items: paginatedItems,
      total: filtered.length,
      page: Math.floor(skip / limit) + 1,
      size: limit,
      pages: Math.ceil(filtered.length / limit),
    }
  },

  /**
   * 获取指定ID的训练数据集
   */
  async getById(id: number | string): Promise<TrainingDataset | null> {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id
    const dataset = mockTrainingDatasets.find((d) => d.id === numericId)
    return dataset || null
  },

  /**
   * 创建训练数据集
   */
  async create(projectId: number, data: CreateTrainingDatasetRequest): Promise<TrainingDataset> {
    console.log('mockTrainingDatasetService.create called:', { projectId, data })

    const newDataset: TrainingDataset = {
      id: Math.max(...mockTrainingDatasets.map((d) => d.id)) + 1,
      project_id: projectId,
      name: data.name,
      description: data.description,
      dataset_type: 'training',
      training_type: data.training_type,
      format: data.format,
      file_size: 0,
      total_samples: 0,
      conversation_count: 0,
      data_content: [],
      meta_info: data.meta_info || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    mockTrainingDatasets.push(newDataset)
    return newDataset
  },

  /**
   * 上传文件并创建数据集
   */
  async uploadFile(projectId: number, file: File, data: CreateTrainingDatasetRequest): Promise<TrainingDataset> {
    console.log('mockTrainingDatasetService.uploadFile called:', { projectId, fileName: file.name, data })

    // 模拟文件上传和解析
    const fileSize = file.size
    let parsedContent: unknown[] = []
    let sampleCount = 0
    let conversationCount = 0

    try {
      if (data.format === 'sharegpt') {
        // 模拟解析Role(user+assistant)格式
        const content = await file.text()
        const jsonData = JSON.parse(content)

        if (Array.isArray(jsonData)) {
          parsedContent = jsonData
          sampleCount = jsonData.length
          conversationCount = jsonData.length
        }
      }
    }
    catch (error) {
      console.error('文件解析失败:', error)
      throw new Error('文件格式不正确，请检查文件内容')
    }

    const newDataset: TrainingDataset = {
      id: Math.max(...mockTrainingDatasets.map((d) => d.id)) + 1,
      project_id: projectId,
      name: data.name,
      description: data.description,
      dataset_type: 'training',
      training_type: data.training_type,
      format: data.format,
      file_path: `/uploads/${file.name}`,
      file_size: fileSize,
      total_samples: sampleCount,
      conversation_count: conversationCount,
      data_content: parsedContent,
      meta_info: {
        ...data.meta_info,
        original_filename: file.name,
        upload_time: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    mockTrainingDatasets.push(newDataset)
    return newDataset
  },

  /**
   * 删除训练数据集
   */
  async delete(id: number): Promise<void> {
    const index = mockTrainingDatasets.findIndex((d) => d.id === id)
    if (index > -1) {
      mockTrainingDatasets.splice(index, 1)
    }
  },

  /**
   * 更新训练数据集
   */
  async update(id: number, data: Partial<CreateTrainingDatasetRequest>): Promise<TrainingDataset> {
    const index = mockTrainingDatasets.findIndex((d) => d.id === id)
    if (index === -1) {
      throw new Error('数据集不存在')
    }

    const updatedDataset = {
      ...mockTrainingDatasets[index],
      ...data,
      updated_at: new Date().toISOString(),
    }

    mockTrainingDatasets[index] = updatedDataset
    return updatedDataset
  },
}

// 测试函数 - 可用于验证服务是否正常工作
export const testTrainingDatasetService = async () => {
  console.log('=== 测试训练数据集服务 ===')

  try {
    // 测试获取列表
    const listResult = await mockTrainingDatasetService.list({ project_id: 1 })
    console.log('✅ 获取数据集列表成功:', listResult.items.length, '个数据集')

    // 测试获取单个数据集
    const firstDataset = listResult.items[0]
    if (firstDataset) {
      const singleResult = await mockTrainingDatasetService.getById(firstDataset.id)
      console.log('✅ 获取单个数据集成功:', singleResult?.name)
    }

    console.log('=== 训练数据集服务测试完成 ===')
    return true
  }
  catch (error) {
    console.error('❌ 训练数据集服务测试失败:', error)
    return false
  }
}
