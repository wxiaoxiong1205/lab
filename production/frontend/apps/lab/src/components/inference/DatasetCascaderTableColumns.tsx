import { title } from 'node:process'
import type { ColumnsType } from 'antd/es/table'
import { Checkbox, Radio, Tag } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import React from 'react'
import EllipsisTooltip from '../common/EllipsisTooltip'
import { formatDatasetFormatDisplay, formatDatasetTypeLabel } from './DatasetCascaderSelectorShared'
import {
  methodTypeTagColor,
  rowKeyOf,
  toggleInferenceResultRowMultiSelect,
} from './datasetCascaderSelectorUtils'
import type { TrainingDatasetItem } from '@/types/training'

export interface DatasetListColumnsParams {
  useInferenceResultApi: boolean
  hideStatsDatasetTypeAndFormatFilters: boolean
  noVersionInferenceMode: boolean
  inferenceMultiSelect: boolean
  selectedInferenceRowKeys: string[]
  setSelectedInferenceRowKeys: Dispatch<SetStateAction<string[]>>
  selectedRowKey: string | null
  setSelectedRowKey: Dispatch<SetStateAction<string | null>>
  setSelectedDatasetRecord: Dispatch<SetStateAction<TrainingDatasetItem | null>>
}

export function buildDatasetListColumns(p: DatasetListColumnsParams): ColumnsType<TrainingDatasetItem> {
  const {
    useInferenceResultApi,
    hideStatsDatasetTypeAndFormatFilters,
    noVersionInferenceMode,
    inferenceMultiSelect,
    selectedInferenceRowKeys,
    setSelectedInferenceRowKeys,
    selectedRowKey,
    setSelectedRowKey,
    setSelectedDatasetRecord,
  } = p

  return [
    {
      title: '数据集名称',
      dataIndex: 'dataset_name',
      key: 'dataset_name',
      ellipsis: true,
    },
    ...(!useInferenceResultApi
      ? [
          {
            title: '最新版本',
            dataIndex: 'latest_version',
            key: 'latest_version',
            width: 100,
          } as ColumnsType<TrainingDatasetItem>[number],
        ]
      : []),
    ...(!hideStatsDatasetTypeAndFormatFilters
      ? [
          {
            title: '数据用途',
            key: 'purpose',
            width: 120,
            render: (_: unknown, r: TrainingDatasetItem) => (
              <Tag color={methodTypeTagColor(r.training_method_type)}>
                {formatDatasetTypeLabel(r.dataset_type)}
              </Tag>
            ),
          } as ColumnsType<TrainingDatasetItem>[number],
          {
            title: '数据格式',
            dataIndex: 'dataset_format',
            key: 'dataset_format',
            width: 200,
            render: (v: string) => formatDatasetFormatDisplay(v),
          } as ColumnsType<TrainingDatasetItem>[number],
          {
            title: '待评估模型',
            dataIndex: 'model_name',
            key: 'model_name',
            width: 200,
          } as ColumnsType<TrainingDatasetItem>[number],
        ]
      : []),
    ...(noVersionInferenceMode
      ? [
          {
            title: '操作',
            key: 'action',
            width: 120,
            fixed: 'right',
            render: (_: unknown, record: TrainingDatasetItem) => {
              const rk = rowKeyOf(record.usage, record.dataset_name)
              if (inferenceMultiSelect) {
                return (
                  <span role="presentation" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedInferenceRowKeys.includes(rk)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation()
                        toggleInferenceResultRowMultiSelect(rk, setSelectedInferenceRowKeys)
                      }}
                      className="p-0!"
                    >
                      选择
                    </Checkbox>
                  </span>
                )
              }
              return (
                <Radio
                  checked={selectedRowKey === rk}
                  onChange={() => {
                    setSelectedRowKey(rk)
                    setSelectedDatasetRecord(record)
                  }}
                  className="pl-0!"
                >
                  选择此数据集
                </Radio>
              )
            },
          } as ColumnsType<TrainingDatasetItem>[number],
        ]
      : []),
  ]
}
