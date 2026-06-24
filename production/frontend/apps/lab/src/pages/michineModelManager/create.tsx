import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import ModelForm from './components/ModelForm'
import { mlModelService } from '@/services/mlModelService'
import { notebookService } from '@/services/notebookService'
import type { MlModelFormValues } from '@/types/mlModel'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const MachineModelManagerCreatePage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { projectId } = useParams<{ projectId: string }>()
  const numericProjectId = Number(projectId)

  const { data: notebookList } = useQuery({
    queryKey: ['notebook-options', numericProjectId],
    queryFn: async () => {
      const response = await notebookService.getNotebookInstances(
        { page: 1, size: 100, biz_type: 'machine_learning' },
        numericProjectId,
      )
      return response.data.items
    },
    enabled: Number.isFinite(numericProjectId),
  })

  const createMutation = useMutation({
    mutationFn: async (values: MlModelFormValues) => {
      const { model_type, annotation_type, task_type } = values
      if (!model_type || !annotation_type || !task_type) {
        throw new Error('请选择模型类型、标注类型与任务类型')
      }

      const typePayload = { model_type, annotation_type, task_type }

      if (values.sourceType === 'local_upload') {
        const uploadId = values.uploadId?.trim()
        const tokenizerUploadId = values.tokenizerUploadId?.trim()
        if (!uploadId) {
          throw new Error('请先上传文件')
        }

        return mlModelService.create(numericProjectId, {
          description: values.description,
          name: values.name!,
          network_structure: values.networkStructure,
          source_type: values.sourceType,
          upload_id: uploadId,
          tokenizer_upload_id: tokenizerUploadId || undefined,
          ...typePayload,
        })
      }

      const selectedNotebook = notebookList?.find((item) => item.id === values.notebookId)
      const notebookInstanceName = selectedNotebook?.instance_name

      if (!notebookInstanceName) {
        throw new Error('未获取到 Notebook 实例名称')
      }

      return mlModelService.create(numericProjectId, {
        description: values.description,
        name: values.name!,
        network_structure: values.networkStructure,
        notebook_id: values.notebookId,
        notebook_instance_name: notebookInstanceName,
        source_ref: values.sourceRef,
        tokenizer_source_ref: values.tokenizer_source_ref,
        source_type: values.sourceType,
        ...typePayload,
      })
    },
    onSuccess: async () => {
      message.success('创建模型成功')
      await queryClient.invalidateQueries({ queryKey: ['ml-models', numericProjectId] })
      navigate(`/project/${projectId}/michine-model-manager`)
    },
    onError: () => {
      // message.error(error instanceof Error ? error.message : '创建模型失败')
    },
  })

  const notebookOptions = notebookList?.length
    ? notebookList.map((item) => ({
        label: item.instance_name,
        value: item.id,
        instanceName: item.instance_name,
        image: item.image,
        bizType: item.biz_type,
      }))
    : []

  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title="创建模型"
          onBack={() => navigate(`/project/${projectId}/michine-model-manager`)}
        />
        <div className="create-form-divider" />
        <div className="create-form-body">
          <ModelForm
            mode="create"
            projectId={numericProjectId}
            notebookOptions={notebookOptions}
            loading={createMutation.isPending}
            onCancel={() => navigate(`/project/${projectId}/michine-model-manager`)}
            onSubmit={(values) => createMutation.mutate(values)}
            title=""
            versionLabel="V1"
          />
        </div>
      </section>
    </div>
  )
}

export default MachineModelManagerCreatePage
