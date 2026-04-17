> 归档说明：本文件属于第一阶段历史材料，仅供背景回溯，不作为第二阶段默认执行依据。

# 模块开发执行模板

## 1. 本轮开发任务
- 模块名称：数据服务 - 查询与状态流转
- 目标页面/功能：训练数据管理、测试数据管理、推理结果集、数据标注、数据清洗
- 对应生产环境模块：数据服务标准链路
- 本轮任务类型：补齐 / 行为层完善
- 优先级：P0
- 是否涉及用户新增/修改需求：否
- 本轮是“纯对齐生产环境”还是“基于生产环境演进”：纯对齐生产环境

## 2. 本轮目标
- 将列表页的搜索/筛选/分页收口到 API 查询层
- 为推理结果集和数据清洗补状态流转接口
- 保持页面仍可在本地 fallback store 下运行

## 3. 实际修改

### 3.1 API 层
- [dataServiceApi.ts](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/services/dataServiceApi.ts)
  - 新增：
    - `listDatasets`
    - `listInferenceResults`
    - `listAnnotationTasks`
    - `listCleaningTasks`
    - `startInferenceResult`
    - `startCleaningTask`
  - 增加分页结果类型 `PaginatedResult`
  - 增加本地 fallback 查询逻辑

### 3.2 本地后端
- [dataServiceServer.mjs](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/server/dataServiceServer.mjs)
  - 新增 GET 列表查询接口
  - 新增推理结果 `start` 接口
  - 新增清洗任务 `start` 接口
  - 支持分页、搜索、筛选

### 3.3 页面接入
- [TrainingDataset.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/TrainingDataset.tsx)
  - 列表改为调用 `listDatasets`
  - 分页改为受控
- [TestDataset.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/TestDataset.tsx)
  - 列表改为调用 `listDatasets`
  - 分页改为受控
- [InferenceResult.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/InferenceResult.tsx)
  - 列表改为调用 `listInferenceResults`
  - “启动”改为调用状态流转接口
- [DataAnnotation.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/DataAnnotation.tsx)
  - 列表改为调用 `listAnnotationTasks`
- [DataCleaning.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/DataCleaning.tsx)
  - 列表改为调用 `listCleaningTasks`
  - “启动”改为调用状态流转接口
  - 增加清洗状态筛选

## 4. 自检结果
- `npm run build` 通过
- 页面仍可在无后端监听时通过 fallback 数据运行
- 当前沙箱内仍无法实际监听 API 端口，因此 HTTP 运行联调待本地环境验证

## 5. 下一步建议
- 下一优先项：
  - 丰富详情页真实字段
  - 给推理结果、标注任务、清洗任务增加更多状态和可操作约束
  - 在可监听端口环境下验证 `dev:api + dev`
