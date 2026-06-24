import { Descriptions, Empty, Spin, Table, Tabs, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRequest } from 'ahooks'
import { CodeView } from '@/components/CodeView'
import { apiService } from '@/services/apiService'
import type { ApiServiceDocument, ApiServiceParamNode } from '@/services/apiService'

/**
 * 将参数的展示类型标准化。
 * - 如果参数存在有效子节点，则按「object/array」展示（避免把有子结构的节点仍展示为 string 等原始类型）。
 * - 子节点为空或只有空 name 时，回退为接口返回的 `data_type`。
 */
function getDisplayType(node: ApiServiceParamNode) {
  const hasValidChildren = !!node.child?.some((c) => c.name && c.name.trim() !== '')
  if (!hasValidChildren) return node.data_type
  return node.data_type === 'array' ? 'array' : 'object'
}

/**
 * 根据参数树生成一个“可用作示例”的 JSON 对象。
 * 规则：
 * - object：递归生成子对象
 * - array：生成单元素数组（元素为子对象）或空数组
 * - primitive：优先用 `default_value`，否则按类型生成占位值（number=0/boolean=false/string=''）
 */
function paramsToExampleObject(params: ApiServiceParamNode[] = []): Record<string, unknown> {
  const walk = (items: ApiServiceParamNode[]): Record<string, unknown> => {
    const obj: Record<string, unknown> = {}
    items.forEach((it) => {
      if (!it?.name) return
      const type = getDisplayType(it)
      if (type === 'object') {
        obj[it.name] = walk(it.child ?? [])
        return
      }
      if (type === 'array') {
        const child = it.child ?? []
        const childHasObject = child.length > 0
        obj[it.name] = childHasObject ? [walk(child)] : []
        return
      }
      if (it.default_value !== undefined && it.default_value !== null && it.default_value !== '') {
        obj[it.name] = it.default_value
        return
      }
      switch (type) {
        case 'number':
          obj[it.name] = 0
          break
        case 'boolean':
          obj[it.name] = false
          break
        default:
          obj[it.name] = ''
      }
    })
    return obj
  }

  return walk(params)
}

/**
 * 根据“单个参数节点”生成示例值（用于表格里的「示例值」列）。
 * - 有 child 的 array/object：根据 child 递归生成
 * - 叶子节点：优先 default_value，否则按类型生成占位值
 */
function nodeToExampleValue(node: ApiServiceParamNode): unknown {
  const walk = (items: ApiServiceParamNode[]): Record<string, unknown> => {
    const obj: Record<string, unknown> = {}
    items.forEach((it) => {
      if (!it?.name) return
      obj[it.name] = nodeToExampleValue(it)
    })
    return obj
  }

  const type = getDisplayType(node)
  if (type === 'object') return walk(node.child ?? [])
  if (type === 'array') {
    const child = node.child ?? []
    const hasValidChild = child.some((c) => c.name && c.name.trim() !== '')
    return hasValidChild ? [walk(child)] : []
  }

  if (node.default_value !== undefined && node.default_value !== null && node.default_value !== '') {
    return node.default_value
  }
  switch (type) {
    case 'number':
      return 0
    case 'boolean':
      return false
    default:
      return ''
  }
}

/**
 * 将后端 unix 秒级时间戳格式化成可读字符串。
 * 约束：无效/缺失时返回 `--`，避免页面出现 `Invalid Date`。
 */
function formatUnixSeconds(ts?: number) {
  if (!ts) return '--'
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return '--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 文本按原样换行展示（用于概述/调用指引这类多行内容）。
 * 约束：空值显示 `--`，避免出现空白块影响布局。
 */
function renderPreWrap(text?: string) {
  if (!text) return <span className="text-gray-400">--</span>
  return (
    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
      {text}
    </Typography.Paragraph>
  )
}

/**
 * 把 unknown 值安全地转成 JSON 文本。
 * - 如果本身就是 string（后端可能直接返回示例字符串），直接返回
 * - 否则尝试 JSON.stringify，失败则回退为 `{}`
 */
function toJsonText(v: unknown, fallback?: unknown) {
  const value = v ?? fallback
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? {}, null, 2)
  }
  catch {
    return JSON.stringify({}, null, 2)
  }
}

