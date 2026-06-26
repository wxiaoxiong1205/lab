// 数据集列表 接口返回定义
export interface MachineLearnListModel {
  items: ItemList[]
  total: number
  page: number
  size: number
  pages: number
}

export interface ItemList {
  id: number
  name: string
  description?: string
  project_id: number
  version: string
  publish_display?: string
  status_display?: string
  is_published?: boolean
  processing_status_display?: string
  dataset_category: string
  task_type: string
  source_type: string
  sample_count: number
  created_at: string
  updated_at: string
  created_by: string
  is_annotated: boolean // 是否有标注信息
  active_operation?: DatasetVersionOperation
}

export interface DatasetVersionOperation {
  operation_id?: string
  operation_type?: string
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | string
  row_numbers?: number[]
  requested_count?: number
  removed_count?: number
  error_message?: string
  updated_at?: string
}
// 创建数据集/新增版本接口 请求体定义
export interface CreateDatasetRequest {
  name: string
  chunk_upload_ids?: string // 上传文件ID列表 多个用逗号分割 继承模式下不需要传
  data_type?: string // 数据类型 text/image 继承模式下可忽略
  annotation_type?: string // 标注类型 继承模式下可忽略
  template_type?: string // 标注模板 继承模式下可忽略
  is_annotated?: boolean // 是否有标注信息
  version: string // 新版本号
  inherit_from_version: boolean // 是否从已有版本继承数据
  source_version?: string // 被继承的源版本号 继承时必填
  description?: string
  data_source?: string // 数据来源 local_upload/notebook
  notebook_id?: number // Notebook ID
  notebook_name?: string // Notebook 名称
  notebook_path?: string // Notebook 路径
}
// 下载机器学习样例数据集 请求体定义
export interface DownloadDatasetRequest {
  data_type: string // 数据类型 text/image
  template_type: string // 标注模板（如实体识别、文本/图像分类单/多标签） Available values : text_classification_single_label, text_classification_multi_label, entity_recognition, image_classification_single_label, image_classification_multi_label, object_detection_bbox, image_segmentation_instance, semantic_segmentation, instance_segmentation_mask
  is_annotated?: boolean // 是否有标注信息
  file_type: string // 样例文件格式：jsonl 或 zip（文本可任选；图像仅 zip）
}

export interface DatasetExportFormatsResponse {
  [key: string]: string[]
}

export interface DatasetAsyncExportResponse {
  status: string
  task_id: string
  dataset_id: number
  export_format: string
  message: string
}
// 某个数据集的详情信息 接口返回数据定义
export interface DatasetDetailsResponse {
  id: number
  name: string
  description?: string
  project_id: number
  base_url: string // 基础URL 用于构建图片URL
  annotation_type: string
  dataset_category: string
  task_type: string
  source_type: string
  storage_path: string
  dataset_path: string
  label_schema_path: string
  sample_count: number
  file_size: number
  created_by: string
  updated_at: string
  data_type: string
  template_type: string
  notebook_id?: number
  notebook_name?: string
  notebook_path?: string
  is_annotated?: boolean
  label_schema: DatasetDetails // 标签
  items: ItemDetail[] // 数据集内容
  total: number
  page: number
  size: number
  pages: number
  publish_display: string
  status_display: string
  is_published?: boolean
  processing_status_display?: string
  processing_status?: string
  publish?: number
  active_operation?: DatasetVersionOperation
}
export interface ItemDetail {
  row_number: number
  sample_data: SampleData[] | SampleData1[] // 数据集内容
}
export interface DatasetDetails {
  [key: string]: string
}
// 文本-短文本单标签 文本-多文本单标签
export interface SampleData {
  sample_id: number
  annotations: number[] // 数组内的每一个数字 对应label_schema每一项key的value
  data: Content
}
export interface Content {
  content: string // 文本内容 文本类型时有值
  image: string // 图片url 图像类型时有值
}

// 文本-实体识别
export interface SampleData1 {
  sample_id: number
  annotations: Annotation[]
  data: Content
}
export interface Annotation {
  offset: number[] // 文本位置，数组内两个数字，分别表示开始和结束位置
  /** label_schema 的 key（如 "0"），展示时需映射为 schema 对应文案 */
  tag: string
}

