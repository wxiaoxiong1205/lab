import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ModelForm from './components/ModelForm'
import { getNextVersionLabel } from './data'
import { mlModelService } from '@/services/mlModelService'
import { notebookService } from '@/services/notebookService'
import type { MlModelFormValues } from '@/types/mlModel'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const MachineModelManagerCreateVersionPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const { projectId, modelId } = useParams<{ projectId: string, modelId: string }>()
  const numericProjectId = Number(projectId)
  const modelName = decodeURIComponent(modelId ?? '')
  const rawVersionId = searchParams.get('versionId')
  const editingVersionId = rawVersionId ? Number(rawVersionId) : null
  const isEditMode = editingVersionId != null && Number.isFinite(editingVersionId)

  const { data: versions = [] } = useQuery({
    queryKey: ['ml-model-versions', numericProjectId, modelName],
    queryFn: () => mlModelService.getVersions(numericProjectId, modelName),
    enabled: Number.isFinite(numericProjectId) && !!modelName,
  })

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

  const currentVersion = isEditMode
    ? versions.find((item) => item.id === editingVersionId)
    : undefined

  const mutation = useMutation({
    mutationFn: async (values: MlModelFormValues) => {
      if (values.sourceType === 'local_upload') {
        const uploadId = values.uploadId?.trim()
        const tokenizerUploadId = values.tokenizerUploadId?.trim()
        if (!uploadId) {
          throw new Error('请先上传文件')
        }

        const payload = {
          description: values.description,
          network_structure: values.networkStructure,
          source_type: values.sourceType,
          upload_id: uploadId,
          tokenizer_upload_id: tokenizerUploadId || undefined,
        }

        if (isEditMode) {
          return mlModelService.updateVersion(editingVersionId, payload)
        }

        return mlModelService.createVersion(numericProjectId, modelName, payload)
      }

      const selectedNotebook = notebookList?.find((item) => item.id === values.notebookId)
      const notebookDetail = selectedNotebook
        ?? await notebookService.getNotebookInstance(String(values.notebookId), numericProjectId)
      const notebookInstanceName = notebookDetail?.instance_name

      if (!notebookInstanceName) {
        throw new Error('未获取到 Notebook 实例名称')
      }

      const payload = {
        description: values.description,
        network_structure: values.networkStructure,
        source_type: values.sourceType,
        notebook_id: values.notebookId,
        notebook_instance_name: notebookInstanceName,
        source_ref: values.sourceRef,
        tokenizer_source_ref: values.tokenizer_source_ref,
      }

      if (isEditMode) {
        return mlModelService.updateVersion(editingVersionId, payload)
      }

      return mlModelService.createVersion(numericProjectId, modelName, payload)
    },
    onSuccess: async () => {
      message.success(isEditMode ? '版本更新成功' : '版本创建成功')
      await queryClient.invalidateQueries({ queryKey: ['ml-model-versions', numericProjectId, modelName] })
      await queryClient.invalidateQueries({ queryKey: ['ml-models', numericProjectId] })
      navigate(`/project/${projectId}/michine-model-manager/${encodeURIComponent(modelName)}`)
    },
    onError: (error: unknown) => {
      message.error(error instanceof Error ? error.message : isEditMode ? '版本更新失败' : '版本创建失败')
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

  const initialValues = currentVersion
    ? {
        description: currentVersion.description,
        model_type: currentVersion.model_type,
        networkStructure: currentVersion.network_structure,
        notebookId: currentVersion.notebook_id,
        sourceRef: currentVersion.source_ref,
        tokenizer_source_ref: currentVersion.tokenizer_source_ref,
        sourceType: currentVersion.source_type || 'notebook',
      }
    : {
        model_type: versions[0]?.model_type,
        sourceType: 'notebook',
      }

  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title={isEditMode ? '编辑版本' : '新增版本'}
          onBack={() => navigate(`/project/${projectId}/michine-model-manager/${encodeURIComponent(modelName)}`)}
        />
        <div className="create-form-divider" />
        <div className="create-form-body">
          <ModelForm
            mode="version"
            projectId={numericProjectId}
            notebookOptions={notebookOptions}
            initialValues={initialValues}
            loading={mutation.isPending}
            onCancel={() => navigate(`/project/${projectId}/michine-model-manager/${encodeURIComponent(modelName)}`)}
            onSubmit={(values) => mutation.mutate(values)}
            title=""
            versionLabel={currentVersion?.model_version ?? getNextVersionLabel(versions)}
          />
        </div>
      </section>
    </div>
  )
}

export default MachineModelManagerCreateVersionPage
