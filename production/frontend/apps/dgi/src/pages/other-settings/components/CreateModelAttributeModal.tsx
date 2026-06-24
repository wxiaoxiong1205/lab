import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Radio, Select, Switch, message } from 'antd'
import { HolderOutlined } from '@ant-design/icons'
import TextArea from 'antd/es/input/TextArea'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTransform } from '@/locales'
import { ModelAttributeService } from '@/services/modelAttributeApi'

export interface ValueType {
  id?: number
  name: string
  input_type: string
  description: string
  option_values: { value: string }[]
  required: boolean
  multi_select: boolean
}

interface Props {
  open: boolean
  initValue?: ValueType | undefined
  type: 'model' | 'api'
  onSuccess: () => void
  onClose: () => void
}

const SectionTitle = ({ title }: { title: string }) => (
  <p className="border-l-4 border-blue-500 pl-2 mb-4 font-medium">{title}</p>
)

// -------- 基本信息 --------
const BasicInfo = () => {
  const { $t } = useTransform()
  return (
    <>
      <SectionTitle title={$t('基本信息')} />
      <Form.Item label={$t('属性名称')} name="name" rules={[{ required: true, message: $t('请输入属性名称') }]}>
        <Input />
      </Form.Item>
      <Form.Item label={$t('输入方式')} name="input_type" rules={[{ required: true, message: $t('请选择输入方式') }]}>
        <Select options={[{ label: $t('下拉框'), value: 'select' }]} />
      </Form.Item>
      <Form.Item label={$t('属性描述')} name="description">
        <TextArea maxLength={255} showCount placeholder={$t('请输入属性描述')} />
      </Form.Item>
    </>
  )
}

// -------- 选项值单行（可拖拽）--------
const SortableOptionRow = ({ id, name, remove, $t }: {
  id: string
  name: number
  remove: (index: number) => void
  $t: (key: string) => string
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-start gap-2 !mb-1"
    >
      <div className="w-10 flex justify-center mt-2">
        <HolderOutlined className="!text-blue-500 cursor-move leading-none" {...attributes} {...listeners} />
      </div>
      <Form.Item name={[name, 'value']} className="!mb-2 flex-1">
        <Input maxLength={50} showCount />
      </Form.Item>
      <Button type="link" danger size="small" className="mt-0.5 !w-14" onClick={() => remove(name)}>
        {$t('删除')}
      </Button>
    </div>
  )
}

// -------- 选项值 --------
const OptionValues = () => {
  const { $t } = useTransform()
  const sensors = useSensors(useSensor(PointerSensor))

  return (
    <Form.List name="option_values">
      {(fields, { add, remove, move }) => {
        const handleDragEnd = (e: DragEndEvent) => {
          const { active, over } = e
          if (over && active.id !== over.id) {
            const oldIndex = fields.findIndex((f) => String(f.key) === active.id)
            const newIndex = fields.findIndex((f) => String(f.key) === over.id)
            move(oldIndex, newIndex)
          }
        }
        return (
          <>
            {fields.length > 0 && (
              <div className="flex gap-2 mb-2 text-xs text-gray-400">
                <span className="w-10 text-center">{$t('排序')}</span>
                <span className="flex-1 text-center">{$t('选项值')}</span>
                <span className="w-14 text-center">{$t('操作')}</span>
              </div>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map((f) => String(f.key))} strategy={verticalListSortingStrategy}>
                {fields.map((field) => (
                  <SortableOptionRow
                    key={field.key}
                    id={String(field.key)}
                    name={field.name}
                    remove={remove}
                    $t={$t}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <Button block onClick={() => add()}>
              {$t('添加')}
            </Button>
          </>
        )
      }}
    </Form.List>
  )
}

// -------- 输入限制 --------
const InputLimits = ({ $t }: { $t: (key: string) => string }) => {
  return (
    <>
      <SectionTitle title={$t('输入限制')} />
      <Form.Item label={$t('是否必填')} name="required" initialValue>
        <Radio.Group>
          <Radio value>{$t('是')}</Radio>
          <Radio value={false}>{$t('否')}</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item label={$t('是否多选')} name="multi_select" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item label={$t('选项值')}>
        <OptionValues />
      </Form.Item>
    </>
  )
}

// -------- Modal --------
export default function CreateModelAttributeModal({
  open,
  initValue,
  type,
  onClose,
  onSuccess,
}: Props) {
  const [form] = Form.useForm<ValueType>()
  const { $t } = useTransform()
  const isEdit = !!initValue
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    if (initValue) {
      form.setFieldsValue(initValue)
    }
    else {
      form.resetFields()
      form.setFieldsValue({
        required: true,
        multi_select: false,
      })
    }
  }, [open, initValue, form])

  const onSubmit = () => {
    setLoading(true)
    form.validateFields().then((values) => {
      const options = values?.option_values?.filter(
        (item) => item.value !== undefined && item.value !== '',
      ) ?? []
      if (options.length === 0) {
        message.error($t('请至少添加一个选项值'))
        return
      }
      const payload = {
        ...values,
        option_values: options.map((item: { value: string }) => item.value),
        owner_type: type,
      }
      if (isEdit) {
        ModelAttributeService.update(String(initValue?.id), payload).then(() => {
          message.success($t('编辑属性成功'))
          onSuccess()
        }).catch((error) => {
          message.error(error.message)
        })
      }
      else {
        ModelAttributeService.create(payload).then(() => {
          message.success($t('新增属性成功'))
          onSuccess()
        }).catch((error) => {
          message.error(error.message)
        })
      }
    }).finally(() => {
      setLoading(false)
    })
  }

  return (
    <Modal
      title={isEdit ? $t('编辑属性') : $t('新增属性')}
      open={open}
      onCancel={onClose}
      okText={$t('确定')}
      cancelText={$t('取消')}
      width={560}
      confirmLoading={loading}
      onOk={onSubmit}
      destroyOnHidden
    >
      <Form form={form} layout="horizontal" labelCol={{ span: 5 }} className="pt-4">
        <BasicInfo />
        <InputLimits $t={$t} />
      </Form>
    </Modal>
  )
}
