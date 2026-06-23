# 数据清洗算子配置说明

## 配置文件位置

- **默认路径**: `app/config/data_cleaning_operators.json`
- **环境变量**: `DATA_CLEANING_OPERATORS_CONFIG_PATH` (支持 Docker 挂载)

## 配置文件格式

配置文件是一个 JSON 数组，每个元素代表一个算子定义：

```json
[
  {
    "type": "operator_type",
    "name": "算子名称",
    "category": "算子分类",
    "description": "算子描述",
    "params_schema": {
      "param_name": {
        "type": "string|int|float|list|bool",
        "default": "默认值",
        "description": "参数描述",
        "ui_type": "input|number|select|textarea|tags|switch",
        "required": false,
        "min": 0,
        "max": 100,
        "step": 1,
        "enum": ["option1", "option2"],
        "enum_labels": {
          "option1": "选项1",
          "option2": "选项2"
        },
        "placeholder": "请输入...",
        "unit": "字符",
        "list_item_type": "string"
      }
    }
  }
]
```

## 参数 Schema 规范

### 基础字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 参数类型：`int`, `float`, `string`, `list`, `bool` |
| `default` | any | 否 | 默认值（如果有则显示配置面板） |
| `description` | string | 是 | 参数说明 |
| `ui_type` | string | 否 | UI控件类型，默认根据type推断 |
| `required` | bool | 否 | 是否必填，默认 `false` |
| `min` | number | 否 | 最小值（数字类型） |
| `max` | number | 否 | 最大值（数字类型） |
| `step` | number | 否 | 步长（数字类型） |
| `enum` | array | 否 | 枚举值（如果有则渲染为Select） |
| `enum_labels` | object | 否 | 枚举值显示标签 |
| `placeholder` | string | 否 | 占位符文本 |
| `unit` | string | 否 | 单位显示 |
| `list_item_type` | string | 否 | list类型时，列表项的类型 |

### UI 控件类型映射

| ui_type | 说明 | 适用类型 |
|---------|------|----------|
| `input` | 文本输入框 | `string` (默认) |
| `number` | 数字输入框 | `int`, `float` (默认) |
| `select` | 下拉选择器 | `string` (有enum时自动使用) |
| `textarea` | 多行文本输入 | `string` |
| `tags` | 标签输入 | `list` (默认) |
| `switch` | 开关 | `bool` (默认) |

### 自动推断规则

1. 如果提供了 `enum`，自动使用 `Select` 控件
2. 如果 `type` 为 `int` 或 `float`，使用 `InputNumber`
3. 如果 `type` 为 `string` 且没有 `ui_type`，使用 `Input`
4. 如果 `type` 为 `list`，使用 `Tags` 或逗号分隔输入
5. 如果 `type` 为 `bool`，使用 `Switch`

## 示例

### 示例1：文本长度过滤器（token_num_filter）

```json
{
  "min_num": {
    "type": "int",
    "default": 10,
    "description": "最小 Token 数。低于此值的样本将被过滤",
    "min": 1,
    "unit": "tokens",
    "ui_type": "number",
    "required": true
  },
  "max_num": {
    "type": "int",
    "default": 512,
    "description": "最大 Token 数。高于此值的样本将被过滤",
    "min": 1,
    "unit": "tokens",
    "ui_type": "number",
    "required": true
  }
}
```

### 示例2：语种过滤器（language_filter）

```json
{
  "lang_filter_allowed_languages": {
    "type": "list",
    "default": ["en"],
    "description": "支持的语言列表",
    "list_item_type": "string",
    "enum": ["zh", "en"],
    "enum_labels": {
      "zh": "中文",
      "en": "英文"
    },
    "ui_type": "multi_select",
    "required": true
  }
}
```

### 示例3：自定义关键词脱敏（sensitive_keyword_mask）

