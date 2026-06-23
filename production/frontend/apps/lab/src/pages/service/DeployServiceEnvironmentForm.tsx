import { useState } from 'react'
import { Form, Typography, message } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'
import { DeployServiceMoreConfigForm } from './DeployServiceMoreConfigForm'
import { DeployServiceNotebookPythonSection } from './DeployServiceNotebookPythonSection'
import { CodeView } from '@/components/codeView'
import { DelopServerApi } from '@/services/inferenceService'
import { downloadBlobFile } from '@/utils/download'
import type { ItemListResponse } from '@/types/model'
import type { DeplopServerDetailResponse } from '@/types/inference/deplop'

const { Title } = Typography

export interface DeployServiceEnvironmentFormProps {
  form: FormInstance
  codeText: string
  isMachine: boolean
  projectId?: string
  onlineDebugLoading?: boolean
  onlineDebugDisabled?: boolean
  onOnlineDebug?: () => void
  twice?: boolean
  readyDelopMsg?: DeplopServerDetailResponse
  mlModelSelectOptions: ItemListResponse[]
  configParamOptions: any[]
  reasoningParams: any
  disabedParamsKeyList: string[]
  localPythonResetKey?: string
}

export function DeployServiceEnvironmentForm(props: DeployServiceEnvironmentFormProps) {
  const {
    form,
    codeText,
    isMachine,
    projectId,
    onlineDebugLoading,
    onlineDebugDisabled,
    onOnlineDebug,
    twice,
    readyDelopMsg,
    mlModelSelectOptions,
    configParamOptions,
    reasoningParams,
    disabedParamsKeyList,
    localPythonResetKey,
  } = props

  const [isShowMoreConfig, setIsShowMoreConfig] = useState(false)
  const [mlDemoZipDownloading, setMlDemoZipDownloading] = useState(false)

  const onShowMoreConfig = () => {
    setIsShowMoreConfig(!isShowMoreConfig)
  }

  const handleDownloadMlDemoZip = async () => {
    if (!projectId)
      return
    const mid = form.getFieldValue('ml_model_id') as number | string | undefined
    const row = mlModelSelectOptions.find((i) => i.id === mid || String(i.id) === String(mid))
    const ml_task_type = row?.task_type?.trim()
    if (!ml_task_type) {
      message.warning('请先在基本信息中选择模型，以下载该模型任务类型（task_type）对应的模板')
      return
    }
    try {
      setMlDemoZipDownloading(true)
      const blob = await DelopServerApi.downloadDemo(parseInt(projectId, 10), ml_task_type)
      downloadBlobFile(blob, `ml-demo-sample-${ml_task_type}.zip`)
      message.success('已开始下载')
    }
    catch (e) {
      console.error(e)
      message.error('模板下载失败')
    }
    finally {
      setMlDemoZipDownloading(false)
    }
  }

  return (
    <div className="mb-2 max-w-5xl">
      <Title level={4} className="mb-6">环境信息</Title>
      <Form
        form={form}
        labelAlign="right"
        layout="vertical"
      >
        <Form.Item
          label="运行命令"
          required
        >
          {
            CodeView({
              text: codeText,
              language: 'bash',
            })
          }
        </Form.Item>

        {isMachine && projectId && (
          <DeployServiceNotebookPythonSection
            form={form}
            projectId={projectId}
            twice={twice}
            readyDelopMsg={readyDelopMsg}
            onlineDebugLoading={onlineDebugLoading}
            onlineDebugDisabled={onlineDebugDisabled}
            onOnlineDebug={onOnlineDebug}
            mlDemoZipDownloading={mlDemoZipDownloading}
            onDownloadMlDemoZip={() => void handleDownloadMlDemoZip()}
            localPythonResetKey={localPythonResetKey}
          />
        )}
      </Form>

      {!isMachine && (
        <div className="text-[#3685d3] hover:cursor-pointer inline-block" onClick={() => onShowMoreConfig()}>
          展开更多配置
          {isShowMoreConfig ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        </div>
      )}

      <div className={isShowMoreConfig ? 'block' : 'hidden'}>
        <DeployServiceMoreConfigForm
          form={form}
          configParamOptions={configParamOptions}
          reasoningParams={reasoningParams}
          disabedParamsKeyList={disabedParamsKeyList}
          isMachine={isMachine}
        />
      </div>
    </div>
  )
}
