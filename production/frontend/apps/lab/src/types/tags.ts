/**
 * 标签元素类型
 */
export interface classesItemType {
  name: string
  business_type: string
  sort_order: number
  id: number
  elements: TagByBusinessTypeElementsData[]
  created_at: string
  updated_at: string
}

/**
 * element元素类型
 */
export interface elementItemType {
  class_id: number
  name: string
  code: string
  sort_order: number
  id: number
  created_at: string
  updated_at: string
}

/**
 * 基础返列表get回类型
 */
export interface BaseResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

// ================== 获取标签分类列表 ==================
/**
 * 获取标签分类列表参数
 */
export interface TagClassParams {
  page?: number
  size?: number
  name?: string
  business_type?: string
}
/**
 * 获取标签分类列表返回类型
 */
export interface TagClassResponse extends BaseResponse<classesItemType> { }

// ================== 创建标签分类 ==================
/**
 * 创建标签分类参数
 */
export interface CreateTagClassData {
  name: string
  business_type: string
  sort_order: number
}
/**
 * 创建标签分类返回类型
 */
export interface CreateTagClassResponse extends classesItemType { }

// ================== 通过id获取标签分类 ==================
/**
 * 通过id获取标签分类返回类型
 */
export interface GetTagClassByIdResponse extends classesItemType { }

// ================== 更新标签分类 ==================
/**
 * 更新标签分类参数
 */
export interface UpdateTagClassData {
  name: string
  sort_order?: number
}
/**
 * 更新标签分类返回类型
 */
export interface UpdateTagClassResponse extends classesItemType { }

// ================== 获取标签元素列表 ==================
/**
 * 获取标签元素列表参数
 */
export interface TagElementParams {
  page?: number
  size?: number
  name?: string
  class_id?: number
}
/**
 * 获取标签元素列表返回类型
 */
export interface TagElementResponse extends BaseResponse<elementItemType> { }

// ================== 创建标签元素 ==================
/**
 * 创建标签元素参数
 */
export interface CreateTagElementData {
  class_id: number
  name: string
  code: string
  sort_order: number
}
/**
 * 创建标签元素返回类型
 */
export interface CreateTagElementResponse extends elementItemType { }

// ================== 通过id获取标签元素 ==================
/**
 * 通过id获取标签元素返回类型
 */
export interface GetTagElementByIdResponse extends elementItemType { }

// ================== 更新标签元素 ==================
/**
 * 更新标签元素参数
 */
export interface UpdateTagElementData {
  name: string
  code: string
  sort_order: number
}
/**
 * 更新标签元素返回类型
 */
export interface UpdateTagElementResponse extends elementItemType { }

// ================== 获取标签类型列表（按分类分组返回） ==================
export interface TagByBusinessTypeResponse {
  data: TagByBusinessTypeResData[]
}

export interface TagByBusinessTypeResData {
  tag_class_id: number
  tag_class_name: string
  elements: TagByBusinessTypeElementsData[]
}
export interface TagByBusinessTypeElementsData {
  tag_element_id: number
  tag_element_name: string
}

// ================== 保存业务对象的标签（覆盖式修改） ==================
/**
 * 保存业务对象的标签（覆盖式修改）参数
 */
export interface SaveTagsData {
  business_type: string
  business_id: number
  tag_element_ids: number[]
}
/**
 * 保存业务对象的标签（覆盖式修改）返回类型
 */
export interface SaveTagsResponse {
  success: string
  message: string
}

// ================== 获取业务对象的标签列表 ==================
/**
 * 获取业务对象的标签列表参数
 */
export interface GetTagsListParams {
  business_type: string
  business_id: number
}
/**
 * 获取业务对象的标签列表返回类型
 */
export interface GetTagsListResponse {
  business_type: string
  business_id: number
  tags: TagByBusinessTypeResData[]
}
export interface GetTagsListTagsData {
  tag_class_id: number
  tag_class_name: string
  tag_element_id: number
  tag_element_name: string
}
