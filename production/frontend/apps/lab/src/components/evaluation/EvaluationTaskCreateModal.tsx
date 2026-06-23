import React, { useEffect, useState } from 'react'
import {
  Button,
  Cascader,
  Form,
  Input,
  Modal,
  Select,
  Spin,
  message,
} from 'antd'
import { getTasks } from '../../services/taskService'
import { metricService } from '../../services/metricService'
import { llmConfigApi, testRunApi } from '../../services/api'
import type { LLMConfig } from '../../types'

interface EvaluationTaskCreateModalProps {
  open: boolean
  onCancel: () => void
  onSuccess: () => void
  projectId: number
}

interface TaskOption {
  label: string
  value: number
}

interface DirectoryOption {
  label: string
  value: number
  isLeaf?: boolean
  loading?: boolean
  children?: MetricOption[]
}

interface MetricOption {
  label: string
  value: number
  isLeaf?: boolean
}

interface LLMOption {
  label: string
  value: number
}

interface MetricDirectory {
  id: number
  name: string
  description?: string
  project_id: number
  created_at: string
  updated_at: string
}

interface Metric {
  id: number
  name: string
  description?: string
  type: string
  directory_id?: number
  is_builtin?: boolean
}

interface Task {
  id: number
  name: string
}

const EvaluationTaskCreateModal: React.FC<EvaluationTaskCreateModalProps> = ({
  open,
  onCancel,
  onSuccess,
  projectId,
}) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [taskOptions, setTaskOptions] = useState<TaskOption[]>([])
  const [directoryOptions, setDirectoryOptions] = useState<DirectoryOption[]>(
    [],
  )
  console.log(directoryOptions, 'directoryOptions')
  const [llmOptions, setLlmOptions] = useState<LLMOption[]>([])
  const [llmList, setLlmList] = useState<LLMConfig[]>([])
  const [metrics, setMetrics] = useState<Metric[]>([])

  // 加载任务列表
  useEffect(() => {
    if (!open) return
    setLoading(true)
    getTasks(projectId, { page: 1, size: 99 })
      .then((res) => {
        const items = res.items || []
        setTaskOptions(
          items.map((item) => ({
            label: item.name || `任务${item.id}`,
            value: item.id,
          })),
        )
      })
      .catch(() => message.error('获取任务列表失败'))
      .finally(() => setLoading(false))
  }, [open, projectId])

  // 加载指标目录
  useEffect(() => {
    if (!open) return
    metricService.listMetricDirectories(projectId).then((res) => {
      const items = (res.data.items as MetricDirectory[]) || res.data || []
      setDirectoryOptions(
        items.map((dir) => ({
          label: dir.name,
          value: dir.id,
          isLeaf: false,
        })),
      )
    })
  }, [open, projectId])

  // 加载评估模型
  useEffect(() => {
    if (!open) return
    llmConfigApi
      .list(projectId, {
        page: 1,
        size: 99,
      })
      .then((res) => {
        setLlmList(res.items as LLMConfig[])
        setLlmOptions(
          res.items.map((item) => ({
            label: item.name || item.model || `模型${item.id}`,
            value: item.id,
          })),
        )
      })
      .catch(() => message.error('获取评估模型失败'))
  }, [open, projectId])

  // 动态加载目录下指标
  const loadMetrics = async (selectedOptions: DirectoryOption[]) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]
    targetOption.loading = true
    try {
      const res = await metricService.listMetrics(
        projectId,
        targetOption.value,
      )
      const items: Metric[] = res.data.items || []
      setMetrics([...metrics, ...items])
      targetOption.children = items.map((metric) => ({
        label: metric.name,
        value: metric.id,
        isLeaf: true,
      }))
    }
    catch {
      targetOption.children = []
      message.error('加载指标失败')
    }
    targetOption.loading = false
    setDirectoryOptions([...directoryOptions])
  }

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      testRunApi
        .create(projectId, {
          name: values.name,
          project_id: projectId,
          evaluate_id: values.evaluate_id,
          metrics: values.metrics.map(([, metricId]) => {
            return metrics.find((m) => m.id === metricId)
          }),
          evaluate_model: llmList.find(
            (m) => m.id === values.evaluate_model,
          ) as any,
          remark: values.remark,
        })
        .then((res) => {
          message.success('创建成功')
          onSuccess()
        })
    }
    catch {
      // 校验失败
    }
  }

  const handleCancel = () => {
    form.resetFields()
    onCancel()
  }

  return (
    <Modal
      open={open}
      title="创建评估任务"
      onCancel={handleCancel}
      onOk={handleOk}
      destroyOnClose
      maskClosable={false}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          onClick={handleOk}
          loading={loading}
        >
          创建
        </Button>,
      ]}
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical">
          <Form.Item
            label="任务名称"
            name="name"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="请输入任务名称" />
          </Form.Item>
          <Form.Item
            label="答案生成任务"
            name="evaluate_id"
            rules={[{ required: true, message: '请选择答案生成任务' }]}
          >
            <Select
              placeholder="请选择答案生成任务"
              options={taskOptions}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '')
                  .toLowerCase()
                  .includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item
            label="评估指标"
            name="metrics"
            rules={[{ required: true, message: '请选择评估指标' }]}
          >
            <Cascader
              options={directoryOptions}
              loadData={loadMetrics}
              multiple
              changeOnSelect={false}
              showCheckedStrategy={Cascader.SHOW_CHILD}
              placeholder="请选择评估指标（可多选）"
              showSearch
            />
          </Form.Item>
          <Form.Item
            label="评估模型"
            name="evaluate_model"
            rules={[{ required: true, message: '请选择评估模型' }]}
          >
            <Select
              placeholder="请选择评估模型"
              options={llmOptions}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '')
                  .toLowerCase()
                  .includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea placeholder="请输入备注" rows={3} />
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  )
}

export default EvaluationTaskCreateModal
