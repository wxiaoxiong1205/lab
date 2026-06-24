import type { ParamListType } from '@/components/apiService/ApiParamsView.tsx'
import type { CreateApiRequest } from '@/services/apiService.ts'
import type { Attribute } from '@/types/inference'

/** 属性模板（列表接口）项，用于 API 服务表单 */
export interface ApiAttribute {
  id: number
  name: string
  description: string
  input_type: string
  required_tag: number
  multi_select?: number
  options?: Array<{ option_value: string, option_order?: number } | string>
  data_type?: string
  [key: string]: any
}

export function pickApiServicePayload(v: Record<string, any>): CreateApiRequest {
  return {
    name: v.name,
    description: v.description,
    base_url: v.base_url,
    header: v.header,
    request_param: v.request_param,
    response_param: v.response_param,
    request_type: v.request_type,
    protocol: v.protocol,
    attr_values: v.attr_values,
  }
}

export function buildAttrInstanceIdMap(rows: Attribute[] | undefined): Map<number, number> {
  const m = new Map<number, number>()
  if (!rows?.length)
    return m
  for (const av of rows) {
    const aid = Number(av.attr_id)
    const raw = av.id ?? (av as Attribute & { attr_value_id?: number }).attr_value_id
    if (raw == null || !Number.isFinite(aid) || !Number.isFinite(Number(raw)))
      continue
    m.set(aid, Number(raw))
  }
  return m
}

export function detailAttrValuesToFormPatch(
  detailRows: Attribute[],
  attrById: Map<number, ApiAttribute>,
): Record<string, any> {
  const patch: Record<string, any> = {}
  for (const av of detailRows) {
    const def = attrById.get(Number(av.attr_id))
    if (!def)
      continue
    if (def.input_type === '手动输入') {
      patch[`manualInput_${av.attr_id}`] = av.attr_value ?? ''
    }
    else if (def.input_type === '下拉选择') {
      const fromOptions = (av.options || []).map((item) =>
        typeof item === 'string' ? item : item?.option_value,
      ).filter(Boolean) as string[]
      const isMulti = def.multi_select === 1
      if (fromOptions.length > 0) {
        patch[`dropdown_${av.attr_id}`] = isMulti ? fromOptions : fromOptions[0]
      }
      else if (av.attr_value != null && String(av.attr_value).trim() !== '') {
        const raw = String(av.attr_value)
        const vals = isMulti ? raw.split(/[,，]/).map((item) => item.trim()).filter(Boolean) : [raw]
        patch[`dropdown_${av.attr_id}`] = isMulti ? vals : vals[0]
      }
    }
  }
  return patch
}

export function selectOptionStrings(attr: ApiAttribute): string[] {
  return (attr.options || [])
    .map((option: any) => {
      if (typeof option === 'string')
        return option
      if (option && typeof option === 'object' && option.option_value)
        return option.option_value
      return ''
    })
    .filter(Boolean)
}

/**
 * 通过jsonpath获取参数路径
 */
export function getJSONPathParts(jsonpath: string) {
  const pathParts = jsonpath
    .replace(/^\$\.?/, '')
    .replace(/\[\*\]/g, '.')
    .split('.')
    .filter((part) => part && part.trim())
  return pathParts
}

/**
 * 根据 JSONPath 在参数树中查找对应的参数节点
 */
export function findParamByJsonPath(
  params: ParamListType[],
  jsonpath: string,
): ParamListType | null {
  if (!params || !jsonpath)
    return null

  const pathParts = getJSONPathParts(jsonpath)
  if (pathParts.length === 0)
    return null

  const findRecursive = (
    currentParams: ParamListType[],
    remainingPath: string[],
  ): ParamListType | null => {
    if (remainingPath.length === 0)
      return null

    const [currentField, ...restPath] = remainingPath
    const matchedParam = currentParams.find((param) => param.name === currentField)

    if (!matchedParam)
      return null

    if (restPath.length === 0) {
      return matchedParam
    }

    if (matchedParam.child && matchedParam.child.length > 0) {
      return findRecursive(matchedParam.child, restPath)
    }

    return null
  }

  return findRecursive(params, pathParts)
}

/**
 * 将 JSONPath 键值对转换为嵌套对象（简化版）
 */
export function jsonPathToObject(data: Record<string, any>): any {
  const result: any = {}

  Object.entries(data).forEach(([jsonPath, value]) => {
    const path = jsonPath
      .replace(/^\$\.?/, '')
      .split(/[.[\]]/)
      .filter((p) => p && p !== '*')

    const arrayIndexes = new Set<number>()
    const tempPath = jsonPath.replace(/^\$\.?/, '')
    path.forEach((part, index) => {
      if (tempPath.includes(`${part}[*]`)) {
        arrayIndexes.add(index)
      }
    })

    let current = result
    path.forEach((part, index) => {
      const isLast = index === path.length - 1

      if (isLast) {
        current[part] = value
      }
      else {
        if (arrayIndexes.has(index)) {
          if (!current[part]) {
            current[part] = [{}]
          }
          current = current[part][0]
        }
        else {
          if (!current[part]) {
            current[part] = {}
          }
          current = current[part]
        }
      }
    })
  })

  return result
}
