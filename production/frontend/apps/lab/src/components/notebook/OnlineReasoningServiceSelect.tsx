import { Select, Spin } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { inferenceServiceApi } from '@/services/inferenceService'
import type { InferenceService } from '@/types/inference'

const PAGE_SIZE = 100
const STATUS_PASSED = '测试通过'

async function fetchOnlineInferenceServicesForNotebook(projectId: number): Promise<InferenceService[]> {
  const inferenceList: InferenceService[] = []
  let page = 1
  let total = 0
  const projectIdStr = String(projectId)
  do {
    const res = await inferenceServiceApi.list({
      projectId: projectIdStr,
      page,
      size: PAGE_SIZE,
      status: STATUS_PASSED,
    })
    total = res.total ?? 0
    inferenceList.push(...res.items)
    page += 1
  } while (inferenceList.length < total && page < 1000)
  return inferenceList
}

export default function OnlineReasoningServiceSelect({
  value,
  onChange,
  placeholder = '请选择在线推理服务（可选）',
}: {
  value?: number
  onChange?: (value: number | undefined) => void
  placeholder?: string
}) {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const { data: options = [], isLoading } = useQuery({
    queryKey: ['notebook-online-reasoning-services', pid],
    queryFn: () => fetchOnlineInferenceServicesForNotebook(pid),
    enabled: !!projectId && !Number.isNaN(pid),
  })

  return (
    <Select<number>
      allowClear
      showSearch
      optionFilterProp="label"
      placeholder={placeholder}
      loading={isLoading}
      value={value}
      onChange={onChange}
      options={options
        .map((item) => {
          const idNum = Number(item.id)
          if (!Number.isFinite(idNum)) return null
          return {
            value: idNum,
            label: item.description ? `${item.name}（${item.description}）` : item.name,
          }
        })
        .filter((opt): opt is { value: number, label: string } => opt != null)}
      notFoundContent={isLoading ? <Spin size="small" /> : undefined}
    />
  )
}
