import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppLayout from './components/Layout/AppLayout'
import ProjectSpace from './pages/ProjectSpace'
import TaskOverview from './pages/TaskOverview'
import TrainingList from './pages/Training/TrainingList'
import CreateTraining from './pages/Training/CreateTraining'
import TrainingDetail from './pages/Training/TrainingDetail'
import VersionDetail from './pages/Training/VersionDetail'
import OnlineNotebook from './pages/Training/OnlineNotebook'
import ModelManagement from './pages/Training/ModelManagement'
import TrainingDataset from './pages/Data/TrainingDataset'
import TestDataset from './pages/Data/TestDataset'
import FileManagement from './pages/Data/FileManagement'
import InferenceResult from './pages/Data/InferenceResult'
import DataAnnotation from './pages/Data/DataAnnotation'
import DataCleaning from './pages/Data/DataCleaning'
import EffectEvaluation from './pages/Evaluation/EffectEvaluation'
import EvaluationIndicator from './pages/Evaluation/EvaluationIndicator'
import ModelDeployment from './pages/Service/ModelDeployment'
import OnlineInferenceService from './pages/Service/OnlineInferenceService'
import MLDataset from './pages/MachineLearning/MLDataset'
import MLAnnotation from './pages/MachineLearning/MLAnnotation'
import MLModelManagement from './pages/MachineLearning/MLModelManagement'
import MLModelDeployment from './pages/MachineLearning/MLModelDeployment'
import MLNotebook from './pages/MachineLearning/MLNotebook'
import MLAnnotationService from './pages/MachineLearning/MLAnnotationService'
import ProjectManagement from './pages/Admin/ProjectManagement'
import KubernetesCluster from './pages/Admin/KubernetesCluster'
import StorageConfig from './pages/Admin/StorageConfig'
import ImageList from './pages/Admin/ImageList'
import ImageRegistry from './pages/Admin/ImageRegistry'
import BaseModelManagement from './pages/Admin/BaseModelManagement'
import SystemSettings from './pages/Admin/SystemSettings'
import PermissionConfig from './pages/Admin/PermissionConfig'
import DocumentCenterLayout from './pages/Docs/DocumentCenterLayout'
import ProductManual from './pages/Docs/ProductManual'
import DeveloperGuide from './pages/Docs/DeveloperGuide'
import OpenPlatformApiKeys from './pages/OpenPlatform/OpenPlatformApiKeys'
import { useDataServiceBackendBootstrap } from './services/dataServiceApi'
import './styles/theme.css'

