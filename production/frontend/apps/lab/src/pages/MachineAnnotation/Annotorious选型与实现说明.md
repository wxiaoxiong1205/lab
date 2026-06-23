# Annotorious 选型与实现说明

## 1. 背景

当前机器标注详情页位于：

- `apps/lab/src/pages/MachineAnnotation/components/OnlineAnnotationDetailPage.tsx`

页面目标是为图像分割任务提供一套前端可交互的标注能力，至少覆盖以下需求：

- 展示后端返回的图片及已有标注结果
- 支持前端新增多边形分割区域
- 支持选择、修改、删除标注区域
- 支持为标注区域绑定标签
- 支持将前端交互结果重新组织为后端需要的数据结构

当前项目技术栈主要是：

- React 18
- Vite 6
- TypeScript
- Ant Design 5

## 2. 选型结论

本次前端图片标注方案选择：

- `@annotorious/react`

相关官方资料：

- Annotorious 官网与文档：<https://annotorious.dev/getting-started/>
- canvas-select 示例 Demo：<https://codepen.io/heylight/pen/VwbQLje>

同时由于其包导出链路中包含 `@annotorious/openseadragon`，项目还补充安装了：

- `openseadragon`

当前依赖可见于：

- `apps/lab/package.json`

## 3. 为什么选择 Annotorious

### 3.1 需求匹配度高

当前任务是“图片分割标注详情页”，而不是通用白板、截图批注、复杂图形编辑器。Annotorious 与此场景高度匹配，原因是：

- 原生面向图片标注，不需要从通用 Canvas 库二次造轮子
- 支持 polygon 这类分割任务核心能力
- 支持 annotation 的创建、更新、删除、选择等完整生命周期
- 具备 React 封装，能直接嵌入现有页面
- 与 `OpenSeadragon` 集成后，支持较丝滑的拖拽、缩放、平移交互，适合图片标注场景

### 3.2 接入成本比自研低

如果使用 `react-konva` 或纯 `SVG + React state` 自研，虽然灵活，但需要自己处理很多底层交互：

- 点选绘制
- 闭合 polygon
- 选中态
- 顶点编辑
- 删除逻辑
- annotation 生命周期管理
- 图层与数据状态同步

Annotorious 已经把这部分通用交互封装好了，前端只需要处理：

- 业务标签
- 数据格式转换
- 页面级状态管理

### 3.3 比轻量批注工具更适合训练数据标注

类似 `markerjs2` 更偏图片批注，适合箭头、矩形、高亮等视觉标记，但不适合标准训练数据场景中的分割标注数据生产。

Annotorious 更接近“数据标注工具”的心智模型，而不是“截图批注工具”。

## 4. 其他方案对比

### 4.1 Annotorious

优点：

- 图片标注场景匹配度高
- 支持 polygon
- React 接入简单
- 生命周期事件完整
- 适合将标注结果回写到业务后端
- 官方 `OpenSeadragon` 集成下，拖拽、缩放、平移的交互体验更成熟，动效更自然

缺点：

- 需要理解其 annotation 内部数据结构
- 需要做后端数据到 Annotorious 数据的转换
- 包导出带出 `openseadragon` peer，需要额外处理依赖

### 4.2 react-konva / konva

优点：

- 灵活度最高
- 后续做复杂交互可扩展性强
- 适合做完整标注工作台

缺点：

- 需要自研大量标注交互
- 初期交付成本高
- 当前页面只是一个详情页，使用它偏重

### 4.3 纯 SVG 自研

优点：

- 依赖最少
- 完全可控

缺点：

- 交互细节都要自己维护
- 长期维护成本高
- 容易在选中、编辑、闭合、多边形操作上反复踩坑

### 4.4 为什么没有选 canvas-select

这里需要单独说明，`canvas-select` 并不是“能力不够”或者“项目里没人知道它”。结合其公开 Demo 来看，它已经覆盖了不少前端标注常见操作：

- 点
- 线
- 多边形
- 矩形
- 圆
- 画笔
- 橡皮擦
- 缩放
- setData 回显已有结果

从 Demo 观感上看，`canvas-select` 的工具覆盖面是比较全的，做一套“可绘制、可回显、可编辑”的图元标注页没有问题，这一点需要明确承认，不能片面写成“只是画图工具”。

如果目标只是做一个“基于图片的可视化绘制与选择器”，那么 `canvas-select` 是一个完全值得评估的方案，尤其是下面这类场景：

- 需要较丰富的几何图元
- 希望快速把图形绘制出来
- 更关注画布交互本身，而不是 annotation 标准模型
- 页面是一个相对独立的画布工作区

