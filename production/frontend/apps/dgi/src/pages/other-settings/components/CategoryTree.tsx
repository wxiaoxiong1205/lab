import type { Key } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Radio,
  Tree,
  TreeSelect,
  message,
} from 'antd'
import { EditOutlined, EyeOutlined } from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import { useRequest } from 'ahooks'
import { apiSensitiveCategoriesList } from '@/services/api'
import { useTransform } from '@/locales'

interface CategoryNode extends DataNode {
  id: number
  name: string
  risk_level?: string
  parent_id?: string
  word_count?: number
  children?: CategoryNode[]
}

interface CategoryFormData {
  name?: string
  risk_level?: string
  parent_id?: string
}

interface CategoryStatistics {
  total_count: number
  categories: CategoryNode[]
}

// 递归获取所有节点的 name 和它们的父节点 name
const getAllNodeIds = (nodes: CategoryNode[]): number[] => {
  const ids = new Set<number>()

  const traverse = (node: CategoryNode) => {
    ids.add(node.id)
    if (node.children?.length) {
      node.children.forEach((child) => {
        ids.add(child.id)
        traverse(child)
      })
    }
  }

  nodes.forEach(traverse)
  return Array.from(ids)
}

// 递归过滤节点
const filterTreeNodes = (
  nodes: CategoryNode[],
  searchValue: string,
): CategoryNode[] => {
  const search = searchValue.toLowerCase()
  const filterNodes = nodes
    .map((node) => {
      // 处理子节点
      const filteredChildren = node.children
        ? filterTreeNodes(node.children, searchValue)
        : []

      // 如果当前节点匹配或者有匹配的子节点，则保留
      if (
        node.name.toLowerCase().includes(search)
        || filteredChildren.length > 0
      ) {
        return {
          ...node,
          children: filteredChildren,
        }
      }
      return null
    })
    .filter((node) => node !== null)
  return filterNodes as CategoryNode[]
}

const ALL_ID = -1

// 合并分类统计数据到树形结构
const mergeCategoryStatistics = (
  treeNodes: CategoryNode[],
  statistics: CategoryStatistics | null,
): CategoryNode[] => {
  if (!statistics || !statistics.categories) {
    return treeNodes
  }

  const statsMap = new Map<number, number>()

  const collectStats = (nodes: CategoryNode[]) => {
    nodes.forEach((node) => {
      statsMap.set(node.id, node.word_count || 0)
      if (node.children) {
        collectStats(node.children)
      }
    })
  }

  collectStats(statistics.categories)

  const updateTreeWithStats = (nodes: CategoryNode[]): CategoryNode[] => {
    return nodes.map((node) => {
      const wordCount = statsMap.get(node.id)
      return {
        ...node,
        word_count: wordCount !== undefined ? wordCount : node.word_count,
        children: node.children ? updateTreeWithStats(node.children) : undefined,
      }
    })
  }

  return updateTreeWithStats(treeNodes)
}