export const DATA_TYPE_OPTIONS = [
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
]

// 标注类型：根据数据类型展示不同选项（与 API task_type 枚举一致）
export const ANNOTATION_TYPE_IMAGE = [
  { value: 'image_classification', label: '图像分类' },
  { value: 'object_detection', label: '物体检测' },
  { value: 'image_segmentation', label: '图像分割' },
]
export const ANNOTATION_TYPE_TEXT = [
  { value: 'text_classification', label: '文本分类' },
  { value: 'entity_recognition', label: '实体识别' },
]

// 标注类型集合 机器学习数据集
export const ANNOTATION_TYPE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  [...ANNOTATION_TYPE_IMAGE, ...ANNOTATION_TYPE_TEXT].map(({ value, label }) => [value, label]),
)

// 标注模板
export const TEMPLATE_TYPE_IMAGE_CLASSIFICATION = [
  { value: 'image_classification_single_label', label: '单图单标签' },
  { value: 'image_classification_multi_label', label: '单图多标签' },
]
export const TEMPLATE_TYPE_OBJECT_DETECTION = [
  { value: 'object_detection_bbox', label: '矩阵框标注' },
]
export const TEMPLATE_TYPE_IMAGE_SEGMENTATION = [
  { value: 'image_segmentation_instance', label: '实例分割' },
  { value: 'semantic_segmentation', label: '语义分割' },
  { value: 'instance_segmentation_mask', label: '实例分割（掩码）' },
]
/** 文本 + 标注类型为文本分类时的标注模板选项（当前选项） */
export const TEMPLATE_TYPE_TEXT_CLASSIFICATION = [
  { value: 'text_classification_single_label', label: '文本单标签' },
  { value: 'text_classification_multi_label', label: '文本多标签' },
]
/** 文本 + 标注类型为实体识别时：标注模板唯一值为文本实体识别 */
export const TEMPLATE_TYPE_TEXT_ENTITY_RECOGNITION = [
  { value: 'entity_recognition', label: '文本实体识别' },
]

export const DATA_SOURCE_OPTIONS = [
  { value: 'local_upload', label: '本地上传' },
  { value: 'notebook', label: 'Notebook 获取' },
]
// 数据集/标注类型显示映射（与列表页保持一致）
export const TASK_TYPE_MAP: Record<string, string> = {
  text_classification: '文本分类',
  text_entity_recognition: '实体识别',
  image_classification: '图像分类',
  object_detection: '物体检测',
  image_segmentation: '图像分割',
}

export function formatAnnotationTypeLabel(value?: string | null): string {
  if (value == null || value === '') return '-'
  return ANNOTATION_TYPE_LABEL_MAP[value] ?? TASK_TYPE_MAP[value] ?? value
}

export const DATASET_CATEGORY_MAP: Record<string, string> = {
  text: '文本',
  image: '图片',
}

export const TEMPLATE_TYPE_MAP: Record<string, string> = {
  text_classification_single_label: '文本单标签',
  text_classification_multi_label: '文本多标签',
  entity_recognition: '文本实体识别',
  image_classification_single_label: '单图单标签',
  image_classification_multi_label: '单图多标签',
  object_detection_bbox: '矩阵框标注 ',
  image_segmentation_instance: '实例分割',
  semantic_segmentation: '语义分割',
  instance_segmentation_mask: '实例分割（掩码）',
}

/** 列表筛选：task_type 下可选的 template_type（与创建数据集页选项一致） */
export const TASK_TYPE_TO_TEMPLATE_TYPES: Record<string, string[]> = {
  text_classification: ['text_classification_single_label', 'text_classification_multi_label'],
  text_entity_recognition: ['entity_recognition'],
  image_classification: ['image_classification_single_label', 'image_classification_multi_label'],
  object_detection: ['object_detection_bbox'],
  image_segmentation: ['image_segmentation_instance', 'semantic_segmentation', 'instance_segmentation_mask'],
}