但当前这次需求没有选它，核心原因不是“它不支持”，而是结合官方文档与 Demo 体验后，`Annotorious` 在当前需求上更适配。

首先，当前页面不是在做一个通用图形编辑器，而是在做“机器学习训练数据标注页”。这类页面的重点除了画图，还包括：

- 标注对象生命周期管理
- 与标签体系绑定
- 与后端标注结构双向转换
- 选中态、编辑态、提交态同步
- 后续统一不同任务类型的标注模型

从这个角度看，`canvas-select` 更偏“画布/图元交互层”，而 `Annotorious` 更接近“图片标注能力层”。

其次，`canvas-select` 的数据结构虽然直观，例如：

- `type`
- `coor`
- `label`
- `radius`
- `brushSize`
- `eraserSize`

这类结构本身也是点位数据，本质上并不是“只能画图，不能做标注数据”。无论使用 `canvas-select` 还是 `Annotorious`，只要后端接口不是直接原生兼容库内部结构，都需要做一层数据转换。

所以这里不能把“需要重新处理数据”当作不选 `canvas-select` 的理由，因为这件事两边都一样存在。

真正需要比较的是：在都要做数据映射的前提下，哪一套前端状态模型更容易收敛到机器学习标注业务，以及哪一套交互更贴近图片标注场景。

`canvas-select` 的数据模型更偏图元描述，业务方通常仍然需要继续定义和维护：

- 哪些图形才算真正的训练标注对象
- 图形与业务标签如何绑定
- 如何把前端图元稳定映射成后端需要的 `bbox` / `segmentation` / `class_id`
- 如何处理不同任务模板下的数据兼容
- 如何约束哪些工具可用于哪些任务

也就是说，它给的是一套较强的“绘制表达能力”，同时也提供了可以用于标注的数据点位；但训练数据标注里真正麻烦的那层“标注语义约束”，仍然需要业务自己收口。

另外，从交互体验上看，`canvas-select` 的 Demo 已经能做到缩放、拖拽、编辑、画笔等完整能力，但整体手感更偏“画布操作”。相对地，`Annotorious + OpenSeadragon` 在图片浏览与标注结合场景下，拖拽、缩放、平移的丝滑程度和动效表现更成熟，这也是本次更倾向 Annotorious 的一个实际原因。

再次，如果严格按“从 0 开始做一页机器学习图像标注”的口径来比较，关键不是看谁能画出更多图元，而是看谁在首版就能更低成本地支撑训练标注闭环。

从 0 开始时，前端真正要交付的不是单纯绘制，而是下面这些能力一起成立：

- 图像加载与缩放
- 图形创建、编辑、删除、选中
- 标注结果回显
- 标签与图形绑定
- 前端标注结构与后端 `bbox` / `segmentation` / `class_id` 双向转换
- 提交前的数据约束与校验

在这组要求下，`canvas-select` 的首版成本通常会体现在这些地方：

- 需要先决定“哪种图元对应哪种训练标注语义”
- 需要自己整理图元状态到业务 annotation 状态的映射
- 需要自己约束每种任务模板允许哪些工具
- 需要自己处理图形编辑后的数据清洗与提交格式统一

它的优势是绘图表达丰富、视觉结果直观、图元能力覆盖面广，但这些优势并不会自动减少训练标注系统里的业务适配工作量。

相对地，如果从 0 开始只做“图像标注”而不是“通用画布编辑器”，`Annotorious` 的优势主要在于：

- 起点就是 annotation 模型，而不是以图元为中心的模型
- 更容易围绕标注对象做创建、更新、删除、选中等生命周期管理
- 更适合把结果稳定收敛到训练数据结构
- 更容易限制工具能力，让页面只暴露当前任务真正需要的交互
- 在图片标注场景下，官方提供的拖拽、缩放、平移体验更自然

因此，这里的判断不是“`canvas-select` 只是画图工具、没有点位数据”，恰恰相反，它也能表达标注所需的坐标信息。真正的区别在于：

- `canvas-select` 在工具种类和图元表达上很完整
- 但状态模型更偏图元层，业务需要自己进一步收口
- `Annotorious` 更偏标注对象层
- 同时其数据组织方式更容易对齐当前后端使用的 `bbox` / `segmentation` / `class_id` 结构
- 在图片拖拽、放大、缩小这类交互上，官方方案的体验也更丝滑

最后，`canvas-select` 提供的画笔、橡皮擦、网格等能力，看起来很强，但它们并不天然等价于当前业务需要的“训练标注能力”。例如：

