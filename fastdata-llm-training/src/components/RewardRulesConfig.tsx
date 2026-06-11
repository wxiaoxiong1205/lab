import React, { useEffect, useState } from 'react'
import {
  Typography,
  Space,
  Alert,
  Button,
} from 'antd'
import {
  SafetyCertificateOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import type { RewardRuleType } from '../types/training'
import ResumableUpload from './ResumableUpload'

const { Text } = Typography

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
  const [customFile, setCustomFile] = useState<UploadFile | undefined>(value?.customFile)

  useEffect(() => {
    if (value?.type !== 'custom') {
      onChange?.({ type: 'custom', customFile })
    }
  }, [customFile, onChange, value?.type])

  const handleCustomFileChange = (file: UploadFile | null) => {
    const nextFile = file ?? undefined
    setCustomFile(nextFile)
    onChange?.({ type: 'custom', customFile: nextFile })
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

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
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
      </Space>
    </div>
  )
}

export default RewardRulesConfig
