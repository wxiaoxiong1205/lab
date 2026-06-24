import { Navigate, Route, Routes } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Spin } from 'antd'
import MainLayout from '@/layouts/MainLayout'

// 登录页面
const Login = lazy(() => import('@/pages/login'))
const IamLogin = lazy(() => import('@/pages/iam-login'))

// 模型广场
const ModelSpace = lazy(() => import('@/pages/model-space'))
const ModelSpaceDetail = lazy(() => import('@/pages/model-space/[id]'))
const ModelSqurePlus = lazy(() => import('@/pages/model-space/ModelSqurePlus'))

// 模型体验
const ModelExperience = lazy(() => import('@/pages/model-experience/[type]'))

// 模型管理
const ModelManagerList = lazy(() => import('@/pages/model-manager/list'))
const ModelManagerOverview = lazy(() => import('@/pages/model-manager/overview'))
const ModelManagerResources = lazy(() => import('@/pages/model-manager/resources'))

// 访问密钥
const AccessKey = lazy(() => import('@/pages/access-key'))

// 日志
const InvokeLog = lazy(() => import('@/pages/invoke-log'))

// 渠道管理
const ChannelManage = lazy(() => import('@/pages/channel-manage'))
const ModelAttribute = lazy(() => import('@/pages/other-settings/ModelAttribute'))
const ChannelTest = lazy(() => import('@/pages/channel-manage/channel-test'))

// 监控中心
const Analysis = lazy(() => import('@/pages/analysis'))

// 告警
const AlarmManage = lazy(() => import('@/pages/alarm-manage'))

// 敏感词库
const SensitiveWords = lazy(() => import('@/pages/sensitive-words'))

// API服务
const ApiService = lazy(() => import('@/pages/apiService'))
const ApiServiceCreate = lazy(() => import('@/pages/apiService/CreateApiService'))
const APISpace = lazy(() => import('@/pages/API-space'))
const APISpaceDetail = lazy(() => import('@/pages/API-space/[id]'))
const APISqurePlus = lazy(() => import('@/pages/API-space/APISqurePlus'))

// 审批管理
const Approval = lazy(() => import('@/pages/approval/[status]'))

// 系统配置
const SystemConfig = lazy(() => import('@/pages/system-config'))

// 其他
const Document = lazy(() => import('@/pages/document'))
const OtherSettings = lazy(() => import('@/pages/other-settings'))

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" tip="页面加载中..." />
  </div>
)

/**
 * 应用路由配置
 */
const AppRoutes = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* 登录页面 - 不需要布局 */}
        <Route path="/login" element={<Login />} />
        <Route path="/iam-login" element={<IamLogin />} />

        {/* 主应用路由 - 使用 MainLayout */}
        <Route path="/" element={<MainLayout />}>
          {/* 根路径重定向到 model-space */}
          <Route index element={<Navigate to="/model-space" replace />} />

          {/* 模型广场 */}
          {/* <Route path="model-space" element={<ModelSpace />} /> */}
          <Route path="model-space" element={<ModelSqurePlus />} />
          <Route path="model-space/:id" element={<ModelSpaceDetail />} />
          {/* <Route path="model-space/squre-test" element={<SqureTest />} /> */}

          {/* API广场 */}
          {/* <Route path="api-space" element={<APISpace />} /> */}
          <Route path="api-space" element={<APISqurePlus />} />
          <Route path="api-space/:id" element={<APISpaceDetail />} />

          {/* 模型体验 */}
          <Route path="model-experience/:type" element={<ModelExperience />} />

          {/* 访问密钥 */}
          <Route path="access-key" element={<AccessKey />} />

          {/* 日志 */}
          <Route path="invoke-log" element={<InvokeLog />} />

          {/* API服务 */}
          <Route path="api-service" element={<ApiService />} />
          <Route path="api-service/create" element={<ApiServiceCreate action="create" />} />
          <Route path="api-service/edit/:apiId" element={<ApiServiceCreate action="edit" />} />
          <Route path="api-service/test/:apiId" element={<ApiServiceCreate action="test" />} />
          <Route path="api-service/attribute" element={<ModelAttribute type="api" />} />

          {/* 渠道管理 */}
          <Route path="channel-manage" element={<ChannelManage type="channel-manage" />} />
          <Route path="channel-manage/model-manage" element={<ChannelManage type="model-manage" />} />
          <Route path="channel-manage/model-attribute" element={<ModelAttribute type="model" />} />
          <Route path="channel-manage/channel-test/:groupListName" element={<ChannelTest />} />

          {/* 监控中心 */}
          <Route path="analysis" element={<Analysis />} />

          {/* 告警 */}
          <Route path="alarm-manage" element={<AlarmManage />} />

          {/* 敏感词库 */}
          <Route path="sensitive-words" element={<SensitiveWords />} />

          {/* 审批管理 */}
          <Route path="approval/:status/:type?" element={<Approval />} />

          {/* 系统配置 */}
          <Route path="system-config" element={<SystemConfig />} />

          {/* 其他页面 */}
          <Route path="document" element={<Document />} />
          <Route path="model-manager/list" element={<ModelManagerList />} />
          <Route path="model-manager/overview" element={<ModelManagerOverview />} />
          <Route path="model-manager/resources" element={<ModelManagerResources />} />
          <Route path="other-settings" element={<OtherSettings />} />

          {/* 404 页面 */}
          <Route path="*" element={<Navigate to="/model-space" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default AppRoutes
