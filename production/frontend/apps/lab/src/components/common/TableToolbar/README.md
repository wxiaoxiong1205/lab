# TableToolbar 通用组件

## 组件说明

`TableToolbar` 是一个通用的表格工具栏组件，用于统一管理表格的搜索、操作按钮和工具栏。

## 布局结构

- **第一排**：左侧为输入框、下拉框等表单项；右侧为操控左侧内容的按钮（搜索、重置、刷新等）。
- **第二排**：工具栏按钮，如创建、新增、删除、导入、导出等。

```
┌─────────────────────────────────────────────────────────┐
│  Card                                                    │
│  ┌──────────────────────────────┬──────────────────────┐  │
│  │ 输入框/下拉框(左侧)           │ 搜索/重置/刷新(右侧) │  │
│  │ [输入框] [下拉框]             │ [搜索] [重置] [刷新]  │  │
│  └──────────────────────────────┴──────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 第二排：创建、新增、删除等                             │  │
│  │ [创建] [新增] [删除] [导入] [导出]                     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## API

### Props

| 参数 | 说明 | 类型 | 默认值 |
|------|------|------|--------|
| form | 表单实例 | `FormInstance` | - |
| searchFormItems | 第一排左侧：输入框、下拉框等表单项 | `React.ReactNode` | - |
| rightActions | 第一排右侧：搜索、重置、刷新等操控左侧内容的按钮 | `ToolbarAction[]` | `[]` |
| toolbarActions | 第二排：创建、新增、删除等工具栏按钮 | `ToolbarAction[]` | `[]` |
| onSearch | 表单提交事件 | `(values: any) => void` | - |
| className | 自定义类名 | `string` | `''` |

### ToolbarAction

| 参数 | 说明 | 类型 | 默认值 |
|------|------|------|--------|
| key | 唯一标识 | `string` | - |
| label | 按钮文本 | `string` | - |
| icon | 按钮图标 | `React.ReactNode` | - |
| type | 按钮类型 | `'primary' \| 'default' \| 'dashed' \| 'link' \| 'text'` | `'default'` |
| danger | 是否危险按钮 | `boolean` | `false` |
| onClick | 点击事件 | `() => void` | - |
| loading | 加载状态 | `boolean` | `false` |
| disabled | 是否禁用 | `boolean` | `false` |

## 使用示例

### 基础使用（第一排 + 第二排）

第一排左侧仅放输入框/下拉框，右侧放搜索、重置、刷新；第二排放创建等工具栏按钮。

```tsx
import { Form, Input, Select } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import TableToolbar from '@/components/common/TableToolbar'

const MyComponent = () => {
  const [form] = Form.useForm()

  const handleSearch = (values: any) => {
    console.log('搜索参数:', values)
  }

  return (
    <TableToolbar
      form={form}
      onSearch={handleSearch}
      searchFormItems={(
        <>
          <Form.Item name="name" className="mb-0">
            <Input placeholder="搜索名称" prefix={<SearchOutlined />} className="w-[200px]" />
          </Form.Item>
          <Form.Item name="status" className="mb-0">
            <Select placeholder="状态" className="w-[150px]" allowClear>
              <Select.Option value="active">启用</Select.Option>
              <Select.Option value="inactive">禁用</Select.Option>
            </Select>
          </Form.Item>
        </>
      )}
      rightActions={[
        { key: 'search', label: '搜索', type: 'primary', icon: <SearchOutlined />, onClick: () => form.submit() },
        { key: 'reset', label: '重置', onClick: () => form.resetFields() },
        { key: 'refresh', label: '刷新', icon: <ReloadOutlined />, onClick: () => console.log('刷新') },
      ]}
      toolbarActions={[
        { key: 'create', label: '创建', icon: <PlusOutlined />, type: 'primary', onClick: () => console.log('创建') },
      ]}
    />
  )
}
```

### 高级使用（带第二排工具栏）

```tsx
import { Button, Form, Input, Space } from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import TableToolbar from '@/components/common/TableToolbar'

const MyComponent = () => {
  const [form] = Form.useForm()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const handleSearch = (values: any) => {
    console.log('搜索参数:', values)
  }

  const handleBatchDelete = () => {
    console.log('批量删除:', selectedRowKeys)
  }

  const handleImport = () => {
    console.log('导入')
  }

  const handleExport = () => {
    console.log('导出')
  }

  return (
    <TableToolbar
      form={form}
      onSearch={handleSearch}
      searchFormItems={(
        <>
          <Form.Item name="keyword" className="mb-0">
            <Input
              placeholder="搜索关键词"
              prefix={<SearchOutlined />}
              className="w-[200px]"
            />
          </Form.Item>
          <Form.Item className="mb-0">
            <Space>
              <Button type="primary" htmlType="submit">
                搜索
              </Button>
              <Button onClick={() => form.resetFields()}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </>
      )}
      rightActions={[
        {
          key: 'refresh',
          label: '刷新',
          icon: <ReloadOutlined />,
          onClick: () => console.log('刷新'),
        },
        {
          key: 'create',
          label: '新建',
          icon: <PlusOutlined />,
          type: 'primary',
          onClick: () => console.log('新建'),
        },
      ]}
      toolbarActions={[
        {
          key: 'add',
          label: '新增',
          icon: <PlusOutlined />,
          onClick: () => console.log('新增'),
        },
        {
          key: 'delete',
          label: '删除',
          icon: <DeleteOutlined />,
          danger: true,
          onClick: handleBatchDelete,
          disabled: selectedRowKeys.length === 0,
        },
        {
          key: 'import',
          label: '导入',
          icon: <UploadOutlined />,
          onClick: handleImport,
        },
        {
          key: 'export',
          label: '导出',
          icon: <DownloadOutlined />,
          onClick: handleExport,
        },
      ]}
    />
  )
}
```

## 注意事项

1. **Form.Item 的 className**: 在 `searchFormItems` 中，建议为所有 `Form.Item` 添加 `className="mb-0"` 以保持统一的间距。

2. **按钮唯一性**: 每个 `ToolbarAction` 必须有唯一的 `key` 属性。

3. **响应式布局**: 组件使用 `flex-wrap` 实现响应式布局，在小屏幕下会自动换行。

4. **第二排工具栏**:
   - 需要显示第二排工具栏时，提供 `toolbarActions`
   - 第二排按钮左对齐，与表格对齐
   - 适用于批量操作、导入导出等功能

5. **表单提交**: 组件内部使用 `Form` 的 `onFinish` 事件处理搜索，确保 `searchFormItems` 中包含 `htmlType="submit"` 的按钮。
