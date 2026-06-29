import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { lazy } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'
import ProjectLayout from '../layouts/ProjectLayout'
import HomePageWrapper from '../components/HomePageWrapper'
import DocCenterFrame from '../pages/Docs/DocCenterFrame'
import DynamicRedirect from '../components/DynamicRedirect'
import NotFound from '@/components/NotFound.tsx'

// 鎳掑姞杞介〉闈㈢粍浠?
const DatasetList = lazy(() => import('../pages/DatasetList'))
const DatasetComparison = lazy(() => import('../pages/DatasetComparison'))
const DatasetLogComparison = lazy(
  () => import('../pages/DatasetLogComparison'),
)
const PromptList = lazy(() => import('../pages/PromptList'))
const PromptDirectoryManagement = lazy(
  () => import('../pages/PromptDirectoryManagement'),
)
const LLMConfigList = lazy(() => import('../pages/LLMConfigList'))
const ChainTest = lazy(() => import('../pages/ChainTest'))
const DatasetLogList = lazy(() => import('../pages/DatasetLogList'))
const AdminProjectList = lazy(() => import('../pages/AdminProjectList'))
const AdminUserList = lazy(() => import('../pages/AdminUserList'))
const PlatformManagement = lazy(() => import('../pages/platformManagement'))
const TaskOverview = lazy(() => import('../pages/taskOverview'))
const ProjectSpacePage = lazy(() => import('../pages/ProjectSpacePage'))
const KubernetesManagement = lazy(() => import('../pages/KubernetesManagement'))
const StorageConfigList = lazy(() => import('../pages/StorageConfigList'))
const RegistryConfigList = lazy(() => import('../pages/RegistryConfigList'))
const RegistryConfigForm = lazy(() => import('../pages/RegistryConfigForm'))
const RegistryMirrorList = lazy(() => import('../pages/RegistryMirrorList'))
const RegistryMirrorForm = lazy(() => import('../pages/RegistryMirrorForm'))
const ProjectMemberManagement = lazy(() => import('../pages/ProjectMemberManagement'))
const BaseModelManagement = lazy(() => import('../pages/baseModel'))
const BaseModelLogsPage = lazy(() => import('../pages/BaseModelLogsPage'))

const Evaluation = lazy(() => import('../pages/Evaluation'))
const EvaluationDetail = lazy(() => import('../pages/EvaluationDetail'))
const BussinessReportDetail = lazy(() => import('@/pages/EvaluationManagement/components/BussinessReportDetail'))
const EvaluationCompare = lazy(() => import('../pages/EvaluationCompare'))
const DirectoryManagement = lazy(() => import('../pages/DirectoryManagement'))
const MetricList = lazy(() => import('../pages/MetricList'))
const FileManagement = lazy(() => import('../pages/fileManagement'))
const FolderDetail = lazy(() => import('../pages/fileManagement/FolderDetail'))

// 浠诲姟绠＄悊椤甸潰
const TaskList = lazy(() => import('../pages/TaskList'))
const TaskDetail = lazy(() => import('../pages/TaskDetail'))
const TaskCreate = lazy(() => import('../pages/TaskCreate'))
const MetricDirectoryManagement = lazy(
  () => import('../pages/MetricDirectoryManagement'),
)

// 棰勭疆妯″瀷璋冨弬鍔熻兘椤甸潰
const PresetModelMarket = lazy(() => import('../pages/PresetModelMarket'))
const PresetModelWizard = lazy(() => import('../pages/PresetModelWizard'))
const PresetModelTaskList = lazy(() => import('../pages/PresetModelTaskList'))
const PresetModelResult = lazy(() => import('../pages/PresetModelResult'))

// 寰皟鍔熻兘鐩稿叧椤甸潰
const SimpleFinetuneTraining = lazy(() => import('../pages/SimpleFinetuneTraining'))
const CreateFinetuneRun = lazy(() => import('../pages/CreateFinetuneRun'))
const FinetuneTaskDetail = lazy(() => import('../pages/FinetuneTaskDetail'))
const CreateFinetuneTask = lazy(() => import('@/pages/CreateFinetuneTask'))

