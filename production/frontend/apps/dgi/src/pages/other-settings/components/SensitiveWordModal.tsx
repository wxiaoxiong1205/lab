import { Button, Form, Input, Modal, TreeSelect, message } from 'antd'
import { useEffect } from 'react'
import { useRequest } from 'ahooks'
import {
  apiSensitiveCategoriesList,
  apiSensitiveWordAdd,
  apiSensitiveWordUpdate,
} from '@/services/api'
import { useTransform } from '@/locales'

interface SensitiveWordModalProps {
  open: boolean
  initialData: {
    word_id: string
    original_word: string
    creator: string
    updated_at: string
    category: string
    enhance: boolean
    category_id: number
  } | null
  onCancel: () => void
  onSuccess: () => void
}

interface TreeNode {
  id: number
  name: string
  children?: TreeNode[]
  isLeaf?: boolean
}

export default function SensitiveWordModal({
  open,
  initialData,
  onCancel,
  onSuccess,
}: SensitiveWordModalProps) {
  const [form] = Form.useForm()
  const { $t } = useTransform()
  const isEdit = !!initialData

  useEffect(() => {
    if (open) {
      if (isEdit) {
        form.setFieldsValue({
          original_word: initialData.original_word,
          category_id: initialData.category_id,
        })
      }
      else {
        form.resetFields()
      }
    }
  }, [open, isEdit, initialData, form])

  const { run: addWord, loading: addLoading } = useRequest(
    apiSensitiveWordAdd,
    {
      manual: true,
      onSuccess: () => {
        message.success('新增成功')
        onSuccess()
        onCancel()
      },
      onError: (error) => {
        message.error(error?.message)
      },
    },
  )

  const { run: updateWord, loading: updateLoading } = useRequest(
    apiSensitiveWordUpdate,
    {
      manual: true,
      onSuccess: () => {
        message.success('编辑成功')
        onSuccess()
        onCancel()
      },
    },
  )

  // 获取分类树数据
  const { data: treeData = [], loading: treeLoading } = useRequest(() =>
    apiSensitiveCategoriesList().then((res) => {
      // 处理树形数据，为每个节点添加 isLeaf 属性
      const processTreeData = (nodes: TreeNode[], level = 1): TreeNode[] => {
        return nodes.map((node) => ({
          ...node,
          isLeaf: !node.children,
          disabled: !!node.children,
          children: node.children
            ? processTreeData(node.children, level + 1)
            : undefined,
        }))
      }
      return processTreeData(res.data)
    }),
  )

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      if (isEdit) {
        updateWord({
          word_id: initialData.word_id,
          ...values,
        })
      }
      else {
        addWord({ ...values, enhance: false })
      }
    }
    catch (error) {
      console.error('Validation failed:', error)
    }
  }

  return (
    <Modal
      title={isEdit ? $t('编辑敏感词') : $t('新增敏感词')}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={addLoading || updateLoading}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {$t('取消')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={addLoading || updateLoading}
          onClick={handleOk}
        >
          {$t('确定')}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" name="sensitive_word_form">
        <Form.Item
          name="original_word"
          label={$t('敏感词')}
          rules={[{ required: true, message: $t('请输入敏感词') }]}
        >
          <Input placeholder={$t('请输入敏感词')} />
        </Form.Item>
        <Form.Item
          name="category_id"
          label={$t('敏感词类别')}
          rules={[{ required: true, message: $t('请选择敏感词类别') }]}
        >
          <TreeSelect
            showSearch
            loading={treeLoading}
            treeData={treeData}
            filterTreeNode={(text, node) => node.name.includes(text)}
            placeholder={$t('请选择敏感词类别')}
            treeTitleRender={(nodeData: any) => nodeData.name}
            fieldNames={{
              label: 'name',
              value: 'id',
            }}
            disabled={treeLoading}
            treeDefaultExpandAll
            treeNodeFilterProp="name"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
