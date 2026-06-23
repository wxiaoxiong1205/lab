import React from 'react'
import { Button, Cascader, Form, Input, Modal, Radio, Typography } from 'antd'
import type { FormInstance } from 'antd'
import type { OnlineDatasetOption } from '../types'
import './onlineCreateModal.css'

const { Text } = Typography

export interface OnlineDatasetCascaderOption {
  value: string | number
  label: string
  isLeaf?: boolean
  disabled?: boolean
  loading?: boolean
  children?: OnlineDatasetCascaderOption[]
}

interface OnlineCreateModalProps {
  form: FormInstance
  open: boolean
  submitLoading?: boolean
  datasetOptions: OnlineDatasetCascaderOption[]
  selectedDataset?: OnlineDatasetOption
  onCancel: () => void
  onDatasetChange: (
    value: Array<string | number>,
    selectedOptions?: OnlineDatasetCascaderOption[],
  ) => void
  onLoadDatasetOptions: (selectedOptions: OnlineDatasetCascaderOption[]) => void
  onSubmit: () => void
}

const OnlineCreateModal: React.FC<OnlineCreateModalProps> = ({
  form,
  open,
  submitLoading = false,
  datasetOptions,
  selectedDataset,
  onCancel,
  onDatasetChange,
  onLoadDatasetOptions,
  onSubmit,
}) => (
  <Modal
    title="在线标注任务"
    open={open}
    onCancel={onCancel}
    footer={null}
    width={600}
    destroyOnClose
  >
    <Form
      form={form}
      layout="vertical"
      className="mt-4"
      initialValues={{
        sourceType: 'existed_dataset',
        override: 'new_version',
        selected_dataset: undefined,
      }}
    >
      <div className="mb-6">
        <Form.Item
          name="task_name"
          label="任务名称"
          rules={[
            { required: true, message: '请输入任务名称' },
            { min: 2, max: 64, message: '长度为 2-64 个字符' },
            { pattern: /^\S+$/, message: '任务名称不允许包含空格' },
          ]}
        >
          <Input placeholder="请输入任务名称" />
        </Form.Item>
      </div>

      <div className="mb-6">
        <Text strong className="mb-3 block text-base">
          数据选择
        </Text>
        <Form.Item name="sourceType" initialValue="existed_dataset">
          <Radio.Group>
            <Radio value="existed_dataset">已有数据集</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          label="选择数据集"
          name="selected_dataset"
          rules={[{ required: true, message: '请选择数据集版本' }]}
        >
          <Cascader
            className="w-full"
            popupClassName="machine-annotation-online-create-cascader-popup"
            disabled={!datasetOptions.length}
            placeholder={datasetOptions.length ? '请选择标注类型 / 标注模板 / 数据集 / 版本' : '暂无可用数据集'}
            options={datasetOptions}
            onChange={onDatasetChange}
            loadData={onLoadDatasetOptions}
            changeOnSelect={false}
            displayRender={(labels, selectedOptions) => {
              const text = selectedOptions && selectedOptions.length < 4
                ? `${labels.join(' / ')} (请继续完成选择)`
                : labels.join(' / ')

              if (selectedOptions && selectedOptions.length < 4) {
                return (
                  <span className="inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap align-bottom">
                    {text}
                  </span>
                )
              }

              return (
                <span className="inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap align-bottom">
                  {text}
                </span>
              )
            }}
          />
        </Form.Item>
        <div className="mt-2">
          <Text type="secondary">
            数据量
            {' '}
            {selectedDataset?.total ?? 0}
            条
          </Text>
        </div>
      </div>

      <div className="mb-6">
        <Text strong className="mb-3 block text-base">
          处理后数据集
        </Text>
        <Form.Item name="override" initialValue="new_version">
          <Radio.Group>
            <Radio value="new_version">新增版本</Radio>
          </Radio.Group>
        </Form.Item>

        <div className="mt-2">
          <Text className="text-sm">
            数据集名称:
            {' '}
            {selectedDataset?.nextVersion ? `${selectedDataset?.nextVersion} (预计)` : '-'}
          </Text>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" onClick={onSubmit} loading={submitLoading}>确定</Button>
      </div>
    </Form>
  </Modal>
)

export default OnlineCreateModal