// Notebook鐩稿叧椤甸潰
const NotebookList = lazy(() => import('../pages/NotebookList'))
const CreateNotebook = lazy(() => import('../pages/CreateNotebook'))
const NotebookDetail = lazy(() => import('../pages/NotebookDetail'))
const NotebookCaseDetail = lazy(() => import('../pages/noteBook/NotebookCaseDetail'))
const CustomImage = lazy(() => import('../pages/noteBook/CustomImage'))
const PublishCase = lazy(() => import('../pages/noteBook/PublishCase'))

// 瀹為獙绠＄悊鍔熻兘椤甸潰
const ExperimentRunDetail = lazy(() => import('../pages/ExperimentRunDetail'))

// 鏁版嵁鏍囨敞椤甸潰
// const DataAnnotation = lazy(() => import("../pages/DataAnnotation"));

// 鏁版嵁娓呮礂椤甸潰
const DataCleaning = lazy(() => import('../pages/DataCleaning'))
const CreateCleaningTask = lazy(() => import('../pages/CreateCleaningTask'))
const CleaningTaskDetail = lazy(() => import('../pages/CleaningTaskDetail'))
const DataInsight = lazy(() => import('../pages/dataInsight/DataInsight'))
const CreateDataInsightTask = lazy(() => import('../pages/dataInsight/CreateDataInsightTask'))
const DataInsightDetail = lazy(() => import('../pages/dataInsight/DataInsightDetail'))
const DataAugmentation = lazy(() => import('../pages/dataAugmentation/DataAugmentation'))
const CreateDataAugmentationTask = lazy(() => import('../pages/dataAugmentation/CreateDataAugmentationTask'))
const DataAugmentationDetail = lazy(() => import('../pages/dataAugmentation/DataAugmentationDetail'))

// 妯″瀷绠＄悊椤甸潰
const ModelList = lazy(() => import('../pages/ModelList'))
const ModelCreate = lazy(() => import('@/components/models/CreateModelPage'))
const ModelDetail = lazy(() => import('../pages/ModelDetail'))
const CreateVersionPage = lazy(() => import('../pages/modalCreateVersion'))
const ModelLogsPage = lazy(() => import('../pages/ModelLogsPage'))
const MichineModelManagerPage = lazy(() => import('../pages/michineModelManager'))
const MichineModelManagerCreatePage = lazy(() => import('../pages/michineModelManager/create'))
const MichineModelManagerDetailPage = lazy(() => import('../pages/michineModelManager/detail'))
const MichineModelManagerCreateVersionPage = lazy(() => import('../pages/michineModelManager/createVersion'))

// 涓氬姟娴嬭瘯鏁版嵁闆?
const BusinessTest = lazy(() => import('../pages/dataManage/BusinessTest'))

// 涓氬姟鎺ㄧ悊鏁版嵁闆?
const BusinessInference = lazy(() => import('../pages/dataManage/BusinessInference'))

// 璁粌鏁版嵁绠＄悊
const CreateTrainingDatasetPage = lazy(() => import('@/pages/training/CreateTrainingDatasetPage'))
const TrainingDatasetDetail = lazy(() => import('../pages/TrainingDatasetDetail'))
const CreateDatasetVersionPage = lazy(() => import('@/pages/training/CreateDatasetVersion'))
const TrainingTaskDetail = lazy(() => import('@/pages/trainingTaskDetail'))

// 鎺ㄧ悊缁撴灉闆?
const InferenceResultSet = lazy(() => import('../pages/InferenceResultSet'))
const CreateInferenceResultSetPage = lazy(() => import('../pages/inference/CreateInferenceResultSetPage'))
const InferenceResultSetDetail = lazy(() => import('../pages/InferenceResultSetDetail'))

