import React from 'react'
import { Affix, Button, Form, Input, InputNumber, Radio, Table, Typography } from 'antd'
import type { FormInstance } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { MemberRow } from '../types'
import './MultiPersonCreatePage.css'

const { Title, Text } = Typography
const { TextArea } = Input

interface MultiPersonCreatePageProps {
  form: FormInstance
  totalDataCount: number
  totalAnnotationAssigned: number
  totalReviewAssigned: number
  annotationMembers: MemberRow[]
  reviewMembers: MemberRow[]
  annotationColumns: ColumnsType<MemberRow>
  reviewColumns: ColumnsType<MemberRow>
  onAddMember: (type: 'annotation' | 'review') => void
  onCancel: () => void
  onConfirm: () => void
}

const MultiPersonCreatePage: React.FC<MultiPersonCreatePageProps> = ({
  form,
  totalDataCount,
  totalAnnotationAssigned,
  totalReviewAssigned,
  annotationMembers,
  reviewMembers,
  annotationColumns,
  reviewColumns,
  onAddMember,
  onCancel,
  onConfirm,
}) => (
  <div className="min-h-screen bg-white p-6">
    <Title level={3} className="mb-2">
      创建多人标注任务
    </Title>
    <Text type="secondary" className="mb-6 block">
      当前页面为静态样式页，仅保留多人标注创建表单与布局展示，不接入接口和业务提交逻辑。
    </Text>

    <Form
      form={form}
      layout="vertical"
      initialValues={{
        override: 'new_version',
        sourceType: 'existed_dataset',
        sampling_ratio: 100,
        task_name: '机器学习分类标注任务',
        task_description: '用于模型训练前的数据标注样式演示。',
      }}
    >
      <Title level={5} className="mb-3">
        基本信息
      </Title>
      <Form.Item name="task_name" label="任务名称">
        <Input placeholder="请输入标注任务名称" maxLength={64} showCount />
      </Form.Item>
      <Form.Item name="task_description" label="任务描述">
        <TextArea placeholder="请输入任务描述" rows={3} maxLength={200} showCount />
      </Form.Item>

      <Title level={5} className="mb-3 mt-6">
        数据选择
      </Title>
      <Form.Item name="sourceType">
        <Radio.Group>
          <Radio value="existed_dataset">已有数据集</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item label="选择数据集">
        <Input value="机器学习训练样本集 / V3" readOnly />
      </Form.Item>
      <div className="mb-4">
        <Text type="secondary">
          数据量:
          {totalDataCount}
          {' '}
          条
        </Text>
      </div>

      <Title level={5} className="mb-2 mt-4">
        处理后数据集
      </Title>
      <Form.Item name="override">
        <Radio.Group>
          <Radio value="new_version">新增版本</Radio>
        </Radio.Group>
      </Form.Item>
      <div className="mb-6">
        <Text>数据集名称: 机器学习训练样本集-V4</Text>
      </div>

      <Title level={5} className="mb-2 mt-6">
        选择标注成员
      </Title>
      <Table columns={annotationColumns} dataSource={annotationMembers} pagination={false} rowKey="key" />
      <div className="mb-6 mt-2 flex items-center justify-end gap-3">
        <Text type="secondary">
          分配标注数量/总计标注数量:
          {' '}
          {totalAnnotationAssigned}
          /
          {totalDataCount}
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onAddMember('annotation')}>
          添加标注成员
        </Button>
      </div>

      <div className="mb-2 mt-6 flex items-center gap-4">
        <Title level={5} className="!mb-0">
          选择审核成员
        </Title>
        <Form.Item name="sampling_ratio" className="!mb-0">
          <InputNumber min={1} max={100} precision={0} addonAfter="%" className="w-[240px]" />
        </Form.Item>
      </div>
      <Text type="secondary" className="mb-2 block">
        当前为 mock 配置，仅展示审核抽检比例与成员分配样式。
      </Text>
      <Table columns={reviewColumns} dataSource={reviewMembers} pagination={false} rowKey="key" />
      <div className="mb-20 mt-2 flex items-center justify-end gap-3">
        <Text type="secondary">
          分配审核数量/总计审核数量:
          {' '}
          {totalReviewAssigned}
          /
          {totalDataCount}
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onAddMember('review')}>
          添加审核成员
        </Button>
      </div>
    </Form>

    <div className="machine-annotation-footer-wrap">
      <Affix offsetBottom={0}>
        <div className="flex justify-start gap-3 bg-white py-2">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={onConfirm}>确定</Button>
        </div>
      </Affix>
    </div>
  </div>
)

export default MultiPersonCreatePage
