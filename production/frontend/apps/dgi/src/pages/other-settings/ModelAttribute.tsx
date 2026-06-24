import { useRequest } from 'ahooks'
import { Button, Col, Form, Input, Modal, Popconfirm, Row, Select, Table, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { ValueType } from './components/CreateModelAttributeModal'
import CreateModelAttributeModal from './components/CreateModelAttributeModal'
import { ModelAttributeService } from '@/services/modelAttributeApi'
import { useTransform } from '@/locales'

interface AttributeItem {
  id: number
  name: string
  input_type: string
  description: string
  option_values?: string
  required?: boolean
  multi_select?: boolean
}

const useInputTypeOptions = () => {
  const { $t } = useTransform()
  return [
    { label: $t('全部'), value: '' },
    { label: $t('下拉框'), value: 'select' },
  ]
}

export default function ModelAttribute({
  type,
}: {
  type: 'model' | 'api'
}) {
  const { $t } = useTransform()
  const navigate = useNavigate()
  const inputTypeOptions = useInputTypeOptions()

  const [form] = Form.useForm()
  const name = Form.useWatch('name', form)
  const inputType = Form.useWatch('input_type', form)
  const [params, setParams] = useState({
    page_number: 1,
    page_size: 10,
  })

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [initValue, setInitValue] = useState<ValueType | undefined>(undefined)

  const {
    data: attributeList,
    loading: attributeListLoading,
    refresh: attributeRefresh,
  } = useRequest(
    () => ModelAttributeService.list({
      ...params,
      name: name || undefined,
      input_type: inputType || undefined,
      owner_type: type,
    }),
    {
      staleTime: 0,
      refreshDeps: [name, inputType, params],
    },
  )

  const onCreateAttributeSuccess = () => {
    setInitValue(undefined)
    setCreateModalOpen(false)
    attributeRefresh()
  }
  const onEditAttribute = (record: AttributeItem) => {
    setInitValue({
      id: record.id,
      name: record.name,
      input_type: record.input_type,
      description: record.description,
      option_values: JSON.parse(record?.option_values)?.map((item) => ({ value: item })) ?? [],
      required: record?.required ?? false,
      multi_select: record?.multi_select ?? false,
    })
    setCreateModalOpen(true)
  }
  const onCloseCreateAttributeModal = () => {
    setInitValue(undefined)
    setCreateModalOpen(false)
  }
  const onDeleteAttribute = (record: AttributeItem) => {
    Modal.confirm({
      title: $t('确认删除该属性？'),
      content: $t('删除属性也会一并删除使用对象已录入的属性数据，请确认是否删除'),
      onOk: () => {
        ModelAttributeService.delete(String(record.id)).then(() => {
          attributeRefresh()
        })
      },
    })
  }
  const onBack = () => {
    if (type === 'model') {
      navigate('/channel-manage/model-manage')
    }
    else {
      navigate('/api-service')
    }
  }

  const columns: ColumnsType<AttributeItem> = [
    {
      title: $t('属性名称'),
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: $t('输入方式'),
      dataIndex: 'input_type',
      key: 'input_type',
      width: 150,
      render: (v) => inputTypeOptions.find((o) => o.value === v)?.label || v,
    },
    {
      title: $t('属性描述'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: { showTitle: false },
      render: (v) => (
        <Tooltip title={v} placement="topLeft">
          {v || '-'}
        </Tooltip>
      ),
    },
    {
      title: $t('操作'),
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <div className="flex gap-2">
          <Button type="link" size="small" onClick={() => onEditAttribute(record)}>{$t('编辑')}</Button>
          <Button type="link" size="small" danger onClick={() => onDeleteAttribute(record)}>{$t('删除')}</Button>
        </div>
      ),
    },
  ]

  return (
    <div className="bg-white min-h-full rounded-lg p-6">
      <div className="flex items-center gap-4 mb-4">
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={onBack}
          className="p-0"
        />
        <h1 className="text-xl m-0">{$t('属性管理')}</h1>
      </div>

      <div className="flex items-start justify-between">
        <Form form={form} className="flex-1!">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="name">
                <Input placeholder={$t('请输入属性名称')} allowClear />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="input_type">
                <Select
                  placeholder={$t('输入方式')}
                  options={inputTypeOptions}
                  allowClear
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
        <Button type="primary" onClick={() => setCreateModalOpen(true)}>{$t('新增属性')}</Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={attributeList?.items || []}
        loading={attributeListLoading}
        pagination={{
          current: params.page_number || 1,
          pageSize: params.page_size || 10,
          total: attributeList?.total || 0,
          showTotal: (total) => $t('总共 {total} 条', { total }),
          onChange: (page, pageSize) => {
            setParams((prev) => ({
              ...prev,
              page_number: page,
              page_size: pageSize,
            }))
          },
        }}
        scroll={{ x: 'max-content' }}
      />

      <CreateModelAttributeModal
        open={createModalOpen}
        onClose={onCloseCreateAttributeModal}
        onSuccess={onCreateAttributeSuccess}
        initValue={initValue}
        type={type}
      />
    </div>
  )
}
