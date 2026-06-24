// 导出所有模拟服务

// 导入模拟服务
import * as mockFinetuneTaskService from './mockFinetuneTaskService'
import * as mockNotebookService from './mockNotebookService'
import * as mockStorageConfigService from './mockStorageConfigService'

// 是否启用模拟数据（可以根据环境变量或本地存储设置）
export const ENABLE_MOCK_DATA = false

// 导出所有模拟服务
export {
  mockFinetuneTaskService,
  mockNotebookService,
  mockStorageConfigService,
}
