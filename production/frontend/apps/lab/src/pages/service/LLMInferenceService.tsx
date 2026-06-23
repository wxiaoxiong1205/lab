import InferenceDelopyment from '@/pages/service/components/InferenceDelopyment'

/** 在线推理 — 已部署推理任务列表（基础模型 / 训练模型） */
export default function LLMInferenceService() {
  return (
    <InferenceDelopyment
      pageTitle="模型部署"
      queryKeyPrefix="inference-service-list"
      detailPathRelative="service/inference/hosted"
      createPathSuffix="service/inference/hosted/create"
    />
  )
}
