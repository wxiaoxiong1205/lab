# @deep/deep-search-table

基于 `antd + @tanstack/react-query` 的通用 CRUD 列表页容器。

## 能力

- `searchForm` 通过 schema 配置生成
- `table` 通过 columns 配置生成
- 按钮通过 schema 配置生成
- 内置列表查询、分页、重置
- 支持接口响应默认格式自动识别
- 支持 `responseMapper` 覆盖响应格式
- 支持 `ref.reload()` 从外部重新拉取表格数据

## 默认识别的列表返回格式

默认会依次尝试这些字段：

- 列表：`data.items`、`data.list`、`data.records`、`items`、`list`、`records`
- 总数：`data.total`、`data.count`、`total`、`count`
- 页码：`data.page`、`page`
- 每页条数：`data.size`、`data.pageSize`、`size`、`pageSize`

## 基础用法

```tsx
import { useRef } from 'react'
import type { ColumnsType } from 'antd/es/table'
import apiClient from '@/services/apiClient'
import {
  DeepSearchTable,
  createAxiosLikeRequestAdapter,
  type DeepSearchTableRef,
} from '@deep/deep-search-table'

interface UserRow {
  id: string
  name: string
  status: string
}

const columns: ColumnsType<UserRow> = [
  { title: '名称', dataIndex: 'name' },
  { title: '状态', dataIndex: 'status' },
]

export default function UserListPage() {
  const crudRef = useRef<DeepSearchTableRef<UserRow>>(null)

  return (
    <DeepSearchTable<UserRow>
      ref={crudRef}
      title="用户管理"
      rowKey="id"
      columns={columns}
      searchFields={[
        {
          key: 'name',
          label: '名称',
          type: 'input',
          props: { placeholder: '请输入名称' },
        },
        {
          key: 'status',
          label: '状态',
          type: 'select',
          options: [
            { label: '启用', value: 'enabled' },
            { label: '禁用', value: 'disabled' },
          ],
        },
      ]}
      toolbarActions={[
        {
          key: 'create',
          label: '新增',
          type: 'primary',
        },
      ]}
      actionHandlers={{
        create: async ({ reload }) => {
          // 打开新增弹窗，成功后调用 reload()
          await reload()
        },
      }}
      request={{
        url: '/users',
        method: 'GET',
        requestAdapter: createAxiosLikeRequestAdapter(apiClient),
      }}
    />
  )
}
```

## 自定义返回格式

```tsx
<DeepSearchTable
  responseMapper={(response) => ({
    list: response.data.rows,
    total: response.data.totalCount,
    raw: response,
  })}
/>
```


