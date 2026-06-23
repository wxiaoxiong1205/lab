# 清洗算子参数 Schema 规范

## 概述
本文档定义了清洗算子参数 `params_schema` 的标准格式，用于前端动态渲染参数配置界面。

## Schema 结构

### 基础字段
每个参数的 schema 定义包含以下字段：

```json
{
  "param_name": {
    "type": "string",           // 参数类型：int, float, string, list, bool
    "default": "default_value", // 默认值（可选，如果有则显示配置面板）
    "description": "参数描述",  // 参数说明
    "ui_type": "input",         // UI控件类型（可选，默认根据type推断）
    "required": false,          // 是否必填（可选，默认false）
    "min": 0,                   // 最小值（数字类型）
    "max": 100,                 // 最大值（数字类型）
    "step": 1,                  // 步长（数字类型）
    "enum": ["option1", "option2"], // 枚举值（如果有则渲染为Select）
    "enum_labels": {            // 枚举值显示标签（可选）
      "option1": "选项1",
      "option2": "选项2"
    },
    "placeholder": "请输入...", // 占位符文本
    "unit": "字符",            // 单位显示（可选）
    "list_item_type": "string"  // list类型时，列表项的类型（可选）
  }
}
```

## UI 控件类型映射

### ui_type 可选值
- `input`: 文本输入框（默认用于 string 类型）
- `number`: 数字输入框（默认用于 int/float 类型）
- `select`: 下拉选择器（当有 enum 时自动使用）
- `textarea`: 多行文本输入（string 类型，可配置）
- `tags`: 标签输入（list 类型，默认使用）
- `switch`: 开关（bool 类型，默认使用）

## 完整示例

### 示例1：文本长度过滤器
```json
{
  "comparison": {
    "type": "string",
    "default": "less_than",
    "description": "比较方式",
    "enum": ["less_than", "greater_than"],
    "enum_labels": {
      "less_than": "小于",
      "greater_than": "大于"
    }
  },
  "threshold": {
    "type": "int",
    "default": 100,
    "description": "阈值（字符数）",
    "min": 1,
    "unit": "字符"
  }
}
```

### 示例2：语种过滤器
```json
{
  "lang": {
    "type": "string",
    "default": "zh",
    "description": "目标语言代码",
    "enum": ["zh", "en", "ja", "ko", "fr", "de", "es"],
    "enum_labels": {
      "zh": "中文",
      "en": "英文",
      "ja": "日文",
      "ko": "韩文",
      "fr": "法文",
      "de": "德文",
      "es": "西班牙文"
    }
  }
}
```

### 示例3：自定义关键词脱敏
```json
{
  "keywords": {
    "type": "list",
    "default": [],
    "description": "关键词列表",
    "list_item_type": "string",
    "ui_type": "tags",
    "placeholder": "请输入关键词，多个关键词用逗号分隔"
  }
}
```

### 示例4：MinHash去重器
```json
{
  "threshold": {
    "type": "float",
    "default": 0.7,
    "description": "相似度阈值",
    "min": 0,
    "max": 1,
    "step": 0.1
  }
}
```

### 示例5：多余换行符清洗
```json
{
  "max_newlines": {
    "type": "int",
    "default": 2,
    "description": "最大连续换行数",
    "min": 1
  }
}
```

### 示例6：语义向量去重器
```json
{
  "similarity_threshold": {
    "type": "float",
    "default": 0.9,
    "description": "相似度阈值（范围 0-1）",
    "min": 0,
    "max": 1,
    "step": 0.1
  }
}
```

### 示例7：SimHash去重器
```json
{
  "hamming_threshold": {
    "type": "int",
    "default": 3,
    "description": "汉明距离阈值",
    "min": 1,
    "max": 64
  }
}
```

## 类型说明

### type 字段
- `int`: 整数类型，渲染为 `InputNumber`
- `float`: 浮点数类型，渲染为 `InputNumber`（带 step）
- `string`: 字符串类型，渲染为 `Input` 或 `TextArea`
- `list`: 列表类型，渲染为 `Tags` 或逗号分隔的输入框
- `bool`: 布尔类型，渲染为 `Switch`

### 自动推断规则
1. 如果提供了 `enum`，自动使用 `Select` 控件
2. 如果 `type` 为 `int` 或 `float`，使用 `InputNumber`
3. 如果 `type` 为 `string` 且没有 `ui_type`，使用 `Input`
4. 如果 `type` 为 `list`，使用 `Tags` 或逗号分隔输入
5. 如果 `type` 为 `bool`，使用 `Switch`

## 注意事项

1. **默认值要求**：只有包含 `default` 字段的参数才会显示配置面板
2. **枚举值**：如果提供了 `enum`，必须同时提供对应的 `enum_labels` 用于显示
3. **验证规则**：`min`、`max`、`step` 仅对数字类型有效
4. **必填验证**：`required: true` 的参数在提交时会进行验证

