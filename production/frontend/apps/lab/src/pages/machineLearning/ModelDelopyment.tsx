import InferenceDelopyment from '@/pages/service/components/InferenceDelopyment'

/** 机器学习 — 已部署机器模型推理任务列表（固定模型来源 ml_model） */
export default function ModelDelopyment() {
  return (
    <InferenceDelopyment
      pageTitle="机器模型部署"
      queryKeyPrefix="ml-inference-deployment-list"
      fixedModelSource="ml_model"
      detailPathRelative="machine-model-deployment"
      createPathSuffix="machine-model-deployment/create"
      createButtonLabel="创建部署"
    />
  )
}