type ApiServiceParamNodeWithKey = ApiServiceParamNode & { __rowKey: string }

function normalizeParamTree(params: ApiServiceParamNode[] = [], parentKey = 'root'): ApiServiceParamNodeWithKey[] {
  return (params ?? [])
    .filter((p) => p && p.name && p.name.trim() !== '')
    .map((p, idx) => {
      const selfKey = `${parentKey}/${String(p.id ?? p.name ?? idx)}`
      return {
        ...p,
        __rowKey: selfKey,
        child: p.child ? normalizeParamTree(p.child, selfKey) : p.child,
      } as ApiServiceParamNodeWithKey
    })
}

/**
 * 生成网关完整 URL。
 * 优先级：`gateway_full_url` > `gateway_base_url + gateway_invoke_path` > 空字符串
 * 说明：后端字段可能不齐全，这里做最小、确定性的拼接兜底。
 */
function buildGatewayUrl(doc?: ApiServiceDocument) {
  if (doc?.gateway_full_url) return doc.gateway_full_url
  if (doc?.gateway_base_url && doc?.gateway_invoke_path) {
    return `${doc.gateway_base_url.replace(/\/$/, '')}${doc.gateway_invoke_path.startsWith('/') ? '' : '/'}${doc.gateway_invoke_path}`
  }
  return ''
}

