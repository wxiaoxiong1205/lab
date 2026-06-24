import apiClient from '@/services/apiClient.ts'
import type { CreateMachineAnnotation, ForwardRequestParams, ListMachineAnnotationResponse, MachineAnnotationItem } from '@/types/machineLearing/machineAnnotationModel.ts'

export const machineAnnotationService = {
  // 创建机器学习 在线标注服务
  create: async (projectId: number, params: CreateMachineAnnotation) => {
    const response = await apiClient.post(`/online_annotation_service/project/${projectId}/create`, params)
    return response.data
  },

  // 在线标注服务 列表接口
  list: async (projectId: number, params: { page: number, size: number, name?: string }) => {
    const response = await apiClient.get<ListMachineAnnotationResponse>(`/online_annotation_service/project/${projectId}/list`, { params })
    return response.data
  },

  // 在线标注服务 详情接口
  getDetail: async (projectId: number, serviceId: number) => {
    const response = await apiClient.get<MachineAnnotationItem>(`/online_annotation_service/project/${projectId}/${serviceId}`)
    return response.data
  },

  // 在线标注服务 删除接口
  delete: async (projectId: number, serviceId: number) => {
    const response = await apiClient.delete(`/online_annotation_service/project/${projectId}/${serviceId}`)
    return response.data
  },

  // 在线标注服务 更新接口
  update: async (projectId: number, params: CreateMachineAnnotation) => {
    const response = await apiClient.put(`/online_annotation_service/project/${projectId}/update`, params)
    return response.data
  },

  // 测试连接接口
  testConnect: async (projectId: number, params: { id: number }) => {
    const response = await apiClient.post(`/online_annotation_service/project/${projectId}/test_connectivity`, {
      id: params.id,
    })
    return response.data
  },

  // 将 AI 预标注请求转发至 {predict_base_url 的协议与主机}/predict（忽略路径）， 以 POST + JSON 发送 tasks、project、label_config，并将上游 HTTP 状态与响应体返回。
  forwardRequest: async (projectId: number, params: ForwardRequestParams) => {
    const response = await apiClient.post(`/online_annotation_service/project/${projectId}/annotations/ai`, params)
    return response.data
  },
}