// 娴嬭瘯鏁版嵁绠＄悊
const TestManagement = lazy(() => import('../pages/DirectoryTestManagement.tsx'))
const CreateTestingDatasetPage = lazy(() => import('../pages/testing/CreateTestingDatasetPage.tsx'))
const TestingDatasetDetail = lazy(() => import('../pages/TestingDataseDetail.tsx'))
const CreateTestDatasetTestVersion = lazy(() => import('../pages/testing/CreateTestDatasetTestVersion.tsx'))

// 鍦ㄧ嚎鎺ㄧ悊鏈嶅姟
const CreateServicePage = lazy(() => import('../pages/service/CreateServicePage.tsx'))
const InferenceServiceDetail = lazy(() => import('../pages/service/InferenceServiceDetail.tsx'))
const CreateAttributePage = lazy(() => import('../pages/service/CreateAttributePage'))
const LLMServicePage = lazy(() => import('../pages/service/LLMService'))
const LLMInferenceService = lazy(() => import('../pages/service/LLMInferenceService'))
const ExternalInferenceServicePage = lazy(() => import('../pages/OnlineInferenceService'))
const DeployDetail = lazy(() => import('../pages/service/DeployDetail.tsx'))
const DeployServicePage = lazy(() => import('../pages/service/DeployServicePage.tsx'))
const OnlineReasoningService = lazy(() => import('../pages/./OnlineInferenceService'))
// 璇勪及绠＄悊
const EvaluationIndicator = lazy(() => import('@/pages/EvaluationManagement/EvaluationIndicator'))
const CreateEvaluationIndicatorPage = lazy(() => import('@/pages/EvaluationManagement/CreateEvaluationIndicatorPage'))
const EffectEvaluation = lazy(() => import('@/pages/EvaluationManagement/EffectEvaluation'))
const BussinessEffectEvaluation = lazy(() => import('@/pages/EvaluationManagement/BussinessEffectEvaluation'))
const EvaluationReportDetail = lazy(() => import('@/pages/EvaluationManagement/components/EvaluationReportDetail'))
const ManualEvaluationDetail = lazy(() => import('@/pages/EvaluationManagement/components/ManualEvaluationDetail'))
const CreateAutoEvaluationTask = lazy(() => import('@/pages/EvaluationManagement/components/CreateAutoEvaluationTask'))
const BussinessCreateAutoEvaluationTask = lazy(() => import('@/pages/EvaluationManagement/components/BussinessCreateAutoEvaluationTask'))
const CreateBenchmarkEvaluationTask = lazy(() => import('@/pages/EvaluationManagement/components/CreateBenchmarkEvaluationTask'))
const CreateManualEvaluationTask = lazy(() => import('@/pages/EvaluationManagement/components/CreateManualEvaluationTask'))
const DataAnnotationPage = lazy(() => import('../pages/dataAnnotation/index.tsx'))
const CreateAnnotationTaskPage = lazy(() => import('../pages/dataAnnotation/components/CreateAnnotationTaskModal.tsx'))
const CreateMultiPersonAnnotationTask = lazy(() => import('../pages/dataAnnotation/CreateMultiPersonAnnotationTask.tsx'))
const AnnotationDetail = lazy(() => import('../pages/dataAnnotation/AnnotationDetail.tsx'))
const AnnotationTaskDataList = lazy(() => import('../pages/dataAnnotation/AnnotationTaskDataList.tsx'))
const TaskMemberDetail = lazy(() => import('../pages/dataAnnotation/TaskMemberDetail.tsx'))
const MachineAnnotationPage = lazy(() => import('../pages/MachineAnnotation/index.tsx'))
const OpenApiAccessKey = lazy(() => import('../pages/OpenApiAccessKey/index.tsx'))

// api鏈嶅姟
const ApiService = lazy(() => import('../pages/apiService/index.tsx'))
const CreateApiService = lazy(() => import('../pages/apiService/CreateApiService.tsx'))

