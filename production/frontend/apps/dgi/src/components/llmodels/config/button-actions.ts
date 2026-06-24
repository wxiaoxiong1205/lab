import {
  ApiOutlined,
  BorderOuterOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExperimentOutlined,
  InstagramOutlined,
  PlayCircleOutlined,
  RetweetOutlined,
  RocketOutlined,
  ShopOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import _ from 'lodash'
import React from 'react'
import { modelCategoriesMap, modelSourceMap } from './index'
import HotKeys from '@/components/gpustacks/config/hotkeys'
import IconFont from '@/components/icon-font'
import { $t } from '@/locales'

const icons = {
  EditOutlined: React.createElement(EditOutlined),
  BorderOuterOutlined: React.createElement(BorderOuterOutlined),
  ExperimentOutlined: React.createElement(ExperimentOutlined),
  DeleteOutlined: React.createElement(DeleteOutlined),
  ThunderboltOutlined: React.createElement(ThunderboltOutlined),
  RetweetOutlined: React.createElement(RetweetOutlined),
  DownloadOutlined: React.createElement(DownloadOutlined),
  ApiOutlined: React.createElement(ApiOutlined),
  Stop: React.createElement(InstagramOutlined),
  Play: React.createElement(PlayCircleOutlined),
  Catalog: React.createElement(IconFont, { type: 'icon-catalog' }),
  HF: React.createElement(IconFont, { type: 'icon-huggingface' }),
  Ollama: React.createElement(IconFont, { type: 'icon-ollama' }),
  ModelScope: React.createElement(IconFont, { type: 'icon-tu2' }),
  LocalPath: React.createElement(ShopOutlined),
  Launch: React.createElement(RocketOutlined),
}

export const modalConfig: Record<
  string,
  { show: boolean, width: string | number, source: any, isGGUF?: boolean }
> = {
  huggingface: {
    show: true,
    width: 'calc(100vw - 220px)',
    source: modelSourceMap.huggingface_value,
  },
  ollama_library: {
    show: true,
    width: 600,
    isGGUF: true,
    source: modelSourceMap.ollama_library_value,
  },
  modelscope: {
    show: true,
    width: 'calc(100vw - 220px)',
    source: modelSourceMap.modelscope_value,
  },
  local_path: {
    show: true,
    width: 600,
    source: modelSourceMap.local_path_value,
  },
}

interface ActionItem {
  label: string
  key: string
  icon: React.ReactNode
  props?: {
    danger?: boolean
  }
}

export const ActionList: ActionItem[] = [
  {
    label: $t('编辑'),
    key: 'edit',
    icon: icons.EditOutlined,
  },
  // {
  //   label: '在Playground中打开',
  //   key: 'chat',
  //   icon: icons.ExperimentOutlined
  // },
  {
    label: $t('对外服务'),
    key: 'external_service',
    icon: icons.BorderOuterOutlined,
  },
  {
    label: $t('API访问信息'),
    key: 'api',
    icon: icons.ApiOutlined,
  },
  {
    label: $t('停止'),
    key: 'stop',
    icon: icons.Stop,
  },
  {
    label: $t('启动'),
    key: 'start',
    icon: icons.Play,
  },
  {
    label: $t('删除'),
    key: 'delete',
    props: {
      danger: true,
    },
    icon: icons.DeleteOutlined,
  },
]

export const ButtonList = [
  {
    label: $t('启动'),
    key: 'start',
    icon: icons.Play,
  },
  {
    label: $t('停止'),
    key: 'stop',
    icon: icons.Stop,
  },
  {
    label: $t('删除'),
    key: 'delete',
    icon: icons.DeleteOutlined,
    props: {
      danger: true,
    },
  },
]

export const onLineSourceOptions = [
  // {
  //   label: 'Hugging Face',
  //   locale: false,
  //   value: modelSourceMap.huggingface_value,
  //   key: 'huggingface',
  //   icon: icons.HF
  // },
  // {
  //   label: 'ModelScope',
  //   locale: false,
  //   value: modelSourceMap.modelscope_value,
  //   key: 'modelscope',
  //   icon: icons.ModelScope
  // },
  {
    label: '本地路径',
    locale: true,
    value: modelSourceMap.local_path_value,
    key: 'local_path',
    icon: icons.LocalPath,
  },
]

export const sourceOptions = [
  // {
  //   label: 'menu.models.modelCatalog',
  //   locale: true,
  //   value: 'catalog',
  //   key: 'catalog',
  //   icon: icons.Catalog
  // },
  ...onLineSourceOptions,
]

export const generateSource = (record: any) => {
  if (record.source === modelSourceMap.modelscope_value) {
    return `${modelSourceMap.modelScope}/${record.model_scope_model_id}`
  }
  if (record.source === modelSourceMap.huggingface_value) {
    return `${modelSourceMap.huggingface}/${record.huggingface_repo_id}`
  }
  if (record.source === modelSourceMap.local_path_value) {
    return `${record.local_path}`
  }
  if (record.source === modelSourceMap.ollama_library_value) {
    return `${modelSourceMap.ollama_library}/${record.ollama_library_model_name}`
  }
  return ''
}

export const setModelActionList = (record: any) => {
  return _.filter(ActionList, (action: any) => {
    if (action.key === 'chat' || action.key === 'api') {
      return record.ready_replicas > 0
    }
    if (action.key === 'start') {
      return record.replicas === 0
    }

    if (action.key === 'stop') {
      return record.replicas > 0
    }

    return true
  })
}

export const modelFileActions = [
  {
    label: '部署',
    key: 'deploy',
    icon: icons.Launch,
  },
  // {
  //   label: '重新下载',
  //   key: 'retry',
  //   icon: icons.DownloadOutlined
  // },
  {
    label: '删除',
    key: 'delete',
    props: {
      danger: true,
    },
    icon: icons.DeleteOutlined,
  },
]

export const categoryToPathMap: Record<string, string> = {
  [modelCategoriesMap.llm]: '/playground/chat',
  [modelCategoriesMap.image]: '/playground/text-to-image',
  [modelCategoriesMap.text_to_speech]: '/playground/speech?type=tts',
  [modelCategoriesMap.speech_to_text]: '/playground/speech?type=stt',
  [modelCategoriesMap.reranker]: '/playground/rerank',
  [modelCategoriesMap.embedding]: '/playground/embedding',
}

export const hotkeyConfigs = [
  {
    keys: HotKeys.NEW1,
    width: 'calc(100vw - 220px)',
    source: modelSourceMap.huggingface_value,
  },
  {
    keys: HotKeys.NEW3,
    width: 'calc(100vw - 220px)',
    source: modelSourceMap.modelscope_value,
  },
  {
    keys: HotKeys.NEW2,
    width: 600,
    source: modelSourceMap.ollama_library_value,
  },
  { keys: HotKeys.NEW4, width: 600, source: modelSourceMap.local_path_value },
]

/**
 * hotkeyConfigs.map(({ keys, width, source }) =>
       useHotkeys(
         keys.join(','),
         () => {
           setOpenDeployModal({
             show: true,
             width,
             source,
             gpuOptions: gpuDeviceList.current
           });
         },
         {
           preventDefault: true,
           enabled: !openAddModal && !openDeployModal.show && !openLogModal
         }
       )
     );
 *
 */
