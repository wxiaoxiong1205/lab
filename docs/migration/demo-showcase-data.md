# 演示数据后端化与正式域名静态演示说明

## 目标

演示数据属于生产基线的一部分，不再依赖前端默认 mock。生产代码后续更新时，可以按生产模型调整演示数据内容，但不能删除以下能力：

- `python -m app.init_db.init demo_showcase` 可重复初始化演示数据。
- 演示数据通过生产 API 被前端读取。
- `VITE_SHOWCASE_STATIC=true` 可让正式演示域名不依赖远程后端，直接通过前端静态适配层读取提交到仓库的演示数据。
- `builtin-sample://` 只读样例路径可以支持列表、详情和预览，不伪装成真实外部存储。
- 前端 `src/mock` 仅作为演示覆盖层兜底，不能无条件覆盖后端数据；正式演示必须显式开关，本地 `localhost` 开发可在接口失败或返回空数据时自动兜底。
- 独立演示域名如需免 IAM 读取后端演示数据，必须使用隔离演示后端，并显式设置 `SHOWCASE_PREVIEW_AUTH=true`；该 token 只允许读请求，默认生产环境不开启。

## 初始化

在 `production/backend` 配好数据库环境后执行：

```bash
python -m app.init_db.init demo_showcase
```

独立演示环境还需要：

```bash
SHOWCASE_PREVIEW_AUTH=true
```

正式演示域名的前端生产构建必须启用：

```bash
VITE_SHOWCASE_PREVIEW=true
VITE_SHOWCASE_STATIC=true
```

Vercel Production 环境变量需要配置这两个开关。当前正式域名 `lab.aidaxiong.fun` 采用静态演示模式：菜单、用户、项目、数据集、任务、模型、Notebook、推理、评估、标注和机器学习入口由 `src/showcase/staticApi.ts` 在统一请求层直接返回，浏览器不会真正请求远程后端。这样可以绕开公网后端鉴权、机器权限和服务可用性限制，保证演示域名稳定可打开。

静态演示层不是临时空壳兜底，后续同步生产代码时必须保留各核心模块的代表性演示数据：

- 数据处理：数据清洗、数据增强、数据洞察需要覆盖已完成、运行中、排队中或失败态，并能看到 SFT prompt-response、role-based、多轮样本、异常样本、增强结果和洞察结果。
- 大模型训练：需要覆盖文本生成 SFT、DPO、GRPO，以及 V1.15 图像生成 SFT 的任务、训练后模型和失败样例。
- Notebook：Notebook 广场和实例列表需要覆盖数据处理、SFT 训练、DPO 训练、GRPO 训练、模型评估等大模型案例。
- 推理与推理结果集：需要覆盖文本生成、图像理解、图像生成的推理服务、离线/在线推理结果集、成功、生成中和失败态。
- 数据标注：需要覆盖文本生成、图像理解、图像生成和机器学习标注，多人标注总览需有可展示的进度、完成和失败数据。
- 效果评估：自动评估、人工评估、基准评估都要有文本生成、图像理解或图像生成示例；图像生成必须能看到裁判员评估、人工评估、失败任务、基准评估和图片明细。
- 机器学习数据管理：文本分类、实体识别、图像分类、物体检测、实例分割（标准/孔洞）和语义分割至少保留多类型、多状态数据。

如果新增生产接口字段导致静态演示列表为空，应优先补齐 `production/frontend/apps/lab/src/showcase/staticApi.ts` 与后端 `demo_showcase` seed 的同等字段，而不是删除演示记录或回退成两条占位任务。

真实后端演示模式仍然保留：关闭 `VITE_SHOWCASE_STATIC` 后，前端会回到后端优先路径；此时后端必须显式设置 `SHOWCASE_PREVIEW_AUTH=true`，否则正式域名会出现页面可打开但接口 401、模块列表为空的情况。演示 token 不允许写操作，创建、删除、启动、停止等真实变更仍需要正式 IAM/JWT。

本地开发演示模式单独处理：`localhost`、`127.0.0.1`、`0.0.0.0` 下允许前端在后端接口失败、租户没有项目、`/menu` 返回空数组或模块列表为空时使用提交到仓库的预览数据兜底。该能力集中在 `production/frontend/apps/lab/src/mock/localPreviewData.ts` 的 `isLocalPreview` / `isLocalDemoFallbackEnabled`，权限菜单统一通过 `src/utils/permission.ts` 的 `getEffectiveUserMenus` 消费。后续同步生产代码时，不能只恢复项目列表而遗漏菜单、路由守卫、布局菜单和 `hasAuth`，否则会再次出现“有项目但无入口”或“有入口但 403”。

该命令会初始化：