- 画笔/橡皮擦更接近自由绘制或掩膜编辑
- 网格选择更接近特殊交互工具
- 圆形也不是当前后端训练数据结构里的主流目标

而当前项目现阶段最明确的数据结构仍然是：

- `bbox`
- `segmentation`
- `class_id`

所以这次没有选 `canvas-select`，不是因为它弱，也不是因为它没有更新，而是因为结合官方文档、公开 Demo 和当前业务接口结构来看：

- Annotorious 在图片标注交互上更丝滑
- Annotorious 的数据组织方式更容易适配当前后端结构
- canvas-select 仍然是一个能力完整、值得认真评估的方案，但在这个需求上整体适配成本更高

如果后续需求发生变化，例如：

- 需要自由画笔式掩膜编辑
- 需要橡皮擦直接修补区域
- 需要更丰富的几何图形工具箱
- 需要做一个独立的重交互标注工作台

那么 `canvas-select` 仍然值得重新评估，甚至可能会比 Annotorious 更合适。

### 4.5 为什么没有选 react-image-annotate

这里也评估过 `react-image-annotate` 这类现成图片标注库，但最终没有作为当前页面的主方案，主要原因如下：

优点：

- 开箱即用程度较高
- 自带一套完整标注工作台形态
- 对框选、点选、区域管理这类通用交互支持较多

但对当前项目来说，问题也比较明显：

- 它更像一个“完整标注应用”，而不是一个“可嵌入现有详情页的轻量标注内核”
- 默认 UI、状态组织和交互模型比较强，会侵入当前页面结构
- 当前页面已经有自己的标签栏、右侧信息区、分页、提交逻辑，接入后往往需要反向适配它，而不是它适配我们
- 我们当前更关注“把标注能力嵌入现有业务页面”，而不是直接引入一整套独立工作台
- 业务数据结构是围绕现有页面和后端接口组织的，使用 `react-image-annotate` 仍然需要额外做一层数据转换和状态桥接
- 后续如果只想补充某一种工具能力，例如线、矩形、点，Annotorious 的插件化和页面级自定义组合会更灵活

换句话说，`react-image-annotate` 不是不能用，而是它更适合：

- 新起一个独立标注页面
- 接受它已有的工作台 UI
- 围绕它的 region/state 设计业务层

而当前这个页面的约束是：

- 要保留现有布局
- 要尽量少改现有交互结构
- 要让标注能力作为一个局部区域嵌入

在这个前提下，Annotorious 更适合作为“底层标注引擎”：

- 核心绘制能力够用
- React 接入轻
- 生命周期清晰
- 插件可扩展
- 业务层可以继续保留自己的页面结构和状态模型

所以这次没有选 `react-image-annotate`，不是因为它能力弱，而是因为它和当前页面的嵌入式改造目标不匹配，整体接入成本和结构侵入性都更高。

## 5. 当前接入范围

当前 Annotorious 主要用于：

- `image-segmentation` 图像分割任务

未改造的任务类型仍保留原先实现：

- 文本分类
- 实体识别
- 图像分类
- 目标检测

也就是说，Annotorious 当前不是全站通用标注框架，而是优先落在图像分割详情页这一条业务链路上。

## 6. 依赖说明

### 6.1 已安装依赖

见：

- `apps/lab/package.json`

当前相关依赖为：

```json
{
  "@annotorious/react": "^3.8.0",
  "openseadragon": "^6.0.2"
}
```

### 6.2 为什么还装了 openseadragon

虽然当前页面使用的是普通图片标注能力，没有直接使用 OpenSeadragon Viewer，但 `@annotorious/react` 的导出链路里会触发 `@annotorious/openseadragon` 的预构建。

如果不安装 `openseadragon`，Vite 在依赖预构建阶段会报错：

```text
Could not resolve "openseadragon"
```

所以这里安装 `openseadragon` 的目的主要是：

- 满足 peer dependency
- 保证 Vite dev server 正常启动和 HMR 正常工作

## 7. 当前页面实现结构

当前核心页面：

- `apps/lab/src/pages/MachineAnnotation/components/OnlineAnnotationDetailPage.tsx`

其页面结构大致分为三部分：

### 7.1 左侧标签栏

负责展示和维护标签：

- 展示当前任务的标签列表
- 支持新增标签
- 支持删除未被使用的标签

### 7.2 中间标注工作区

当任务类型为 `image-segmentation` 时，进入专门的 Annotorious 工作区：

- 外层使用 `Annotorious`
- 内层使用 `ImageAnnotator`
- 绘图工具固定为 `polygon`
- 支持选中 annotation
- 支持删除 annotation
- 支持右侧面板修改 annotation 对应的 `class_id`

