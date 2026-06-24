import { useEffect, useMemo, useState } from 'react'
import { Button, Collapse, Input, InputNumber, Modal, Select, Space, Switch, Table, message } from 'antd'
import { DeleteOutlined, EyeOutlined, MinusSquareFilled, PlusOutlined, PlusSquareFilled, ThunderboltOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import TextArea from 'antd/es/input/TextArea'

export type ParamType = 'header' | 'request_param' | 'response_param'

interface ApiParamsViewProps {
  type: ParamType
  title?: string
  initialValue?: ParamListType[]
  canPushChild?: boolean
  action?: 'create' | 'edit' | 'test'
  dataType?: ('string' | 'number' | 'boolean' | 'object' | 'array')[]
  onChange: (params: ParamListType[], type: ParamType) => void
}

export interface ParamListType {
  name: string
  data_type: string
  default_value: any // 默认值，可以是任意类型（字符串、数字、数组、对象等）
  binding: boolean // 是否必选
  desc?: string // 描述
  inference?: boolean // 是否推理
  child: ParamListType[]
}

// 扁平化后的数据项
interface FlatParamItem {
  data: ParamListType
  path: number[]
  level?: number
  hasChildren: boolean
  isExpanded: boolean
}

const createEmptyParam = (patch: Partial<ParamListType> = {}): ParamListType => ({
  name: '',
  data_type: 'string',
  default_value: '',
  binding: false,
  desc: '',
  inference: false,
  child: [],
  ...patch,
})

const isContainerType = (type: string) => type === 'array' || type === 'object'

const hasNodeName = (item: ParamListType) => item.name && item.name.trim() !== ''

const shouldKeepNode = (item: ParamListType, parentType?: string) =>
  parentType === 'array' || hasNodeName(item)

const createParamFromValue = (name: string, value: any): ParamListType => {
  if (Array.isArray(value)) {
    return createEmptyParam({
      name,
      data_type: 'array',
      child: value.map((child) => createParamFromValue('', child)),
    })
  }

  if (value && typeof value === 'object') {
    return createEmptyParam({
      name,
      data_type: 'object',
      child: Object.keys(value).map((key) => createParamFromValue(key, value[key])),
    })
  }

  if (typeof value === 'number') {
    return createEmptyParam({
      name,
      data_type: 'number',
      default_value: value,
    })
  }

  if (typeof value === 'boolean') {
    return createEmptyParam({
      name,
      data_type: 'boolean',
      default_value: value,
    })
  }

  return createEmptyParam({
    name,
    data_type: 'string',
    default_value: value ?? '',
  })
}

export default function ApiParamsView(props: ApiParamsViewProps) {
  const {
    type,
    title = type,
    onChange,
    canPushChild = false,
    action = 'create',
    initialValue,
    dataType = ['string', 'number', 'boolean', 'object', 'array'],
  } = props

  const dataTypeOptions = dataType.map((item) => ({
    label: item,
    value: item,
  }))

  const collectAllExpandedKeys = (
    data: ParamListType[],
    basePath: number[] = [],
  ): string[] => {
    const keys: string[] = []

    data.forEach((item, index) => {
      const currentPath = [...basePath, index]
      const pathKey = currentPath.join('-')

      if (item.child && item.child.length > 0) {
        keys.push(pathKey)
        keys.push(...collectAllExpandedKeys(item.child, currentPath))
      }
    })

    return keys
  }

  const [params, setParams] = useState<ParamListType[]>(() =>
    initialValue?.length ? initialValue : [createEmptyParam()],
  )

  const [expandedRowKeys, setExpandedRowKeys] = useState(() =>
    initialValue?.length ? new Set(collectAllExpandedKeys(initialValue)) : new Set(),
  )

  // 预览弹窗状态
  const [previewVisible, setPreviewVisible] = useState(false)

  // JSON生成弹窗状态
  const [generateVisible, setGenerateVisible] = useState(false)
  const [jsonInput, setJsonInput] = useState('')

  useEffect(() => {
    // 传递标准化后的数据，但不改变本地params
    const normalizedData = normalizeParams(params)
    onChange(normalizedData, type)
  }, [params])

  // 将嵌套数据拍平成一维数组
  const flattenParams = (
    data: ParamListType[],
    basePath: number[] = [],
    level: number = 0,
  ): FlatParamItem[] => {
    const result: FlatParamItem[] = []

    data.forEach((item, index) => {
      const currentPath = [...basePath, index]
      const pathKey = currentPath.join('-')
      const hasChildren = item.child && item.child.length > 0
      const isExpanded = expandedRowKeys.has(pathKey)

      // 添加当前项
      result.push({
        data: item,
        path: currentPath,
        level,
        hasChildren,
        isExpanded,
      })

      // 如果展开且有子元素，递归添加子元素
      if (isExpanded && hasChildren) {
        const childItems = flattenParams(item.child, currentPath, level + 1)
        result.push(...childItems)
      }
    })

    return result
  }

  // 获取扁平化后的数据
  const flatData = flattenParams(params)

  // 切换展开状态
  const toggleExpand = (path: number[]) => {
    const pathKey = path.join('-')
    setExpandedRowKeys((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(pathKey)) {
        newSet.delete(pathKey)
      }
      else {
        newSet.add(pathKey)
      }
      return newSet
    })
  }

  // 根据路径更新节点
  const updateNodeByPath = (data: ParamListType[], path: number[], patch: Partial<ParamListType>): ParamListType[] => {
    if (path.length === 0) return data

    const [index, ...restPath] = path

    return data.map((item, i) => {
      if (i === index) {
        if (restPath.length === 0) {
          // 到达目标节点
          return { ...item, ...patch }
        }
        else {
          // 继续向下查找
          return {
            ...item,
            child: updateNodeByPath(item.child, restPath, patch),
          }
        }
      }
      return item
    })
  }

  // 根据路径添加子元素
  const addChildByPath = (data: ParamListType[], path: number[]): ParamListType[] => {
    if (path.length === 0) return data

    const [index, ...restPath] = path // 抽出第一项 , 1-2-3 抽出 1 , 2-3 抽出 2

    return data.map((item, i) => {
      if (i === index) {
        if (restPath.length === 0) {
          // 到达目标节点，添加子元素
          const newChild = createEmptyParam()
          return {
            ...item,
            child: [...item.child, newChild],
          }
        }
        else {
          // 继续向下查找
          return {
            ...item,
            child: addChildByPath(item.child, restPath),
          }
        }
      }
      return item
    })
  }

  // 根据路径删除节点
  const deleteNodeByPath = (data: ParamListType[], path: number[]): ParamListType[] => {
    if (path.length === 0) return data

    const [index, ...restPath] = path

    if (restPath.length === 0) {
      // 删除当前层级的节点
      return data.filter((_, i) => i !== index)
    }

    return data.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          child: deleteNodeByPath(item.child, restPath),
        }
      }
      return item
    })
  }

  // 根据路径查找节点
  const getNodeByPath = (data: ParamListType[], path: number[]): ParamListType | undefined => {
    let currentList = data
    let currentNode: ParamListType | undefined

    for (const index of path) {
      currentNode = currentList[index]
      if (!currentNode) return undefined
      currentList = currentNode.child ?? []
    }

    return currentNode
  }

  // 判断当前节点是否为数组中的元素
  const isArrayElementPath = (path: number[]) => {
    if (path.length === 0) return false

    const parentNode = getNodeByPath(params, path.slice(0, -1))
    return parentNode?.data_type === 'array'
  }

  const convertToJson = (data: ParamListType[]): any => {
    const result: Record<string, any> = {}

    data.forEach((item) => {
      if (!hasNodeName(item)) return

      /** 1️⃣ 有子节点：结构优先 */
      if (item.child?.length > 0) {
        result[item.name] = buildNodeValue(item)
        return
      }

      /** 2️⃣ 无子节点：叶子值处理 */
      result[item.name] = resolveLeafValue(item.data_type, item.default_value)
    })

    return result
  }
  const resolveLeafValue = (type: string, value: any) => {
    // 有默认值
    if (value !== '' && value !== null && value !== undefined) {
      switch (type) {
        case 'array':
          return parseArrayValue(value)

        case 'number': {
          const num = Number(value)
          return isNaN(num) ? 0 : num
        }

        case 'boolean':
          if (typeof value === 'boolean') return value
          return value === 'true' || value === '1'

        default:
          return value
      }
    }

    // 无默认值：类型兜底
    switch (type) {
      case 'string':
        return ''
      case 'number':
        return 0
      case 'boolean':
        return false
      case 'object':
        return {}
      case 'array':
        return []
      default:
        return null
    }
  }
  const parseArrayValue = (value: any) => {
    // 已经是数组
    if (Array.isArray(value)) return value

    // 字符串：尝试解析
    if (typeof value === 'string') {
      try {
        // 1️⃣ 标准 JSON
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      }
      catch {
        try {
          // 2️⃣ 宽松 JS → JSON
          const fixed = value
            .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
            .replace(/'/g, '"')

          const parsed = JSON.parse(fixed)
          return Array.isArray(parsed) ? parsed : []
        }
        catch {
          return []
        }
      }
    }

    // 其他情况，兜底空数组
    return []
  }

  const buildNodeValue = (item: ParamListType): any => {
    const validChildren = item.child?.filter((child) => shouldKeepNode(child, item.data_type)) ?? []

    if (validChildren.length === 0) {
      return resolveLeafValue(item.data_type, item.default_value)
    }

    if (item.data_type === 'array') {
      return validChildren.map((child) => buildNodeValue(child))
    }

    return validChildren.reduce<Record<string, any>>((acc, child) => {
      if (!hasNodeName(child)) return acc
      acc[child.name] = buildNodeValue(child)
      return acc
    }, {})
  }

  // 数据标准化处理：如果有子元素，确保类型正确且清空默认值（不改变原数据）
  const normalizeParams = (data: ParamListType[], parentType?: string): ParamListType[] => {
    return data
      .filter((item) => shouldKeepNode(item, parentType)) // 过滤掉参数名为空的项
      .map((item) => {
        // 递归处理并过滤子元素（只保留参数名不为空的）
        const filteredChildren
          = item.child && item.child.length > 0
            ? normalizeParams(item.child, item.data_type)
            : []

        // 判断是否有有效的子元素
        const hasValidChildren = filteredChildren.length > 0

        // 处理默认值：只对数组类型调用 parseArrayValue
        let processedDefaultValue = item.default_value
        if (item.data_type === 'array' && !hasValidChildren) {
          // 数组类型且没有子元素时，解析 default_value
          processedDefaultValue = parseArrayValue(item.default_value)
        }
        else if (hasValidChildren) {
          // 有子元素时，清空默认值
          processedDefaultValue = ''
        }

        // 深拷贝当前项
        const normalizedItem: ParamListType = {
          ...item,
          // 数组里的元素允许无参数名
          name: parentType === 'array' ? '' : item.name,
          // 如果有有效子元素，根据原类型决定：array保持array，其他改为object
          data_type: hasValidChildren
            ? (item.data_type === 'array' ? 'array' : 'object')
            : item.data_type,
          // 使用处理后的默认值
          default_value: processedDefaultValue,
          // 使用过滤后的子元素
          child: filteredChildren,
        }
        if (item.data_type === 'array' || item.data_type === 'object') {
          delete normalizedItem.default_value
        }

        return normalizedItem
      })
  }

  // 从JSON生成参数结构
  // type: saveDefault 保存默认值，saveStructure 保存结构
  const generateFromJson = (jsonObj: any): ParamListType[] => {
    if (typeof jsonObj !== 'object' || jsonObj === null || Array.isArray(jsonObj)) {
      return []
    }

    return Object.keys(jsonObj).map((key) => createParamFromValue(key, jsonObj[key]))
  }

  // 处理JSON生成
  const handleGenerateFromJson = () => {
    try {
      const jsonObj = JSON.parse(jsonInput)
      const newParams = generateFromJson(jsonObj)

      if (newParams.length === 0) {
        message.warning('JSON格式无效或为空对象')
        return
      }

      setParams(newParams)
      setGenerateVisible(false)
      setJsonInput('')
      message.success('参数生成成功！')

      // 默认展开所有有子元素的节点
      const allExpandedKeys = collectAllExpandedKeys(newParams)
      setExpandedRowKeys(new Set(allExpandedKeys))
    }
    catch (error) {
      message.error('JSON格式错误，请检查输入')
    }
  }

  // 添加根级别的行
  const addRow = () => {
    setParams((list) => [...list, createEmptyParam()])
  }

  // 统一的更新方法
  const updateNode = (path: number[], patch: Partial<ParamListType>) => {
    setParams((list) => updateNodeByPath(list, path, patch))
  }

  // 统一的添加子元素方法
  const addChild = (path: number[]) => {
    const pathKey = path.join('-') // 0-0-0.child
    setParams((list) => addChildByPath(list, path))
    // 添加后自动展开
    setExpandedRowKeys((prev) => new Set([...prev, pathKey]))
  }

  // 统一的删除方法
  const deleteNode = (path: number[]) => {
    const newParams = deleteNodeByPath(params, path)
    if (newParams.length === 0) {
      message.warning('至少保留一行参数!')
      return
    }
    setParams(newParams)
  }

  const paramsTitle = () => {
    if (action == 'test') {
      switch (type) {
        case 'request_param':
          return '属性值'
        case 'response_param':
          return '返回值'
      }
    }
    else {
      switch (type) {
        case 'header':
          return '参数值'
        case 'request_param':
          return '示例值'
        case 'response_param':
          return '返回值'
      }
    }
  }

  // 生成列配置
  const columns: ColumnsType<FlatParamItem> = [
    {
      title: '',
      width: 40,
      align: 'center',
      render: (_, flatItem) => {
        const { data, path, level, hasChildren, isExpanded } = flatItem
        return (
          <div
            className="flex items-center justify-center"
            onClick={() => toggleExpand(path)}
          >
            {hasChildren ? (
              <span
                className="cursor-pointer text-blue-500 hover:text-blue-700 transition-colors"
                style={{ fontSize: '16px' }}
              >
                {isExpanded ? (
                  <MinusSquareFilled />
                ) : (
                  <PlusSquareFilled />
                )}
              </span>
            ) : level > 0 ? (
              <span className="w-6 inline-block"></span>
            ) : null}
          </div>
        )
      },
    },
    {
      title: '参数名',
      width: 200,
      render: (_, flatItem) => {
        const { data, path, level } = flatItem
        const isArrayElement = isArrayElementPath(path)

        return (
          <div className="flex items-center" style={{ paddingLeft: `${level * 24}px` }}>
            {/* 输入框 */}
            <Input
              value={isArrayElement ? '' : data.name}
              placeholder={isArrayElement ? '' : '请输入参数名'}
              onChange={(e) => updateNode(path, { name: e.target.value })}
              className={`flex-1 ${action === 'test' || isArrayElement ? 'cursor-not-allowed' : ''}`}
              readOnly={action === 'test' || isArrayElement}
              disabled={isArrayElement}
            />
          </div>
        )
      },
    },
    {
      title: '类型',
      width: 120,
      render: (_, flatItem) => {
        // 判断是否有有效的子元素
        const hasValidChildren
          = flatItem.data.child
            && flatItem.data.child.length > 0
            && flatItem.data.child.some((child) => shouldKeepNode(child, flatItem.data.data_type))

        // 如果有子元素，根据原类型决定显示：array保持array，其他显示object
        const displayType = hasValidChildren
          ? (flatItem.data.data_type === 'array' ? 'array' : 'object')
          : flatItem.data.data_type

        return (
          action !== 'test' ? (
            <Select
              value={displayType}
              className="w-full"
              options={dataTypeOptions}
              onChange={(v) => {
                const patch: Partial<ParamListType> = { data_type: v }
                if (v === 'boolean' && flatItem.data.default_value === '') {
                  patch.default_value = false
                }
                if (isContainerType(v)) {
                  patch.default_value = ''
                }
                updateNode(flatItem.path, patch)
              }}
            />
          ) : (
            <Input
              value={displayType}
              readOnly
              className="cursor-not-allowed"
            />
          )
        )
      },
    },
    {
      width: 300,
      title: paramsTitle(),
      render: (_, flatItem) => {
        const placeholder = `请输入${paramsTitle()}`
        const hasValidChildren
          = flatItem.data.child
            && flatItem.data.child.length > 0
            && flatItem.data.child.some((child) => shouldKeepNode(child, flatItem.data.data_type))
        const dataType = hasValidChildren
          ? (flatItem.data.data_type === 'array' ? 'array' : 'object')
          : flatItem.data.data_type
        const { default_value } = flatItem.data

        switch (dataType) {
          case 'array':
          case 'object':
            return (
              <Input disabled />
            )
          case 'boolean':
            return (
              <Select
                value={!!default_value}
                className="w-full"
                placeholder={placeholder}
                options={[
                  { label: 'true', value: true },
                  { label: 'false', value: false },
                ]}
                onChange={(v) => {
                  updateNode(flatItem.path, {
                    default_value: v,
                  })
                }}
              />
            )
          case 'number':
            return (
              <Input
                type="number"
                className="!w-full"
                value={default_value}
                placeholder={placeholder}
                onChange={(e) => {
                  updateNode(flatItem.path, {
                    default_value: e.target.value,
                  })
                }}
              />
            )
          case 'string':
          default:
            return (
              <Input.TextArea
                value={default_value}
                placeholder={placeholder}
                onChange={(e) => {
                  updateNode(flatItem.path, {
                    default_value: e.target.value,
                  })
                }}
                autoSize={{ minRows: 1, maxRows: 5 }}
              />
            )
        }
      },
    },
    {
      title: '描述',
      width: 300,
      render: (_, flatItem) => (
        <Input
          value={flatItem.data.desc || ''}
          placeholder="参数描述"
          onChange={(e) => updateNode(flatItem.path, { desc: e.target.value })}
          readOnly={action === 'test'}
          className={`${action === 'test' ? 'cursor-not-allowed' : ''}`}
        />
      ),
    },
    ...(action !== 'test' && type === 'request_param' ? [{
      title: '是否必选',
      width: 100,
      align: 'left' as const,
      render: (_, flatItem) => (
        <>
          {!isArrayElementPath(flatItem.path) && ((flatItem.data?.child?.length ?? 0) === 0) && (
            <Select
              value={flatItem.data.binding ? '是' : '否'}
              className="w-full"
              options={[
                { label: '是', value: '是' },
                { label: '否', value: '否' },
              ]}
              onChange={(v) => updateNode(flatItem.path, { binding: v === '是' })}
            />
          )}
        </>
      ),
    }] : []),
    {
      title: '操作',
      width: 240,
      align: 'center',
      fixed: 'right',
      hidden: action === 'test',
      render: (_, flatItem) => {
        // 只有 object 和 array 类型才能添加子元素
        const canAddChild = canPushChild
          && isContainerType(flatItem.data.data_type)

        return (
          <Space size="small">
            {canAddChild && (
              <Button
                type="link"
                icon={<PlusOutlined />}
                onClick={() => addChild(flatItem.path)}
                title="添加子元素"
              >
                添加子元素
              </Button>
            )}

            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              onClick={() => deleteNode(flatItem.path)}
              title="删除"
            >
              删除
            </Button>
          </Space>
        )
      },
    },
  ]

  return (
    <>
      <Collapse
        defaultActiveKey={[type]}
        className="!mb-4"
        items={[
          {
            key: type,
            label: (
              <div className="flex items-center justify-between w-full">
                <span>{title}</span>
                <Space size="small">
                  {action !== 'test' && (
                    <Button
                      icon={<ThunderboltOutlined />}
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation() // 阻止事件冒泡，避免触发折叠
                        // 打开弹窗时，预填充当前参数的JSON
                        const currentJson = JSON.stringify(convertToJson(params), null, 2)
                        setJsonInput(currentJson)
                        setGenerateVisible(true)
                      }}
                    >
                      JSON生成
                    </Button>
                  )}
                  <Button
                    icon={<EyeOutlined />}
                    type="primary"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation() // 阻止事件冒泡，避免触发折叠
                      setPreviewVisible(true)
                    }}
                  >
                    预览
                  </Button>
                  {action !== 'test' && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation() // 阻止事件冒泡，避免触发折叠
                        addRow()
                      }}
                    >
                      添加参数
                    </Button>
                  )}
                </Space>
              </div>
            ),
            children: (
              <Table
                rowKey={(item) => item.path.join('-')}
                columns={columns}
                dataSource={flatData}
                pagination={false}
                size="small"
                bordered
                scroll={{ x: 'max-content' }}
              />
            ),
          },
        ]}
      />

      {/* JSON预览弹窗 */}
      <Modal
        title={(
          <span className="text-lg font-semibold">
            {title}
            预览
          </span>
        )}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={800}
        className="json-preview-modal"
      >
        <div className="mb-4">
          根据输入的
          {title}
          预览请求参数JSON
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border border-gray-300 shadow-inner">
          <pre className="m-0 text-sm font-mono text-gray-800 overflow-auto max-h-[500px] leading-relaxed">
            {JSON.stringify(convertToJson(params), null, 2)}
          </pre>
        </div>
      </Modal>

      {/* JSON生成弹窗 */}
      <Modal
        title={(
          <span className="text-lg font-semibold">
            从JSON生成
            {title}
            参数
          </span>
        )}
        open={generateVisible}
        onCancel={() => {
          setGenerateVisible(false)
          setJsonInput('')
        }}
        onOk={handleGenerateFromJson}
        okText="生成参数"
        cancelText="取消"
        width={800}
        className="json-generate-modal"
      >
        <div className="mb-4 text-gray-600">
          <p className="mb-2">请输入有效的JSON格式数据，系统将自动解析并生成对应的参数结构。</p>
        </div>

        <div className="mb-4">
          <TextArea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={`请输入JSON格式数据，例如：\n{\n  "name": "张三",\n  "age": 18,\n  "address": {\n    "city": "北京",\n    "street": "长安街"\n  }\n}`}
            rows={12}
            className="font-mono text-sm"
          />
        </div>
      </Modal>
    </>
  )
}