- 演示用户、项目、集群、存储、镜像仓库、基础模型和镜像。
- 训练/验证/测试数据集，覆盖 SFT、DPO、GRPO、图像理解和图像生成。
- 机器学习数据集，覆盖文本分类、实体识别、图像分类、物体检测和图像分割。
- 推理结果、训练任务、评估任务、清洗、增强、洞察和在线标注任务的演示记录。
- Notebook、Notebook 端口、训练后模型、机器学习模型、在线推理服务和推理部署任务。
- 文件管理、OpenAPI 应用、第三方业务接口、在线标注服务、镜像构建日志和统一任务执行记录。
- 基准评测数据集、基准评测任务、模型/数据集关联、评测结果和榜单。

命令按名称、项目、版本等业务键做幂等检查，可以反复执行。

## 覆盖边界

演示 seed 要覆盖每个可达生产模块的不同展示类型：

- 基础资源：至少包含可用项目、用户、集群、存储、镜像仓库、Notebook 镜像、推理镜像和数据处理镜像。
- 数据模块：训练、验证、测试、业务训练、业务测试、机器学习、推理结果、业务推理结果都要有已完成、处理中或失败等不同状态；业务训练/业务测试使用 `business` 格式。
- 模型模块：基础模型、训练后模型、机器学习模型都要覆盖可用、运行中或失败状态。
- 任务模块：训练、推理、评估、清洗、增强、洞察、标注、基准评测、镜像构建都要有列表可展示数据；其中已有正式 `TaskExecutionBusinessType` 的训练、推理结果、业务推理结果、评估、清洗、基准评测、镜像构建必须同步写入统一任务执行表。
- 开放与集成模块：在线推理服务、第三方接口、OpenAPI 应用、文件管理、在线标注服务都要有安全占位数据，不能包含真实 Token、密钥或外部系统凭据。

## 生产代码更新后的检查

每次同步或覆盖生产代码后，先运行：

```bash
python3 production/backend/scripts/audit_demo_showcase.py
```

如果审计失败，说明演示数据入口、样例协议、预览读取或前端显式兜底约束被覆盖，需要按最新生产代码恢复等价能力。

当前审计会检查：

- `demo_showcase` seeder、CLI、样例协议和前端显式兜底入口没有被删。
- 本地演示覆盖层仍保留统一入口：`localPreviewData.ts` 提供 `isLocalPreview` / `isLocalDemoFallbackEnabled`，`permission.ts` 提供 `getEffectiveUserMenus`，项目列表、菜单接口、路由守卫和布局菜单不得各自实现分散兜底。
- 前端生产发布前置检查确认 Vercel Production 已配置 `VITE_SHOWCASE_PREVIEW`，且统一请求层会在演示预览模式下自动补只读 token。
- 训练数据集覆盖 `training`、`validation`、`test`、`business_training`、`business_test`。
- 训练/机器学习数据集覆盖 `completed`、`pending`、`failed` 状态。
- 机器学习数据集覆盖文本分类、实体识别、图像分类、物体检测、图像分割。
- 样例路径使用可提交的 `builtin-sample://` 协议。
- 训练、推理、评估、清洗、增强、洞察、标注、基准评测和镜像构建都有代表性状态数据。
- 推理结果和业务推理结果包含失败态，训练、推理结果、业务推理结果、评估、清洗、基准评测和镜像构建写入统一任务执行表。

上线前后还需要运行：

```bash
npm run verify:showcase-static
npm run verify:lab-browser
```

静态检查会确认正式演示主路径的静态接口覆盖仍存在，并用 `VITE_SHOWCASE_STATIC=true` 做一次前端构建。浏览器冒烟会访问各模块入口，并把 API 的 401、403、404、5xx 当作失败；这用于防止“页面壳能打开但演示数据实际没有调通”的假通过。

如果要验证真实后端演示模式，再单独运行：

```bash
npm run verify:showcase-backend
```

后端检查会用演示 token 读取项目、菜单和权限入口；如果当前后端未开启 `SHOWCASE_PREVIEW_AUTH=true`，该检查会失败，这是后端模式未就绪，不影响静态演示模式。

## 调整原则

- 可以根据最新生产字段、枚举、状态机调整 seed 内容。
- 不提交真实 `.env`、数据库文件、Token、SSH key 或外部系统凭据。
- 如果生产 API 变更，优先适配 seed 到新 API/模型，不新增平行 mock 后端。
- 正式域名对外演示优先使用 `VITE_SHOWCASE_STATIC=true`，确保不被远程后端不可达、401 或机器权限问题打断。
- 如果确实需要正式环境临时前端兜底，必须通过 `VITE_SHOWCASE_PREVIEW=true` 或 `VITE_SHOWCASE_STATIC=true` 显式开启；本地开发兜底只允许在 localhost 生效。后续接入真实后端时，要同步更新 seed、静态适配层和浏览器冒烟。
