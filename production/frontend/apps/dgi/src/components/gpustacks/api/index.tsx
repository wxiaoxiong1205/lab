// import { request } from '@umijs/max';
import type { GPUDeviceItem, ListItem, ModelFile } from '../config/types'
import request from '@/utils/request'

export const GPU_STACK_API = import.meta.env.NODE_ENV === 'development' ? '/gpustack' : '/gpustack/v1'

export const WORKERS_API = `${GPU_STACK_API}/workers`
export const GPU_DEVICES_API = `${GPU_STACK_API}/gpu-devices`
export const MODEL_FILES_API = `${GPU_STACK_API}/model-files`
// 新增渠道
export const apiChannelAdd = (data: any) =>
  request({
    url: '/channel',
    method: 'post',
    data,
  })

export async function queryWorkersList(params: Global.SearchParams) {
  return request<Global.PageResponse<ListItem>>({
    url: WORKERS_API,
    method: 'GET',
    params,
  })
}

export async function queryGpuDevicesList(params: Global.SearchParams) {
  return request<Global.PageResponse<GPUDeviceItem>>({
    url: GPU_DEVICES_API,
    method: 'GET',
    params,
  })
}

export async function queryGPUDeviceItem(id: string) {
  return request<GPUDeviceItem>({
    url: `${GPU_DEVICES_API}/${id}`,
    method: 'GET',
  })
}

export async function deleteWorker(id: string | number) {
  return request({
    url: `${WORKERS_API}/${id}`,
    method: 'DELETE',
  })
}

export async function updateWorker(id: string | number, data: any) {
  return request({
    url: `${WORKERS_API}/${id}`,
    method: 'PUT',
    data,
  })
}

export async function queryModelFilesList(params: Global.SearchParams) {
  return request<Global.PageResponse<ModelFile>>({
    url: MODEL_FILES_API,
    method: 'GET',
    params,
  })
}

export async function deleteModelFile(
  id: string | number,
  params: { checked: boolean },
) {
  return request<Global.PageResponse<ModelFile>>({
    url: `${MODEL_FILES_API}/${id}?cleanup=${params.checked}`,
    method: 'DELETE',
  })
}

export async function updateModelFile(id: string | number, data: any) {
  return request<Global.PageResponse<ModelFile>>({
    url: `${MODEL_FILES_API}/${id}`,
    method: 'PUT',
    data,
  })
}

export async function downloadModelFile(data: any) {
  return request<Global.PageResponse<ModelFile>>({
    url: MODEL_FILES_API,
    method: 'POST',
    data,
  })
}

export async function retryDownloadModelFile(id: string | number) {
  return request<Global.PageResponse<ModelFile>>({
    url: `${MODEL_FILES_API}/${id}/reset`,
    method: 'POST',
  })
}