export default function CategoryTree({
  onSelect,
  categoryStatistics,
}: {
  onSelect: (node: Key[]) => void
  categoryStatistics?: CategoryStatistics | null
}) {
  const [searchValue, setSearchValue] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([ALL_ID])
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingNode, setEditingNode] = useState<CategoryNode | null>(null)
  const [form] = Form.useForm<CategoryFormData>()
  const { $t } = useTransform()
  // 添加查看弹窗的状态
  const [viewModalVisible, setViewModalVisible] = useState(false)
  const [viewingNode, setViewingNode] = useState<CategoryNode | null>(null)

  // 获取分类树数据
  const { data: originTreeData = [], loading } = useRequest(
    () =>
      apiSensitiveCategoriesList().then((res) => {
        return [
          {
            id: ALL_ID,
            name: '全部',
            key: ALL_ID,
            children: res.data,
          },
        ]
      }),
    {
      onError: (error: Error) => {
        message.error('获取分类数据失败')
        console.error('获取分类数据失败:', error)
      },
    },
  )

  const treeData = useMemo(() => {
    const mergedData = mergeCategoryStatistics(originTreeData, categoryStatistics || null)

    if (mergedData.length > 0 && categoryStatistics) {
      mergedData[0] = {
        ...mergedData[0],
        word_count: categoryStatistics.total_count || 0,
      }
    }

    if (!searchValue) return mergedData
    return filterTreeNodes(mergedData, searchValue)
  }, [originTreeData, categoryStatistics, searchValue])

  const handleSearch = (value: string) => {
    const trimmedValue = value.trim()
    setSearchValue(trimmedValue)

    // 在搜索时更新展开的节点
    if (trimmedValue && originTreeData.length > 0) {
      const allKeys = getAllNodeIds(originTreeData)
      setExpandedKeys(allKeys)
    }
    else {
      setExpandedKeys([ALL_ID])
    }
  }

  const handleEdit = (node: CategoryNode) => {
    setEditingNode(node)
    form.setFieldsValue({
      name: node.title as string,
      risk_level: node.risk_level,
      parent_id: node.parent_id,
    })
    setEditModalVisible(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      // TODO: 调用API保存数据
      setEditModalVisible(false)
      form.resetFields()
    }
    catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleNodeClick = (selectedKeys: Key[], info: any) => {
    onSelect(selectedKeys)
  }

  const handleView = (node: CategoryNode) => {
    setViewingNode(node)
    setViewModalVisible(true)
  }

  const renderTreeNodes = (nodes: CategoryNode[]): DataNode[] =>
    nodes.map((node) => {
      return {
        ...node,
        title: (
          <div className="flex items-center group">
            <span>{node.name}</span>
            {node.word_count !== undefined && (
              <span className="ml-2 text-gray-400 text-xs">
                (
                {node.word_count}
                )
              </span>
            )}
            {!node.parent_id && node.id !== ALL_ID && node.children && (
              <Button
                type="link"
                icon={<EyeOutlined />}
                className="opacity-0 group-hover:opacity-100 ml-2"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation()
                  handleView(node)
                }}
              />
            )}
            {false && (
              <Button
                type="link"
                icon={<EditOutlined />}
                className="opacity-0 group-hover:opacity-100 ml-2"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation()
                  handleEdit(node)
                }}
              />
            )}
          </div>
        ),
        children:
          node.children && node.children.length
            ? renderTreeNodes(node.children)
            : undefined,
      }
    })

  // 初始化和数据加载后展开"全部"节点
  useEffect(() => {
    if (originTreeData.length > 0) {
      setExpandedKeys([ALL_ID])
    }
  }, [originTreeData])

  return (
    <div className="w-[280px] border-r border-gray-200 p-4">
      <h3 className="text-lg font-medium mb-4">{$t('敏感类别')}</h3>
      <Input
        value={searchValue}
        placeholder={$t('搜索类别')}
        allowClear
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          handleSearch(e.target.value)}
        className="mb-4"
      />
      <Tree
        treeData={renderTreeNodes(treeData)}
        className="category-tree"
        onSelect={handleNodeClick}
        defaultSelectedKeys={[ALL_ID]}
        expandedKeys={expandedKeys}
        onExpand={setExpandedKeys}
        autoExpandParent
        fieldNames={{
          // title: "name",
          key: 'id',
        }}
      />

      {/* 编辑弹窗 */}
      <Modal
        title={`${editingNode?.parent_id ? $t('编辑') : $t('编辑一级类别')}`}
        open={editModalVisible}
        onOk={handleSave}
        onCancel={() => {
          setEditModalVisible(false)
          form.resetFields()
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={$t('类别名称')}
            rules={[
              { required: true, message: $t('请输入类别名称') },
              {
                pattern: /^[\u4E00-\u9FA5a-zA-Z0-9_]{1,64}$/,
                message: $t('只允许包含中文、字母、数字和下划线，64字符以内'),
              },
            ]}
          >
            <Input placeholder={$t('请输入类别名称')} />
          </Form.Item>

          {!editingNode?.parent_id && (
            <Form.Item
              name="risk_level"
              label={$t('敏感类别')}
              rules={[{ required: true, message: $t('请选择敏感类别') }]}
            >
              <Radio.Group>
                <Radio value="low">低风险</Radio>
                <Radio value="medium">中风险</Radio>
                <Radio value="high">高风险</Radio>
              </Radio.Group>
            </Form.Item>
          )}

          {editingNode?.parent_id && (
            <Form.Item
              name="parent_id"
              label={$t('上级类别')}
              rules={[{ required: true, message: $t('请选择上级类别') }]}
            >
              <TreeSelect
                loading={loading}
                treeData={treeData?.[0]?.children ?? []}
                placeholder={$t('请选择上级类别')}
                treeDefaultExpandAll
                treeTitleRender={(nodeData: CategoryNode) => nodeData.name}
                fieldNames={{
                  label: 'name',
                  value: 'id',
                }}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 查看弹窗 */}
      <Modal
        title="查看类别详情"
        open={viewModalVisible}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setViewModalVisible(false)
              setViewingNode(null)
            }}
          >
            关闭
          </Button>,
        ]}
        onCancel={() => {
          setViewModalVisible(false)
          setViewingNode(null)
        }}
      >
        <div className="space-y-4">
          <div>
            <div className="text-gray-500 mb-1">{$t('类别名称')}</div>
            <div>{viewingNode?.name}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">{$t('敏感级别')}</div>
            <div>{viewingNode?.risk_level ?? '--'}</div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