```json
{
  "key_words": {
    "type": "list",
    "default": [],
    "description": "自定义关键词",
    "list_item_type": "string",
    "ui_type": "tags",
    "placeholder": "请输入关键词，多个关键词用逗号分隔",
    "required": true
  }
}
```

### 示例4：布尔类型参数（document_deduplicator）

```json
{
  "lowercase": {
    "type": "bool",
    "default": false,
    "description": "是否转换成小写",
    "ui_type": "switch",
    "required": true
  },
  "ignore_non_character": {
    "type": "bool",
    "default": false,
    "description": "是否忽略非字母字符",
    "ui_type": "switch",
    "required": true
  }
}
```

### 示例5：浮点数参数（相似度阈值）

```json
{
  "jaccard_threshold": {
    "type": "float",
    "default": 0.85,
    "description": "Jaccard 相似度阈值：当相似度 >= 此值时视为重复",
    "min": 0,
    "max": 1,
    "step": 0.01,
    "ui_type": "number",
    "required": true
  }
}
```

### 示例6：复杂参数配置（document_minhash_deduplicator）

```json
{
  "tokenization": {
    "type": "string",
    "default": "character",
    "description": "分词方法：中文数据必须使用 'character'，否则无法生成签名",
    "enum": ["space", "punctuation", "character", "sentencepiece"],
    "enum_labels": {
      "space": "按空格切分（适合英文）",
      "punctuation": "按标点切分",
      "character": "按字符切分（适合中文）",
      "sentencepiece": "子词切分"
    },
    "ui_type": "select",
    "required": true
  },
  "window_size": {
    "type": "int",
    "default": 5,
    "description": "分片窗口大小：注意文本长度必须 >= window_size",
    "min": 1,
    "ui_type": "number",
    "required": true
  },
  "lowercase": {
    "type": "bool",
    "default": true,
    "description": "是否先将文本转换为小写",
    "ui_type": "switch",
    "required": true
  },
  "num_permutations": {
    "type": "int",
    "default": 128,
    "description": "排列次数：决定签名长度，越大计算 Jaccard 相似度越准",
    "min": 1,
    "ui_type": "number",
    "required": true
  },
  "jaccard_threshold": {
    "type": "float",
    "default": 0.85,
    "description": "Jaccard 相似度阈值：当相似度 >= 此值时视为重复",
    "min": 0,
    "max": 1,
    "step": 0.01,
    "ui_type": "number",
    "required": true
  },
  "ignore_pattern": {
    "type": "string",
    "default": null,
    "description": "计算 minhash 时忽略符合特定模式的子串",
    "ui_type": "text",
    "required": false
  },
  "num_bands": {
    "type": "int",
    "default": null,
    "description": "LSH 的 Band 数量：设为 null 则自动计算最优值",
    "min": 1,
    "ui_type": "number",
    "required": false
  },
  "num_rows_per_band": {
    "type": "int",
    "default": null,
    "description": "每个 Band 的行数：设为 null 则自动计算最优值",
    "min": 1,
    "ui_type": "number",
    "required": false
  }
}
```

## 注意事项

1. **默认值要求**：只有包含 `default` 字段的参数才会显示配置面板
2. **枚举值**：如果提供了 `enum`，建议同时提供 `enum_labels` 用于显示
3. **验证规则**：`min`、`max`、`step` 仅对数字类型有效
4. **必填验证**：`required: true` 的参数在提交时会进行验证

## Docker 挂载支持

支持通过环境变量指定配置文件路径，方便 Docker 挂载：

```bash
docker run \
  -v /host/config:/app/config \
  -e DATA_CLEANING_OPERATORS_CONFIG_PATH=/app/config/data_cleaning_operators.json \
  your-image
```

## 更新算子配置

1. 编辑 `app/config/data_cleaning_operators.json` 文件
2. 按照上述规范添加或修改算子定义
3. 重启应用，新配置自动生效

如果使用 Docker 挂载，修改挂载目录中的配置文件后重启容器即可。