// 在线标注服务
const MachineOnlineAnnotation = lazy(() => import('../pages/machineOnlineAnnotation/index.tsx'))
const CreateMachineOnlineAnnotation = lazy(() => import('../pages/machineOnlineAnnotation/CreateMachineAnnotation.tsx'))
const MachineOnlineAnnotationDetail = lazy(() => import('../pages/machineOnlineAnnotation/MachineAnnotationDetails.tsx'))

// 系统管理
const AdminSystemSettings = lazy(() => import('../pages/systemManage/systemSetting/AdminSystemSettings.tsx'))

// 机器学习数据管理
const MachineDataManagementPage = lazy(() => import('@/pages/machineLearning/MachineDataManagement.tsx'))
const CreateMachineDataset = lazy(() => import('@/pages/machineLearning/CreateMachineDataset.tsx'))
const MachineDatasetDetails = lazy(() => import('@/pages/machineLearning/MachineDatasetDetails.tsx'))
const ModelDelopyment = lazy(() => import('@/pages/machineLearning/ModelDelopyment.tsx'))
const CreateModelDelopyment = lazy(() => import('@/pages/machineLearning/CreateModelDelopyment.tsx'))

const AdminProjectMemberManagement = lazy(() => import('../pages/AdminProjectMemberManagement'))
/**
 * 搴旂敤璺敱閰嶇疆
 * 闆嗕腑绠＄悊鎵€鏈夎矾鐢憋紝鍖呮嫭椤圭洰鍜岀鐞嗗憳璺敱銆?
 *
 * 灞傜骇姒傝锛?
 * - docs                   鏂囨。
 * - root / project         椤圭洰鍏ュ彛涓庡伐浣滃彴
 * - project.admin.*        绠＄悊绔紙骞冲彴/鐢ㄦ埛/瀛樺偍/闀滃儚/鍩虹妯″瀷绛夛級
 * - project.detail.*       椤圭洰鍐咃紙:projectId 涓嬶細鏁版嵁/浠诲姟/璁粌/Notebook/妯″瀷/璇勪及/鏂囦欢绛夛級
 * - tasks.standalone.*     鐙珛浠诲姟璺敱锛堟棤 projectId锛?
 * - notFound               404
 */
