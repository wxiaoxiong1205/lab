import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppLayout from './components/Layout/AppLayout'
import Home from './pages/Home'
import TrainingList from './pages/Training/TrainingList'
import CreateTraining from './pages/Training/CreateTraining'
import TrainingDetail from './pages/Training/TrainingDetail'
import VersionDetail from './pages/Training/VersionDetail'
import OnlineNotebook from './pages/Training/OnlineNotebook'
import ModelManagement from './pages/Training/ModelManagement'
import TrainingDataset from './pages/Data/TrainingDataset'
import TestDataset from './pages/Data/TestDataset'
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
import ImageRegistry from './pages/Admin/ImageRegistry'
import BaseModelManagement from './pages/Admin/BaseModelManagement'
import SystemSettings from './pages/Admin/SystemSettings'
import PlatformAdmin from './pages/Admin/PlatformAdmin'
import DocumentCenterLayout from './pages/Docs/DocumentCenterLayout'
import UsageGuide from './pages/Docs/UsageGuide'
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
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/home" element={<Home />} />

              {/* 数据服务 */}
              <Route path="/datasets" element={<TrainingDataset />} />
              <Route path="/datasets/training/create" element={<TrainingDataset />} />
              <Route path="/datasets/training/:id/new-version" element={<TrainingDataset />} />
              <Route path="/datasets/training/:id" element={<TrainingDataset />} />
              <Route path="/measurement" element={<TestDataset />} />
              <Route path="/measurement/testing/create" element={<TestDataset />} />
              <Route path="/measurement/testing/:id/new-version" element={<TestDataset />} />
              <Route path="/measurement/testing/:id" element={<TestDataset />} />
              <Route path="/inference" element={<InferenceResult />} />
              <Route path="/inference/create" element={<InferenceResult />} />
              <Route path="/inference/:id" element={<InferenceResult />} />
              <Route path="/data-annotation" element={<DataAnnotation />} />
              <Route path="/data-cleaning" element={<DataCleaning />} />
              <Route path="/data-cleaning/create" element={<DataCleaning />} />

              {/* 大模型训练 */}
              <Route path="/finetune/notebooks" element={<OnlineNotebook />} />
              <Route path="/finetune/notebooks/create" element={<OnlineNotebook />} />
              <Route path="/training" element={<TrainingList />} />
              <Route path="/training/create" element={<CreateTraining />} />
              <Route path="/training/detail/:id" element={<TrainingDetail />} />
              <Route path="/training/detail/:id/version/:versionId" element={<VersionDetail />} />
              <Route path="/model" element={<ModelManagement />} />
              <Route path="/model/create" element={<ModelManagement />} />

              {/* 模型评估 */}
              <Route path="/effect-evaluation" element={<EffectEvaluation />} />
              <Route path="/effect-evaluation/create" element={<EffectEvaluation />} />
              <Route path="/evaluation-indicator" element={<EvaluationIndicator />} />

              {/* 模型服务 */}
              <Route path="/service/inference/hosted" element={<ModelDeployment />} />
              <Route path="/service/inference/hosted/create" element={<ModelDeployment />} />
              <Route path="/service/inference/external" element={<OnlineInferenceService />} />

              {/* 机器学习 */}
              <Route path="/machine-data-management" element={<MLDataset />} />
              <Route path="/machine-annotation" element={<MLAnnotation />} />
              <Route path="/machine-model-management" element={<MLModelManagement />} />
              <Route path="/machine-model-deployment" element={<MLModelDeployment />} />
              <Route path="/machine-notebook" element={<MLNotebook />} />
              <Route path="/machine-annotation-service" element={<MLAnnotationService />} />

              {/* 系统管理 */}
              <Route path="/admin/projects" element={<ProjectManagement />} />
              <Route path="/admin/kubernetes" element={<KubernetesCluster />} />
              <Route path="/admin/storage" element={<StorageConfig />} />
              <Route path="/admin/registry" element={<ImageRegistry />} />
              <Route path="/admin/base-model" element={<BaseModelManagement />} />
              <Route path="/admin/settings" element={<SystemSettings />} />
              <Route path="/admin/platform-management" element={<PlatformAdmin />} />

              <Route path="/docs" element={<DocumentCenterLayout />}>
                <Route index element={<Navigate to="usage-guide" replace />} />
                <Route path="usage-guide" element={<UsageGuide />} />
              </Route>

              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