export default function ApiDocPanel({ apiId }: { apiId?: number | string }) {
  const {
    data: doc,
    loading,
    error,
  } = useRequest<ApiServiceDocument | undefined, [number | string]>(
    (id) => apiService.getApiDocument(id),
    {
      ready: apiId !== undefined && apiId !== null && String(apiId).trim() !== '',
      defaultParams: apiId !== undefined && apiId !== null && String(apiId).trim() !== '' ? [apiId] : undefined,
      refreshDeps: [apiId],
      staleTime: 0,
    },
  )

  if (!apiId) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="缺少 API id" />
  }

  if (error) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={(
          <Typography.Text type="danger">
            文档加载失败
          </Typography.Text>
        )}
      />
    )
  }

  const method = (doc?.gateway_http_method ?? 'POST').toUpperCase()
  const endpoint = doc?.gateway_invoke_path ?? ''
  const fullUrl = buildGatewayUrl(doc) || (endpoint.startsWith('http') ? endpoint : (endpoint ? `{{GATEWAY_URL}}${endpoint}` : ''))

  const requestParamsForFallback: ApiServiceParamNode[] = doc?.request_param ?? []
  const responseParamsForFallback: ApiServiceParamNode[] = doc?.response_param ?? []

  const requestExampleObject = doc?.request_example ?? paramsToExampleObject(requestParamsForFallback)
  const responseExampleObject = doc?.response_example ?? paramsToExampleObject(responseParamsForFallback)
  const requestExample = toJsonText(doc?.request_example, requestExampleObject)
  const responseExample = toJsonText(doc?.response_example, responseExampleObject)

  const curl = doc?.curl_example ?? [
    `curl "${fullUrl}" \\`,
    `  -X ${method} \\`,
    '  -H "Content-Type: application/json" \\',
    '  -H "Authorization: Bearer <token>" \\',
    method === 'GET' ? '' : `  --data '${requestExample.replaceAll('\'', '\\\'')}'`,
  ].filter(Boolean).join('\n')

  const python = doc?.python_example ?? [
    'import requests',
    '',
    `url = "${fullUrl}"`,
    'headers = {',
    '  "Authorization": "Bearer <token>",',
    '  "Content-Type": "application/json",',
    '}',
    method === 'GET'
      ? 'resp = requests.get(url, headers=headers, timeout=60)'
      : `payload = ${requestExample}\nresp = requests.${method.toLowerCase()}(url, headers=headers, json=payload, timeout=60)`,
    'print("status:", resp.status_code)',
    'try:',
    '  print("response_json:", resp.json())',
    'except Exception:',
    '  print("response_text:", resp.text)',
  ].join('\n')

  const requestParams: ApiServiceParamNode[] = doc?.request_param ?? []
  const responseParams: ApiServiceParamNode[] = doc?.response_param ?? []
  const requestParamsTree = normalizeParamTree(requestParams)
  const responseParamsTree = normalizeParamTree(responseParams)

  const paramColumns: ColumnsType<ApiServiceParamNode> = [
    {
      title: '参数名',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span className="font-mono">{v || '--'}</span>,
    },
    {
      title: '类型',
      dataIndex: 'data_type',
      key: 'data_type',
      width: 140,
      render: (_: string, row) => getDisplayType(row),
    },
    {
      title: '必填',
      dataIndex: 'binding',
      key: 'binding',
      width: 90,
      render: (v?: boolean) => (v ? '是' : '否'),
    },
    {
      title: '示例值',
      dataIndex: 'default_value',
      key: 'default_value',
      width: 160,
      render: (v: unknown, row) => {
        const displayType = getDisplayType(row)
        // 有层级结构时，让用户在表格层级里看子节点示例值；父节点这里给一个轻量提示
        if (displayType === 'object') return '{...}'
        if (displayType === 'array') return '[...]'

        const value = (v === undefined || v === null || v === '') ? nodeToExampleValue(row) : v
        if (value === undefined || value === null || value === '') return '--'
        if (typeof value === 'string') return value
        try {
          return JSON.stringify(value)
        }
        catch {
          return String(value)
        }
      },
    },
    {
      title: '说明',
      dataIndex: 'desc',
      key: 'desc',
      render: (v: string) => v || '--',
    },
  ]

  const sectionTitle = (index: number, title: string) => (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-gray-500">{`${index}.`}</span>
      <span className="font-medium">{title}</span>
    </div>
  )

  return (
    <Spin spinning={loading}>
      <div>
        {sectionTitle(1, '接口概述')}
        <Descriptions
          size="small"
          column={2}
          bordered
          items={[
            { key: 'name', label: 'API名称', children: doc?.name ?? '--' },
            { key: 'gateway', label: '地址（网关地址）', children: <span className="font-mono">{doc?.gateway_full_url ?? fullUrl ?? '--'}</span> },
            { key: 'method', label: '请求方法', children: <Tag>{method}</Tag> },
            { key: 'updated', label: '更新时间', children: formatUnixSeconds(doc?.updated_time) },
            { key: 'invoke_guide', label: '概述', span: 2, children: renderPreWrap(doc?.invoke_guide) },
          ]}
        />

        <div className="mt-6">
          {sectionTitle(2, '请求Body')}
          <Table<ApiServiceParamNode>
            key={`req-${String(apiId ?? '')}-${String(doc?.updated_time ?? '')}`}
            size="small"
            rowKey="__rowKey"
            pagination={false}
            columns={paramColumns}
            dataSource={requestParamsTree as any}
            childrenColumnName="child"
            expandable={{ defaultExpandAllRows: true }}
          />
        </div>

        <div className="mt-6">
          {sectionTitle(3, '响应参数')}
          {responseParams.length > 0 ? (
            <Table<ApiServiceParamNode>
              key={`resp-${String(apiId ?? '')}-${String(doc?.updated_time ?? '')}`}
              size="small"
              rowKey="__rowKey"
              pagination={false}
              columns={paramColumns}
              dataSource={responseParamsTree as any}
              childrenColumnName="child"
              expandable={{ defaultExpandAllRows: true }}
            />
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无响应参数" />}
        </div>

        <div className="mt-6">
          {sectionTitle(4, '请求示例')}
          <Tabs
            items={[
              {
                key: 'curl',
                label: 'Curl',
                children: (
                  <CodeView
                    text={curl || ''}
                    language="bash"
                    featureControl={{ wordCount: false }}
                  />
                ),
              },
              {
                key: 'python',
                label: 'Python',
                children: (
                  <CodeView
                    text={python || ''}
                    language="python"
                    featureControl={{ wordCount: false }}
                  />
                ),
              },
            ]}
          />
        </div>

        <div className="mt-6">
          {sectionTitle(5, '响应示例')}
          <CodeView
            text={responseExample}
            language="json"
            featureControl={{ wordCount: false }}
          />
        </div>
      </div>
    </Spin>
  )
}
