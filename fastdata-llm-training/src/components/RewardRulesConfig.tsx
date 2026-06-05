import React, { useState } from 'react'
import {
  Card,
  Form,
  Typography,
  Space,
  Alert,
  Button,
} from 'antd'
import {
  SafetyCertificateOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import type { RewardRuleType } from '../types/training'
import ResumableUpload from './ResumableUpload'

const { Text } = Typography

/** 预设奖励规则列表 */
const PRESET_RULES: Array<{
  value: RewardRuleType
  label: string
  description: string
  example: string
}> = [
  {
    value: 'string_exact',
    label: '字符串相等',
    description: '模型输出与标准答案完全一致时得分',
    example: '正确答案：Beijing\n模型输出：Beijing\n得分：1',
  },
  {
    value: 'string_contains',
    label: '字符串包含',
    description: '模型输出包含指定关键词或短语时得分',
    example: '关键词：「北京」\n模型输出：北京是首都\n得分：1',
  },
  {
    value: 'string_similarity',
    label: '字符串相似度',
    description: '模型输出与标准答案相似度超过阈值时得分（基于编辑距离）',
    example: '标准答案：Hello World\n模型输出：Hello World!\n相似度：95%\n得分：0.95',
  },
  {
    value: 'math_answer',
    label: '数学答案匹配',
    description: '自动提取并比对数学计算结果（支持带单位的答案）',
    example: '标准答案：42\n模型输出：答案是42米\n自动提取数字：42\n匹配：✓ 得分：1',
  },
  {
    value: 'logic_reasoning',
    label: '逻辑推理匹配',
    description: '验证模型输出的推理结论是否与标注一致（支持think标签）',
    example: 'think标签内验证推理过程\nanswer标签内验证最终答案\n两者匹配：得分1',
  },
]

/** 自定义奖励函数参考模板 */
const CUSTOM_CODE_TEMPLATE = `import torch
import os

def reward_func(queries, prompts, labels):
    """
    Calculate rewards based on queries, prompts, and labels.

    Args:
        queries (list of str): Prompts + responses.即模型真实的输入和输出。
        prompts (list of str): Input prompts.模型的输入。
        labels (list of str): Ground truth answers.标注的模型的输出。

    Returns:
        torch.Tensor: A tensor of rewards.
    """
    rewards = []
    outputs = []
    max_prompt_len = int(os.environ.get('MAX_PROMPT_LEN', '1024'))

    for query, prompt in zip(queries, prompts):
        # Extract content by removing the prompt from the query
        max_len = min(len(prompt), max_prompt_len)
        output = query[max_len:].strip()
        outputs.append(output)

    # Rule-based reward process here
    # Ensure process() is defined and returns a list of rewards
    rewards = process(outputs, labels)

    # Convert rewards to a tensor
    return torch.tensor(rewards, dtype=torch.float)
`

interface RewardRulesConfigProps {
  value?: {
    type: RewardRuleType
    customFile?: UploadFile
  }
  onChange?: (value: { type: RewardRuleType; customFile?: UploadFile } | undefined) => void
}

const RewardRulesConfig: React.FC<RewardRulesConfigProps> = ({ value, onChange }) => {
  const [ruleType, setRuleType] = useState<RewardRuleType>(value?.type ?? 'string_exact')
  const [customFile, setCustomFile] = useState<UploadFile | undefined>(value?.customFile)

  const handleRuleTypeChange = (type: RewardRuleType) => {
    setRuleType(type)
    onChange?.({ type, customFile: type === 'custom' ? customFile : undefined })
  }

  const handleCustomFileChange = (file: UploadFile | null) => {
    const nextFile = file ?? undefined
    setCustomFile(nextFile)
    onChange?.({ type: ruleType, customFile: nextFile })
  }

  const handleDownloadTemplate = () => {
    if (typeof window === 'undefined') {
      return
    }

    const blob = new Blob([CUSTOM_CODE_TEMPLATE], { type: 'text/x-python;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'grpo-custom-reward-template.py'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div style={{ marginTop: 16 }}>
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <SafetyCertificateOutlined style={{ fontSize: 16, color: '#7c3aed' }} />
        <Text strong style={{ fontSize: 15, color: '#0f172a' }}>奖励规则配置</Text>
      </div>

      {/* 规则类型选择 */}
      <Form.Item
        label="奖励规则类型"
        tooltip="选择预设规则或自定义代码，预设规则开箱即用，自定义规则需编写 reward_func 函数"
        style={{ marginBottom: 16 }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {PRESET_RULES.map(rule => (
            <Card
              key={rule.value}
              size="small"
              style={{
                borderRadius: 10,
                border: ruleType === rule.value ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                background: ruleType === rule.value ? 'rgba(124, 58, 237, 0.04)' : '#fff',
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
              styles={{ body: { padding: '12px 16px' } }}
              onClick={() => handleRuleTypeChange(rule.value)}
            >
              <Space>
                <CheckCircleOutlined style={{ color: ruleType === rule.value ? '#7c3aed' : '#94a3b8' }} />
                <Text strong style={{ color: ruleType === rule.value ? '#7c3aed' : '#0f172a' }}>
                  {rule.label}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>— {rule.description}</Text>
              </Space>
            </Card>
          ))}

          {/* 自定义代码选项 */}
          <Card
            size="small"
            style={{
              borderRadius: 10,
              border: ruleType === 'custom' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
              background: ruleType === 'custom' ? 'rgba(124, 58, 237, 0.04)' : '#fff',
              transition: 'all 0.2s',
              cursor: 'pointer',
            }}
            styles={{ body: { padding: '12px 16px' } }}
            onClick={() => handleRuleTypeChange('custom')}
          >
            <Space>
              <CodeOutlined style={{ color: ruleType === 'custom' ? '#7c3aed' : '#94a3b8' }} />
              <Text strong style={{ color: ruleType === 'custom' ? '#7c3aed' : '#0f172a' }}>
                自定义代码
              </Text>
            </Space>

            {ruleType === 'custom' && (
              <div style={{ marginTop: 12 }}>
                <Alert
                  type="info"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  message="自定义奖励规则要求"
                  description={
                    <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12, color: '#64748b', lineHeight: 1.8 }}>
                      <li>函数名必须为 <Text code>reward_func(queries, prompts, labels)</Text></li>
                      <li>返回类型必须为 <Text code>torch.Tensor</Text>（dtype=float）</li>
                      <li>支持 Python 3.10 版本</li>
                      <li>仅支持上传单个 .py 文件</li>
                    </ul>
                  }
                  style={{ marginBottom: 12 }}
                />

                <ResumableUpload
                  accept=".py"
                  title="上传 .py 文件"
                  hint="仅支持上传单个 .py 文件；失败或取消后可继续上传"
                  value={customFile}
                  onChange={handleCustomFileChange}
                />

                <div
                  style={{
                    marginTop: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid #dbeafe',
                    background: '#f8fbff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <Space direction="vertical" size={2}>
                    <Text strong style={{ color: '#0f172a' }}>参考模板</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      下载 Python 模板文件后补充奖励逻辑，再上传为本次任务的自定义奖励函数。
                    </Text>
                  </Space>
                  <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
                    下载模板
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </Space>
      </Form.Item>
    </div>
  )
}

export default RewardRulesConfig
