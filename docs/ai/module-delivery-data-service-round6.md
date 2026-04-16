# 模块开发执行模板

## 1. 本轮开发任务
- 模块名称：数据服务 - 查询与状态流转
- 本轮重点：搜索、筛选、分页、推理启动、清洗启动

## 2. 实际修改
- [dataServiceApi.ts](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/services/dataServiceApi.ts)
  - 新增列表查询接口：
    - `listDatasets`
    - `listInferenceResults`
    - `listAnnotationTasks`
    - `listCleaningTasks`
  - 新增状态流转接口：
    - `startInferenceResult`
    - `startCleaningTask`
  - 新增分页结果类型 `PaginatedResult`

- [dataServiceStore.ts](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/services/dataServiceStore.ts)
  - 新增本地状态流转：
    - `startInferenceResult`
    - `startCleaningTask`

- [dataServiceServer.mjs](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/server/dataServiceServer.mjs)
  - 新增 GET 列表查询逻辑
  - 新增推理结果与清洗任务的 `start` 接口
  - 新增分页、搜索、筛选支持

- 页面接入：
  - [TrainingDataset.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/TrainingDataset.tsx)
  - [TestDataset.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/TestDataset.tsx)
  - [InferenceResult.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/InferenceResult.tsx)
  - [DataAnnotation.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/DataAnnotation.tsx)
  - [DataCleaning.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/DataCleaning.tsx)

## 3. 自检结果
- `npm run build` 通过
- 数据服务主要列表页已从本地组件过滤升级为 API 查询
- 推理结果和清洗任务已有最小状态流转

## 4. 下一步建议
- 补更完整的详情字段和状态约束
- 在可监听端口环境下联调 `dev:api`
- 再视整体进度统一优化数据服务页面视觉和交互细节

