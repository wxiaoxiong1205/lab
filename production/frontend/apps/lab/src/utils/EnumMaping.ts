const FINETUNE_VISIBLE_TRAINING_TYPES: string[] = ['text-generation', 'image-understanding']
export default FINETUNE_VISIBLE_TRAINING_TYPES

export const ModelTypeMapping = (key: string) => {
  switch (key) {
    case 'text-generation':
      return { text: '文本生成', disabled: false, disabledTooltip: '文本生成' }
    case 'image-understanding':
      return { text: '图像理解', disabled: false, disabledTooltip: '图像理解' }
    case 'image-generation':
      return { text: '图像生成', disabled: true, disabledTooltip: '图像生成(即将上线)' }
    case 'audio-generation':
      return { text: '音频生成', disabled: true, disabledTooltip: '音频生成(即将上线)' }
    case 'audio-understanding':
      return { text: '音频理解', disabled: true, disabledTooltip: '音频理解(即将上线)' }
    case 'video-generation':
      return { text: '视频生成', disabled: true, disabledTooltip: '视频生成(即将上线)' }
    case 'video-understanding':
      return { text: '视频理解', disabled: true, disabledTooltip: '视频理解(即将上线)' }
    case 'multimodal':
      return { text: '多模态', disabled: true, disabledTooltip: '多模态(即将上线)' }
    default:
      return { text: key, disabled: false, disabledTooltip: key }
  }
}

export const TrainingMethodTypeMapping = (key: string) => {
  switch (key) {
    case 'sft':
      return { text: 'SFT', disabled: false, disabledTooltip: '基于有监督数据进行指令跟随训练' }
    case 'rft':
      return { text: 'RFT', disabled: true, disabledTooltip: 'RFT' }
    case 'rft-grpo':
      return { text: 'RFT-GRPO', disabled: false, disabledTooltip: '基于奖励规则进行GRPO强化微调' }
    case 'dpo':
      return { text: 'DPO', disabled: false, disabledTooltip: '基于人类偏好数据进行模型优化(即将上线)' }
    case 'kto':
      return { text: 'KTO', disabled: true, disabledTooltip: 'KTO' }
    case 'rlhf':
      return { text: 'RLHF', disabled: true, disabledTooltip: 'RLHF' }
    case 'post-train':
      return { text: 'POST-TRAIN', disabled: true, disabledTooltip: 'POST-TRAIN' }
    default:
      return { text: key, disabled: true, disabledTooltip: key }
  }
}

export const TrainingTaskStatusMapping = (key: string) => {
  switch (key) {
    case 'running':
      return { color: 'blue', text: '运行中', icon: 'PlayCircleOutlined' }
    case 'completed':
      return { color: 'green', text: '已完成', icon: 'CheckCircleOutlined' }
    case 'failed':
      return { color: 'red', text: '失败', icon: 'ExclamationCircleOutlined' }
    case 'cancelled':
      return { color: 'gray', text: '已取消', icon: 'StopOutlined' }
    case 'pending':
      return { color: 'blue', text: '待运行', icon: 'PlayCircleOutlined' }
    case 'creating':
      return { color: 'blue', text: '创建', icon: 'PlayCircleOutlined' }
    case '创建':
      return { color: 'blue', text: '创建', icon: 'PlayCircleOutlined' }
    case '排队中':
      return { color: 'blue', text: '排队中', icon: 'PlayCircleOutlined' }
    case '准备中':
      return { color: 'blue', text: '准备中', icon: 'PlayCircleOutlined' }
    case '停止':
      return { color: 'gray', text: '已停止', icon: 'StopOutlined' }
    case '失败':
      return { color: 'red', text: '失败', icon: 'ExclamationCircleOutlined' }
    case '已完成':
      return { color: 'green', text: '已完成', icon: 'CheckCircleOutlined' }
    case '运行中':
      return { color: 'blue', text: '运行中', icon: 'PlayCircleOutlined' }
    default:
      return { color: 'default', text: key, icon: 'ExclamationCircleOutlined' }
  }
}

// 评估方法映射
export const EvaluationMethodMapping: Record<string, string> = {
  referee: '裁判员评估',
  basic_metric: '基础指标评估',
  all: '裁判员评估，基础指标评估',
  manual: '人工评估',
}
