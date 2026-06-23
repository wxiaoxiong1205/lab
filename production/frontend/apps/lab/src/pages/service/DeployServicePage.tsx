import DeployServiceForm, { type DeployServiceFormProps } from '@/pages/service/DeployServiceForm'

/** 模型部署服务页（支持详情内嵌重新部署时传入 twice / readyDelopMsg） */
export default function DeployServicePage(props: DeployServiceFormProps = {}) {
  return (
    <div>
      <DeployServiceForm {...props} />
    </div>
  )
}