const App: React.FC = () => {
  useDataServiceBackendBootstrap()

  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/workspace" replace />} />
              <Route path="/workspace" element={<ProjectSpace />} />
              <Route path="/task-overview" element={<TaskOverview />} />
              <Route path="/home" element={<Navigate to="/task-overview" replace />} />
              <Route path="/open-platform/api-keys" element={<OpenPlatformApiKeys />} />

              {/* 数据服务 */}
              <Route path="/datasets" element={<TrainingDataset />} />
              <Route path="/datasets/training/create" element={<TrainingDataset />} />
              <Route path="/datasets/training/:id/new-version" element={<TrainingDataset />} />
              <Route path="/datasets/training/:id" element={<TrainingDataset />} />
              <Route path="/measurement" element={<TestDataset />} />
              <Route path="/measurement/testing/create" element={<TestDataset />} />
              <Route path="/measurement/testing/:id/new-version" element={<TestDataset />} />
              <Route path="/measurement/testing/:id" element={<TestDataset />} />
              <Route path="/file-management" element={<FileManagement />} />
              <Route path="/file-management/:folderId" element={<FileManagement />} />
              <Route path="/inference" element={<InferenceResult />} />
              <Route path="/inference/create" element={<InferenceResult />} />
              <Route path="/inference/:id" element={<InferenceResult />} />
              <Route path="/data-annotation" element={<DataAnnotation />} />
              <Route path="/data-annotation/multi/create" element={<DataAnnotation />} />
              <Route path="/data-annotation/:id" element={<DataAnnotation />} />
              <Route path="/data-cleaning" element={<DataCleaning />} />
              <Route path="/data-cleaning/create" element={<DataCleaning />} />

              {/* 大模型训练 */}
              <Route path="/finetune/notebooks" element={<OnlineNotebook />} />
              <Route path="/finetune/notebooks/create" element={<OnlineNotebook />} />
              <Route path="/finetune/notebooks/:notebookId/publish-case" element={<OnlineNotebook />} />
              <Route path="/finetune/notebooks/cases/:caseId/edit" element={<OnlineNotebook />} />
              <Route path="/finetune/notebooks/cases/:caseId" element={<OnlineNotebook />} />
              <Route path="/finetune/notebooks/:id/edit" element={<OnlineNotebook />} />
              <Route path="/finetune/notebooks/:id" element={<OnlineNotebook />} />
              <Route path="/training" element={<TrainingList />} />
              <Route path="/training/create" element={<CreateTraining />} />
              <Route path="/training/detail/:id" element={<TrainingDetail />} />
              <Route path="/training/detail/:id/version/:versionId" element={<VersionDetail />} />
              <Route path="/model" element={<ModelManagement />} />
              <Route path="/model/create" element={<ModelManagement />} />
              <Route path="/model/:id" element={<ModelManagement />} />
              <Route path="/model/:id/version/create" element={<ModelManagement />} />

              {/* 模型评估 */}
              <Route path="/effect-evaluation" element={<EffectEvaluation />} />
              <Route path="/effect-evaluation/create" element={<EffectEvaluation />} />
              <Route path="/effect-evaluation/report/:id" element={<EffectEvaluation />} />
              <Route path="/effect-evaluation/manual-review/:id" element={<EffectEvaluation />} />
              <Route path="/evaluation-indicator" element={<EvaluationIndicator />} />

              {/* 模型服务 */}
              <Route path="/service/inference/hosted" element={<ModelDeployment />} />
              <Route path="/service/inference/hosted/create" element={<ModelDeployment />} />
              <Route path="/service/inference/external" element={<OnlineInferenceService />} />
              <Route path="/service/inference/external/create" element={<OnlineInferenceService />} />

              {/* 机器学习 */}
              <Route path="/machine-data-management" element={<MLDataset />} />
              <Route path="/machine-data-management/create" element={<MLDataset />} />
              <Route path="/machine-data-management/:datasetId" element={<MLDataset />} />
              <Route path="/machine-annotation" element={<MLAnnotation />} />
              <Route path="/machine-annotation/create" element={<MLAnnotation />} />
              <Route path="/machine-annotation/online/:taskId" element={<MLAnnotation />} />
              <Route path="/machine-annotation/annotate/:assignmentId" element={<MLAnnotation />} />
              <Route path="/machine-annotation/review/:assignmentId" element={<MLAnnotation />} />
              <Route path="/machine-model-management" element={<MLModelManagement />} />
              <Route path="/machine-model-management/create" element={<MLModelManagement />} />
              <Route path="/machine-model-deployment" element={<MLModelDeployment />} />
              <Route path="/machine-model-deployment/create" element={<MLModelDeployment />} />
              <Route path="/machine-model-deployment/:id/edit" element={<MLModelDeployment />} />
              <Route path="/machine-notebook" element={<MLNotebook />} />
              <Route path="/machine-notebook/create" element={<MLNotebook />} />
              <Route path="/machine-notebook/:notebookId/publish-case" element={<MLNotebook />} />
              <Route path="/machine-notebook/cases/:caseId/edit" element={<MLNotebook />} />
              <Route path="/machine-notebook/cases/:caseId" element={<MLNotebook />} />
              <Route path="/machine-notebook/:id/edit" element={<MLNotebook />} />
              <Route path="/machine-notebook/:id" element={<MLNotebook />} />
              <Route path="/machine-annotation-service" element={<MLAnnotationService />} />
              <Route path="/machine-online-annotation-service" element={<MLAnnotationService />} />

              {/* 系统管理 */}
              <Route path="/admin/projects" element={<ProjectManagement />} />
              <Route path="/admin/kubernetes" element={<KubernetesCluster />} />
              <Route path="/admin/storage" element={<StorageConfig />} />
              <Route path="/admin/image-list" element={<ImageList />} />
              <Route path="/admin/registry" element={<ImageRegistry />} />
              <Route path="/admin/base-model" element={<BaseModelManagement />} />
              <Route path="/admin/settings" element={<SystemSettings />} />
              <Route path="/admin/permissions" element={<PermissionConfig />} />

              <Route path="/docs" element={<DocumentCenterLayout />}>
                <Route index element={<Navigate to="product-manual" replace />} />
                <Route path="product-manual" element={<ProductManual />} />
                <Route path="usage-guide" element={<ProductManual />} />
                <Route path="developer-guide" element={<DeveloperGuide />} />
              </Route>

              <Route path="*" element={<Navigate to="/workspace" replace />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
