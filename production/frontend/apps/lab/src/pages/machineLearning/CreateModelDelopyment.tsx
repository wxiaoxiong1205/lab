import DeployServiceForm from '@/pages/service/DeployServiceForm'

/** 机器学习 — 创建机器模型部署（模型来源固定为 ml_model） */
export default function CreateModelDelopyment() {
  return <DeployServiceForm variant="machine" />
}