### 7.3 底部分页与提交

页面底部仍沿用原有分页逻辑：

- 按页切换样本
- 每页单独维护 annotation state
- 提交时输出当前页结构化结果

## 8. 业务数据结构设计

类型定义位于：

- `apps/lab/src/pages/MachineAnnotation/types.ts`

### 8.1 页面级样本结构

```ts
export interface OnlineAnnotationPageItem {
  id: number
  image?: string
  imageWidth?: number
  imageHeight?: number
  // annotations?: ImageAnnotationItem[]
}
```

### 8.2 单个标注结构

```ts
export interface ImageAnnotationItem {
  id?: string
  class_id: number
  segmentation: number[][]
}
```

这个结构与后端风格基本一致，重点字段为：

- `class_id`：标签类别 ID
- `segmentation`：多边形点集，采用扁平数组

## 9. 后端数据与 Annotorious 的映射方案

这是本次实现最关键的部分。

### 9.1 后端返回结构

当前后端样本结构类似：

```text
{
  "image": "images/0.png",
  "height": 720,
  "width": 1280,
  "annotations": [
    {
      "class_id": 4,
      "segmentation": [[x1, y1, x2, y2, ...]]
    }
  ]
}
```

### 9.2 Annotorious 内部结构

Annotorious 使用的是 annotation 模型，核心包含：

- `id`
- `bodies`
- `target.selector`

其中 polygon 对应的数据结构大致是：

```text
{
  id: 'anno-id',
  bodies: [...],
  target: {
    annotation: 'anno-id',
    selector: {
      type: ShapeType.POLYGON,
      geometry: {
        bounds,
        points
      }
    }
  }
}
```

### 9.3 前端转换函数

当前实现里主要有以下几个转换函数：

- `toAnnotoriousAnnotation`
- `toBackendAnnotation`
- `buildAnnotationBodies`
- `getClassIdFromAnnotation`
- `toPolygonPoints`
- `toBounds`

作用如下：

#### `toAnnotoriousAnnotation`

把业务后端的：

- `class_id`
- `segmentation`

转成 Annotorious 能识别的 polygon annotation。

#### `toBackendAnnotation`

把用户在前端编辑后的 Annotorious annotation，重新转回：

```text
{
  "class_id": 1,
  "segmentation": [[...]]
}
```

#### `buildAnnotationBodies`

为了让 annotation 内部保留标签信息，会将：

- 标签名
- `class_id`

放入 `bodies` 中，便于后续读取和同步。

## 10. 页面状态管理方案

当前页面没有引入额外状态管理库，而是基于 React 本地 state 组织。

### 10.1 标签状态

```ts
// const [labels, setLabels] = useState(task.labels)
```

### 10.2 分页状态

```ts
// const [currentPage, setCurrentPage] = useState(1)
// const [pageInput, setPageInput] = useState(1)
```

### 10.3 每页标注状态

```ts
// const [pageAnnotations, setPageAnnotations] = useState<Record<number, ImageAnnotationItem[]>>({})
```

这个设计的好处是：

- 每一页的标注独立存储
- 切页时不会丢失当前编辑结果
- 提交时可以按当前页或整任务聚合

### 10.4 当前选中区域状态

在分割工作区中维护：

```ts
// const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
```

用途：

- 右侧展示选中区域信息
- 支持删除当前选中区域
- 支持修改当前选中区域的标签

## 11. 当前交互实现说明

### 11.1 新增区域

通过按钮调用：

- `annotator.setDrawingTool('polygon')`
- `annotator.setDrawingEnabled(true)`

用户在图上逐点点击后，双击闭合多边形。

### 11.2 取消绘制

通过：

- `annotator.cancelDrawing()`
- `annotator.setDrawingEnabled(false)`

取消当前未完成的 polygon 绘制。

### 11.3 删除区域

通过：

- `annotator.removeAnnotation(selectedAnnotationId)`

删除当前选中区域。

### 11.4 修改标签

选中区域后，在右侧 `Select` 中选择标签，前端会：

1. 获取当前 annotation
2. 重建 `bodies`
3. 更新 `properties.classId`
4. 调用 `annotator.updateAnnotation`

### 11.5 事件同步

当前监听了 Annotorious 的这些生命周期事件：

- `createAnnotation`
- `updateAnnotation`
- `deleteAnnotation`
- `selectionChanged`

作用分别是：

- 创建后同步回业务 state
- 更新后同步回业务 state
- 删除后同步回业务 state
- 选中变化时同步右侧面板

## 12. Mock 数据方案

当前 mock 数据位于：