const AppRoutes = () => {
  return (
    <Routes>
      {/* ---------- docs 鏂囨。 ---------- */}
      <Route
        path="/docs/*"
        element={(
          <ProtectedRoute requireMenuPermission={false}>
            <DocCenterFrame />
          </ProtectedRoute>
        )}
      />

      {/* ---------- root 鏍?/ 宸ヤ綔鍙帮紙鏃?project 鎴?鏃?projectId锛?---------- */}
      <Route
        path="/"
        element={(
          <ProtectedRoute>
            <ProjectLayout />
          </ProtectedRoute>
        )}
      >
        <Route index element={<DynamicRedirect />} />
        <Route path="home" element={<ProjectSpacePage />} />
        <Route path="api-access-key" element={<OpenApiAccessKey />} />
      </Route>

      {/* ---------- project 椤圭洰 - project.admin.* 绠＄悊绔?---------- */}
      <Route
        path="/project"
        element={(
          <ProtectedRoute>
            <ProjectLayout />
          </ProtectedRoute>
        )}
      >
        <Route path="admin" element={<ProtectedRoute adminOnly><Outlet /></ProtectedRoute>}>
          <Route path="platform-management" element={<PlatformManagement />} />
          <Route path="projects" element={<AdminProjectList />} />
          <Route path="users" element={<AdminUserList />} />
          <Route path="members" element={<AdminProjectMemberManagement />} />
          <Route path="storage" element={<StorageConfigList />} />
          <Route path="kubernetes" element={<KubernetesManagement />} />
          <Route path="registry" element={<RegistryConfigList />} />
          <Route path="registry/create" element={<RegistryConfigForm />} />
          <Route path="registry/edit/:id" element={<RegistryConfigForm />} />
          <Route path="registry/list" element={<RegistryMirrorList />} />
          <Route path="registry/list/create" element={<RegistryMirrorForm />} />
          <Route path="registry/list/edit/:id" element={<RegistryMirrorForm />} />
          <Route path="base-model" element={<BaseModelManagement />} />
          <Route path="base-model/logs" element={<BaseModelLogsPage />} />
          <Route path="settings" element={<AdminSystemSettings />} />
        </Route>
      </Route>

      {/* ---------- project.detail.* 椤圭洰鍐咃紙:projectId锛?---------- */}
      <Route
        path="/project/:projectId"
        element={(
          <ProtectedRoute>
            <ProjectLayout />
          </ProtectedRoute>
        )}
      >
        <Route index element={<DynamicRedirect />} />
        <Route path="home" element={<HomePageWrapper />} />
        <Route path="task-overview" element={<TaskOverview domain="llm" />} />

        {/* project.detail.datasets.* 璁粌鏁版嵁 / 鏁版嵁鐩綍 */}
        <Route path="datasets" element={<DirectoryManagement />} />
        <Route path="datasets/training/create" element={<CreateTrainingDatasetPage usage="training" />} />
        <Route
          path="datasets/directories/:directoryId"
          element={<DatasetList />}
        />
        <Route path="datasets/training/:datasetId" element={<TrainingDatasetDetail usage="training" />} />
        <Route path="datasets/training/:datasetId/new-version" element={<CreateDatasetVersionPage usage="training" />} />
        <Route path="datasets/comparison" element={<DatasetComparison />} />
        {/* project.detail.datasets.validation.* 楠岃瘉鏁版嵁闆? */}
        <Route path="datasets/validation/:datasetId" element={<TestingDatasetDetail usage="validation" />} />
        <Route path="datasets/validation/:datasetId/new-version" element={<CreateTestDatasetTestVersion usage="validation" />} />
        <Route path="datasets/validation/create" element={<CreateTestingDatasetPage usage="validation" />} />
        {/* project.detail.business-test.* 涓氬姟娴嬭瘯鏁版嵁闆? */}
        <Route path="business-test" element={<BusinessTest />} />
        <Route path="business-test/training/create" element={<CreateTestingDatasetPage usage="business_test" />} />
        <Route path="business-test/training/:datasetId" element={<TestingDatasetDetail usage="business_test" />} />
        <Route path="business-test/training/:datasetId/new-version" element={<CreateTestDatasetTestVersion usage="business_test" />} />
        {/* project.detail.business-inference.* 涓氬姟鎺ㄧ悊鏁版嵁闆? */}
        <Route path="business-inference" element={<BusinessInference />} />
        <Route path="business-inference/create" element={<CreateInferenceResultSetPage usage="business-inference" />} />
        <Route path="business-inference/:datasetId" element={<InferenceResultSetDetail usage="business-inference" />} />
        {/* project.detail.inference.* 鎺ㄧ悊缁撴灉闆? */}
        <Route path="Inference" element={<InferenceResultSet />} />
        <Route path="Inference/create" element={<CreateInferenceResultSetPage />} />
        <Route path="Inference/:datasetId" element={<InferenceResultSetDetail />} />
        {/* project.detail.measurement.* 娴嬭瘯鏁版嵁绠＄悊 */}
        <Route path="measurement" element={<TestManagement />} />
        <Route path="measurement/testing/create" element={<CreateTestingDatasetPage usage="test" />} />
        <Route path="measurement/testing/:datasetId" element={<TestingDatasetDetail usage="test" />} />
        <Route path="measurement/testing/:datasetId/new-version" element={<CreateTestDatasetTestVersion usage="test" />} />
        {/* project.detail.prompts.* / llm-configs / chain-test */}
        <Route path="prompts" element={<PromptDirectoryManagement />} />
        <Route
          path="prompts/directories"
          element={<PromptDirectoryManagement />}
        />
        <Route
          path="prompts/directories/:directoryId"
          element={<PromptList />}
        />
        <Route path="llm-configs" element={<LLMConfigList />} />
        <Route path="chain-test" element={<ChainTest />} />
        {/* project.detail.tasks.* 浠诲姟 */}
        <Route path="tasks" element={<TaskList />} />
        <Route path="tasks/create" element={<TaskCreate />} />
        <Route path="tasks/:taskId" element={<TaskDetail />} />
        {/* project.detail.logs.* 鏃ュ織 */}
        <Route path="logs" element={<DatasetLogList />} />
        <Route path="logs/comparison" element={<DatasetLogComparison />} />
        {/* project.detail.evaluation.* / metrics.* / members */}
        <Route path="evaluation" element={<Evaluation />} />
        <Route path="evaluation/:testRunId" element={<EvaluationDetail />} />
        <Route
          path="evaluation/compare/:testRunIds"
          element={<EvaluationCompare />}
        />
        <Route path="metrics" element={<MetricDirectoryManagement />} />
        <Route
          path="metrics/directories"
          element={<MetricDirectoryManagement />}
        />
        <Route
          path="metrics/directories/:directoryId"
          element={<MetricList />}
        />
        <Route path="members" element={<ProjectMemberManagement />} />

        {/* project.detail.training.* 澶фā鍨嬭缁冿紙涓诲叆鍙ｏ級 */}
        <Route path="training" element={<SimpleFinetuneTraining />} />
        <Route path="training/create" element={<CreateFinetuneRun />} />
        <Route path="training/runs/:runId" element={<ExperimentRunDetail />} />
        <Route path="training/tasks/:taskName" element={<TrainingTaskDetail />} />

        {/* project.detail.finetune.tasks.* 寰皟浠诲姟锛堝吋瀹癸級 */}
        <Route path="finetune/tasks" element={<SimpleFinetuneTraining />} />
        <Route path="finetune/tasks/create" element={<CreateFinetuneTask />} />
        <Route path="finetune/tasks/:taskId" element={<FinetuneTaskDetail />} />

        {/* project.detail.finetune.notebooks.* Notebook（子路径与 machine-notebook 对齐；静态段须排在 :notebookId 之前） */}
        <Route path="finetune/notebooks" element={<Navigate to="tabs/mine" replace />} />
        <Route path="finetune/notebooks/tabs/:tab" element={<NotebookList />} />
        <Route path="finetune/notebooks/create" element={<CreateNotebook />} />
        <Route path="finetune/notebooks/edit/:notebookId" element={<CreateNotebook />} />
        <Route path="finetune/notebooks/case/:caseId" element={<NotebookCaseDetail />} />
        <Route path="finetune/notebooks/mirror" element={<CustomImage />} />
        <Route path="finetune/notebooks/custom-image" element={<Navigate to="mirror" replace />} />
        <Route path="finetune/notebooks/publish-case/:notebookId" element={<PublishCase />} />
        <Route path="finetune/notebooks/:notebookId" element={<NotebookDetail />} />

        {/* project.detail.preset-model.* 棰勭疆妯″瀷璋冨弬 */}
        <Route path="preset-model" element={<PresetModelMarket />} />
        <Route path="preset-model/create" element={<PresetModelWizard />} />
        <Route path="preset-model/tasks" element={<PresetModelTaskList />} />
        <Route path="preset-model/tasks/:taskId" element={<PresetModelTaskList />} />
        <Route path="preset-model/results/:taskId" element={<PresetModelResult />} />

        {/* project.detail.data-cleaning.* 鏁版嵁娓呮礂 */}
        <Route path="data-cleaning" element={<DataCleaning />} />
        <Route path="data-cleaning/create" element={<CreateCleaningTask />} />
        <Route path="data-cleaning/:taskId" element={<CleaningTaskDetail />} />
        <Route path="data-insight" element={<DataInsight />} />
        <Route path="data-insight/create" element={<CreateDataInsightTask />} />
        <Route path="data-insight/:taskId" element={<DataInsightDetail />} />
        <Route path="data-augmentation" element={<DataAugmentation />} />
        <Route path="data-augmentation/create" element={<CreateDataAugmentationTask />} />
        <Route path="data-augmentation/:taskId" element={<DataAugmentationDetail />} />

        {/* project.detail.model.* 妯″瀷绠＄悊 */}
        <Route path="model" element={<ModelList />} />
        <Route path="model/create" element={<ModelCreate />} />
        <Route path="model/:modelName" element={<ModelDetail />} />
        <Route path="model/:modelName/create-version" element={<CreateVersionPage />} />
        <Route path="model/:taskId/logs" element={<ModelLogsPage />} />
        <Route path="michine-model-manager" element={<MichineModelManagerPage />} />
        <Route path="michine-model-manager/create" element={<MichineModelManagerCreatePage />} />
        <Route path="michine-model-manager/:modelId" element={<MichineModelManagerDetailPage />} />
        <Route path="michine-model-manager/:modelId/create-version" element={<MichineModelManagerCreateVersionPage />} />
        {/* project.detail.data-annotation.* 数据标注 */}
        <Route path="data-annotation" element={<DataAnnotationPage />} />
        <Route path="data-annotation/create" element={<CreateAnnotationTaskPage />} />
        <Route path="data-annotation/create-multi-person" element={<CreateMultiPersonAnnotationTask />} />
        <Route path="data-annotation/data-list/:taskId" element={<AnnotationTaskDataList />} />
        <Route path="data-annotation/task-members/:taskId" element={<TaskMemberDetail />} />
        <Route path="data-annotation/:taskId" element={<AnnotationDetail />} />
        <Route path="machine-annotation" element={<MachineAnnotationPage />} />
        <Route path="machine-annotation/create" element={<MachineAnnotationPage />} />
        <Route path="machine-annotation/data-list/:taskId" element={<AnnotationTaskDataList />} />
        <Route path="machine-annotation/task-members/:taskId" element={<TaskMemberDetail />} />
        <Route path="machine-annotation/review/:taskId" element={<MachineAnnotationPage />} />
        <Route path="machine-annotation/:taskId" element={<MachineAnnotationPage />} />

        {/* project.detail.service.inference.* / online-inference.* 妯″瀷涓庡湪绾挎帹鐞嗘湇鍔? */}
        <Route path="service/inference" element={<LLMServicePage />}>
          <Route path="hosted" element={<LLMInferenceService />} />
          <Route path="external" element={<ExternalInferenceServicePage />} />
        </Route>
        <Route path="service/inference/external/create" element={<CreateServicePage />} />
        <Route path="service/inference/external/attribute" element={<CreateAttributePage />} />
        <Route path="service/inference/external/:serviceId" element={<InferenceServiceDetail />} />
        <Route path="service/inference/hosted/:inference_task_id" element={<DeployDetail />} />
        <Route path="service/inference/hosted/create" element={<DeployServicePage />} />
        {/* api鏈嶅姟璺敱 */}
        <Route path="service/api" element={<ApiService />} />
        <Route path="service/api/create" element={<CreateApiService action="create" />} />
        <Route path="service/api/edit/:apiId" element={<CreateApiService action="edit" />} />
        <Route path="service/api/test/:apiId" element={<CreateApiService action="test" />} />

        <Route path="online-inference" element={<OnlineReasoningService />} />
        <Route path="online-inference/create" element={<CreateServicePage />} />
        <Route path="online-inference/:serviceId" element={<InferenceServiceDetail />} />
        {/* project.detail.evaluation-indicator.* / effect-evaluation.* / business-effect-evaluation.* 璇勪及绠＄悊 */}
        <Route path="evaluation-indicator" element={<EvaluationIndicator />} />
        <Route path="evaluation-indicator/create" element={<CreateEvaluationIndicatorPage />} />
        <Route path="evaluation-indicator/edit/:id" element={<CreateEvaluationIndicatorPage />} />
        <Route path="evaluation-indicator/view/:id" element={<CreateEvaluationIndicatorPage />} />
        <Route path="effect-evaluation/:type?" element={<EffectEvaluation />} />
        <Route path="effect-evaluation/report/:taskId" element={<EvaluationReportDetail />} />
        <Route path="business-effect-evaluation/:type?" element={<BussinessEffectEvaluation />} />
        <Route path="business-effect-evaluation/report/:taskId" element={<BussinessReportDetail />} />
        <Route path="business-effect-evaluation/auto/create" element={<BussinessCreateAutoEvaluationTask />} />
        <Route path="effect-evaluation/manual/:taskId" element={<ManualEvaluationDetail />} />
        <Route path="effect-evaluation/auto/create" element={<CreateAutoEvaluationTask />} />
        <Route path="effect-evaluation/benchmark/create" element={<CreateBenchmarkEvaluationTask />} />
        <Route path="effect-evaluation/manual/create" element={<CreateManualEvaluationTask />} />
        {/* project.detail.file-management.* 鏂囦欢绠＄悊 */}
        <Route path="file-management" element={<FileManagement />} />
        <Route path="file-management/:folderId" element={<FolderDetail />} />
        {/* project.detail.machine-online-annotation.* 在线标注服务 */}
        <Route path="machine-online-annotation-service" element={<MachineOnlineAnnotation />} />
        <Route path="machine-online-annotation-service/create" element={<CreateMachineOnlineAnnotation />} />
        <Route path="machine-online-annotation-service/:datasetId" element={<MachineOnlineAnnotationDetail />} />
        {/* project.detail.machine-learning.* 机器学习数据管理 */}
        <Route path="machine-task-overview" element={<TaskOverview domain="ml" />} />
        <Route path="machine-data-management" element={<MachineDataManagementPage />} />
        <Route path="machine-data-management/:datasetId" element={<MachineDatasetDetails />} />
        <Route path="machine-data-management/create" element={<CreateMachineDataset />} />
        {/* 机器学习 — 机器模型部署（推理任务，模型来源 ml_model） */}
        <Route path="machine-model-deployment" element={<ModelDelopyment />} />
        <Route path="machine-model-deployment/create" element={<CreateModelDelopyment />} />
        <Route path="machine-model-deployment/:inference_task_id" element={<DeployDetail />} />

        {/* project.detail.machine-notebook.* 机器学习Notebook（静态段须排在 :notebookId 之前，否则 mirror 会被当成 id） */}
        <Route path="machine-notebook" element={<Navigate to="tabs/mine" replace />} />
        <Route path="machine-notebook/tabs/:tab" element={<NotebookList />} />
        <Route path="machine-notebook/create" element={<CreateNotebook />} />
        <Route path="machine-notebook/edit/:notebookId" element={<CreateNotebook />} />
        <Route path="machine-notebook/case/:caseId" element={<NotebookCaseDetail />} />
        <Route path="machine-notebook/mirror" element={<CustomImage />} />
        <Route path="machine-notebook/publish-case/:notebookId" element={<PublishCase />} />
        <Route path="machine-notebook/:notebookId" element={<NotebookDetail />} />
      </Route>

      {/* ---------- tasks.standalone.* 鐙珛浠诲姟锛堟棤 projectId锛?---------- */}
      <Route
        path="/tasks"
        element={(
          <ProtectedRoute>
            <ProjectLayout />
          </ProtectedRoute>
        )}
      >
        <Route index element={<TaskList />} />
        <Route path=":taskId" element={<TaskDetail />} />
        <Route path="create" element={<TaskCreate />} />
      </Route>

      {/* ---------- notFound 404 ---------- */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default AppRoutes
