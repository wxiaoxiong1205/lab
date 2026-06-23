# TableActionColumn 表格操作列通用组件

## 说明

- **超过 3 个按钮**：只展示前 3 个，其余收起到「...」中，点击「...」以下拉形式展示全部操作。
- **样式统一**：纯文字、蓝色链接样式（`#1890ff`）、无图标、无背景，与设计图一致。

## API

### TableActionColumnProps

| 参数 | 说明 | 类型 | 默认值 |
|------|------|------|--------|
| actions | 操作项列表 | `TableActionItem[]` | - |
| maxVisible | 首屏可见按钮数量，超出部分放入「...」 | `number` | `3` |

### TableActionItem

| 参数 | 说明 | 类型 |
|------|------|------|
| key | 唯一标识 | `string` |
| label | 按钮文案 | `string` |
| onClick | 点击回调（与 confirm 二选一） | `() => void` |
| confirm | 二次确认配置（与 onClick 二选一） | `{ title, description?, okText?, cancelText?, onConfirm }` |
| danger | 是否危险操作（红色） | `boolean` |
| disabled | 是否禁用 | `boolean` |
| loading | 是否加载中 | `boolean` |
| visible | 为 false 时不展示 | `boolean` |

## 使用示例

```tsx
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn';

// 在表格列定义中
{
  title: '操作',
  key: 'action',
  width: 240,
  fixed: 'right',
  render: (_, record) => {
    const actions: TableActionItem[] = [
      { key: 'view', label: '详情', onClick: () => handleView(record) },
      { key: 'edit', label: '编辑', onClick: () => handleEdit(record) },
      {
        key: 'delete',
        label: '删除',
        danger: true,
        confirm: {
          title: '确定删除？',
          description: '删除后无法恢复',
          onConfirm: () => handleDelete(record.id),
          okText: '确定',
          cancelText: '取消',
        },
      },
    ];
    return <TableActionColumn actions={actions} />;
  },
}
```

## 注意事项

- 需要「先校验再弹确认」时，使用 `onClick` 内自行 `Modal.confirm`，不要用 `confirm`。
- 条件展示的按钮通过 `visible: false` 排除，组件内部会过滤后再做「前 N 个 + ...」的截断。
