import { useQuery } from '@tanstack/react-query'
import { Drawer, Empty, Flex, Radio, Spin, Typography } from 'antd'
import { useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { ImageCard } from './ImageCard'
import { TagsSelect } from './TagsSelect'
import type { RegistryMirrorImage } from '@/services/RegistryMirrorService'
import { NotebookCustomImageType, NotebookSystemImageType, registryMirrorService } from '@/services/RegistryMirrorService'
import { tagsService } from '@/services/tagsServie'
import type { GetTagsListTagsData } from '@/types/tags'

const { Title } = Typography
export type ImageListItem = {
  name: string
  image_address: string
  /** 自定义镜像：用于卡片上解析命名空间/名称/版本 */
  output_image?: string
  describe: string
  created_at: string
  created_by: string
  tags: GetTagsListTagsData[]
}
export interface ImageDrawerProps {
  open: boolean
  onClose: () => void
  /** 选择镜像时回调，可拿到选中的镜像和当前选中的标签 id 列表 */
  onSelect?: (image: ImageListItem, selectedTags: number[]) => void
  /** 是否启用 GPU（用于筛选系统镜像） */
  gpuEnabled?: boolean
  /** GPU 类型级联值，一般为 [category, model] */
  gpuType?: unknown
  /** 仅按显卡分类筛选（不带具体型号） */
  useCategoryOnly?: boolean
  /** 当前选中的 GPU 选项（需要包含 model 字段时才会按型号筛选） */
  selectedGpuOption?: {
    model?: string
  } | null
  /** 机器学习 Notebook 与基础模型 Notebook 对应不同的 image_type（9/10、11/12） */
  isMachineLearningNotebook?: boolean
}
export function ImageDrawer({ open, onClose, onSelect, gpuEnabled, gpuType, useCategoryOnly, selectedGpuOption, isMachineLearningNotebook = false }: ImageDrawerProps) {
  const { projectId } = useParams()
  const notebookCustomImageType = isMachineLearningNotebook
    ? NotebookCustomImageType.machineLearningNotebook
    : NotebookCustomImageType.baseModelNotebook
  const notebookSystemImageType = isMachineLearningNotebook
    ? NotebookSystemImageType.machineLearningNotebook
    : NotebookSystemImageType.baseModelNotebook
  const [imageType, setImageType] = useState<'system' | 'custom'>('system')
  const [selectedTags, setSelectedTags] = useState<number[]>([])
  const tagElementIds = selectedTags.length > 0 ? selectedTags : undefined
  const gpuModel = selectedGpuOption?.model
  // 系统镜像
  const { data: systemImages, isLoading: systemImagesLoading } = useQuery({
    queryKey: ['notebookSystemImages', projectId, selectedTags, gpuEnabled, gpuType, useCategoryOnly, gpuModel, notebookSystemImageType],
    queryFn: () => {
      let queryParams: {
        card_category?: string
        card_model?: string
      } | undefined = {
        card_category: 'CPU',
      }
      if (gpuEnabled && gpuType && Array.isArray(gpuType) && gpuType.length === 2) {
        queryParams = {
          card_category: gpuType[0] as string,
        }
        if (!useCategoryOnly && gpuModel) {
          queryParams.card_model = gpuModel
        }
      }
      return registryMirrorService.getSystemImageList(Number(projectId), notebookSystemImageType, {
        size: 100,
        page: 1,
        ...(tagElementIds != null && { tag_element_ids: tagElementIds }),
        business_type: 'IMAGE',
        ...(queryParams ?? {}),
      })
    },
    staleTime: 0,
    gcTime: 0,
    enabled: !!projectId && imageType === 'system',
  })
  // 自定义镜像
  const { data: customImages, isLoading: customImagesLoading } = useQuery({
    queryKey: ['customImages', projectId, selectedTags, notebookCustomImageType],
    queryFn: () => registryMirrorService.getCustomImageList({
      project_id: Number(projectId),
      status: '已完成',
      size: 100,
      page: 1,
      image_type: notebookCustomImageType,
      ...(tagElementIds != null && { tag_element_ids: tagElementIds }),
      business_type: 'custom_image',
    }),
    staleTime: 0,
    gcTime: 0,
    enabled: !!projectId && imageType === 'custom',
  })
  // 标签
  const { data: tags, isLoading: tagsLoading } = useQuery({
    queryKey: ['tags', imageType],
    queryFn: () => tagsService.getTagsByBusinessType(imageType === 'system' ? 'IMAGE' : 'custom_image'),
    staleTime: 0,
    gcTime: 0,
  })
  const imageList = useMemo<ImageListItem[]>(() => {
    if (imageType === 'system' && systemImages?.items) {
      return systemImages.items.map((item: RegistryMirrorImage) => ({
        name: item.image,
        image_address: item.image_address,
        describe: item.describe || '-',
        created_at: dayjs(item.created_at).format('YYYY-MM-DD HH:mm:ss'),
        tags: item.tags,
        created_by: item.created_by,
      }))
    }
    if (imageType === 'custom' && customImages?.items) {
      return (customImages.items as (RegistryMirrorImage & {
        name?: string
      })[]).map((item) => ({
        name: item.output_image,
        image_address: item.image_address,
        output_image: item.output_image,
        describe: item.describe || '-',
        created_at: dayjs(item.created_at).format('YYYY-MM-DD HH:mm:ss'),
        tags: item.tags,
        created_by: item.created_by,
      }))
    }
    return []
  }, [imageType, systemImages, customImages])
  const onImageTypeChange = (value: 'system' | 'custom') => {
    setSelectedTags([])
    setImageType(undefined)
    setTimeout(() => {
      setImageType(value)
    }, 100)
  }
  const onTagsChange = (value: number[]) => {
    setSelectedTags(value)
  }
  const handleSelect = (image: ImageListItem, selectedTags: number[]) => {
    onSelect?.(image, selectedTags)
    onClose()
  }
  return (
    <Drawer title="镜像" open={open} onClose={onClose} width={1000} styles={{ body: { padding: 0 } }}>
      <Flex className="!h-full overflow-hidden">
        {/* 左侧筛选 */}
        <Flex
          className="w-[300px] !p-[24px]"
          vertical
          style={{
            borderRight: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <Title className="mb-[12px] font-semibold" level={5}>
            镜像来源
          </Title>
          <Radio.Group value={imageType} className="!mb-8" onChange={(e) => onImageTypeChange(e.target.value)}>
            <Flex gap={8}>
              <Radio value="system">系统镜像</Radio>
              <Radio value="custom">自定义镜像</Radio>
            </Flex>
          </Radio.Group>

          {tagsLoading ? (
            <div className="w-full h-full flex justify-center items-center">
              <Spin />
            </div>
          ) : (
            <TagsSelect
              tags={(Array.isArray(tags?.data) ? tags.data : []).filter((tag) => tag.elements?.length > 0)}
              value={selectedTags}
              onChange={onTagsChange}
            />
          )}
        </Flex>

        {/* 右侧镜像列表 */}
        <Flex flex={1} wrap="wrap" gap={16} className="!p-4" align="flex-start">
          <div className="h-full w-full overflow-auto">
            {systemImagesLoading || customImagesLoading ? (
              <div className="w-full h-full flex justify-center items-center">
                <Spin />
              </div>
            ) : imageList.length === 0 ? (
              <div className="w-full h-full flex justify-center items-center">
                <Empty description="未查询到镜像" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 pr-4 mb-4">
                {imageList.map((image) => (<ImageCard key={image.name} image={image} onClick={onSelect ? () => handleSelect(image, selectedTags) : undefined} />))}
              </div>
            )}
          </div>
        </Flex>
      </Flex>
    </Drawer>
  )
}