- `apps/lab/src/pages/MachineAnnotation/mockData.tsx`

并且已支持从：

- `apps/lab/src/pages/MachineAnnotation/Untitled-2.json`

直接读取大规模分割样本。

这样设计的好处是：

- 后续替换大样本时不必改 TS 逻辑
- 可以直接拿后端导出的 JSON 做本地联调
- mock 数据和真实接口数据结构更接近

## 13. 本次实现遇到的问题

### 13.1 Vite 动态导入失败

现象：

- 页面加载时报 `Failed to fetch dynamically imported module`

根因：

- 实际是页面内部 TypeScript 编译失败，导致对应模块无法被 Vite 正常加载

处理方式：

- 修正 `useAnnotator` 引用
- 修正 polygon 类型
- 修正 Annotorious 样式颜色类型

### 13.2 `openseadragon` 无法解析

现象：

- Vite 预构建时报 `Could not resolve "openseadragon"`

根因：

- `@annotorious/react` 的依赖导出链路带出 `@annotorious/openseadragon`
- 其 peer dependency 未安装

处理方式：

- 安装 `openseadragon`

### 13.3 `Cannot read properties of null (reading 'setDrawingTool')`

现象：

- Annotorious 实例尚未准备好时，代码已开始调用实例方法

根因：

- `useAnnotator()` 或 `ref` 的初始化早晚于 effect / 交互触发

处理方式：

- 所有实例调用前统一加空值保护
- 在 effect 中先判断 annotator 是否存在
- 按钮交互中增加初始化保护提示

## 14. 当前实现的优点

- 已经能跑通从 mock 数据到页面渲染再到结果回写的完整链路
- 业务数据结构与后端风格一致
- 页面现有布局改动较小，保留了标签栏、分页、配置面板等既有结构
- 后续从 mock 切到接口的成本较低

## 15. 当前实现的局限

### 15.1 仅覆盖图像分割

目前只是对 `image-segmentation` 任务接入了 Annotorious，其它图像任务还未统一到同一标注框架。

### 15.2 图片资源仍以 mock 为主

当前虽然能接大规模 JSON 标注数据，但真实图片资源仍可能是 mock 图或本地占位图。

### 15.3 提交逻辑仍是演示级

当前“提交标注”主要是：

- 将当前页结果组装成 payload
- 输出到控制台

尚未真正调用后端接口。

### 15.4 标签与 class_id 的管理仍较简化

当前标签列表与 `class_id` 关系默认是：

- 数组索引 + 1

如果后端未来返回的是独立的 label map，例如：

```text
{
  "0": "background",
  "1": "road"
}
```

建议改成显式对象映射，而不是依赖数组位置。

## 16. 后续优化建议

### 16.1 将标签结构改为显式映射

建议将：

```ts
// labels: string[]
```

升级为：

```ts
labelMap: Record<number, string>
```

这样更适合真实生产环境。

### 16.2 支持整任务批量提交

当前是按当前页组织 payload。建议后续增加：

- 全部页标注结果汇总
- 自动保存
- 离页保护

### 16.3 支持真实图片加载与失败兜底

建议增加：

- 图片 URL 兼容处理
- 加载失败占位图
- 跨域场景说明

### 16.4 增加更完整的标注工具栏

例如：

- 撤销
- 重做
- 缩放
- 重置视图
- 快捷键提示

### 16.5 补充目标检测统一方案

如果后续目标检测也希望统一到同一套标注框架，可以继续评估：

- 是否继续使用 Annotorious 的矩形能力
- 是否为 detection / segmentation 统一封装一层业务组件

## 17. 推荐的后续落地方向

从工程角度，建议下一步按以下顺序推进：

1. 将当前 Annotorious 分割页从 mock 数据切到真实接口
2. 将标签从数组改为 `class_id -> label` 的显式映射
3. 增加自动保存与离页保护
4. 打通整任务提交接口
5. 再评估是否把目标检测一并统一到 Annotorious

## 18. 总结

本次选型选择 Annotorious，本质上是一个“在现阶段业务范围内成本最低、收益最高”的决策。

它不是最灵活的方案，但对当前“图像分割详情页标注”这个问题最合适：

- 比自研 SVG / Canvas 成本低
- 比通用画布库更贴近标注业务
- 比轻量图片批注工具更适合训练数据生产

当前实现已经完成了：

- 依赖接入
- 页面嵌入
- 生命周期联动
- 业务数据双向转换
- 大规模 mock 数据验证

后续只要继续完善接口对接、标签映射和提交链路，就可以从“演示版标注页”平滑升级到“可联调的业务标注页”。
