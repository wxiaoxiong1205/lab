import React from 'react'
import { Checkbox, Radio, message } from 'antd'
import type { TrainingMultiPick } from './DatasetCascaderSelectorShared'
import type { TrainingDatasetItem } from '@/types/training'

export type ExpandedVersionTableRow = {
  value: string
  versionData?: unknown
  total_samples?: number
}

export interface DatasetExpandedVersionOpCellProps {
  row: ExpandedVersionTableRow
  rk: string
  record: TrainingDatasetItem
  showLabel?: boolean
  trainingDatasetMultiSelect: boolean
  useInferenceResultApi: boolean
  trainingMultiPicks: TrainingMultiPick[]
  setTrainingMultiPicks: React.Dispatch<React.SetStateAction<TrainingMultiPick[]>>
  trainingMultiSelectMax: number
  selectedRowKey: string | null
  selectedVersionByRow: Record<string, string>
  setSelectedRowKey: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedDatasetRecord: React.Dispatch<React.SetStateAction<TrainingDatasetItem | null>>
  setSelectedVersionByRow: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

const selectVersionLabel = 'Select version'

export const DatasetExpandedVersionOpCell: React.FC<DatasetExpandedVersionOpCellProps> = ({
  row,
  rk,
  record,
  showLabel = true,
  trainingDatasetMultiSelect,
  useInferenceResultApi,
  trainingMultiPicks,
  setTrainingMultiPicks,
  trainingMultiSelectMax,
  selectedRowKey,
  selectedVersionByRow,
  setSelectedRowKey,
  setSelectedDatasetRecord,
  setSelectedVersionByRow,
}) => {
  if (trainingDatasetMultiSelect && !useInferenceResultApi) {
    const checked = trainingMultiPicks.some((p) => p.rk === rk && p.version === row.value)
    return (
      <span role="presentation" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          className={!showLabel ? '[&_.ant-checkbox+span]:hidden' : undefined}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation()
            if (checked) {
              setTrainingMultiPicks((prev) =>
                prev.filter((p) => !(p.rk === rk && p.version === row.value)),
              )
            }
            else {
              setTrainingMultiPicks((prev) => {
                if (prev.length >= trainingMultiSelectMax) {
                  message.warning(`最多选${trainingMultiSelectMax}个数据集`)
                  return prev
                }
                return [
                  ...prev,
                  {
                    pickKey: `${rk}::${row.value}`,
                    rk,
                    usage: record.usage as string,
                    datasetName: record.dataset_name,
                    version: row.value,
                    versionData: row.versionData,
                    record,
                  },
                ]
              })
            }
          }}
        >
          {showLabel ? selectVersionLabel : ''}
        </Checkbox>
      </span>
    )
  }

  return (
    <Radio
      checked={selectedRowKey === rk && selectedVersionByRow[rk] === row.value}
      className={!showLabel ? '[&_.ant-radio+span]:hidden' : undefined}
      onChange={() => {
        setSelectedRowKey(rk)
        setSelectedDatasetRecord(record)
        setSelectedVersionByRow((m) => ({ ...m, [rk]: row.value }))
      }}
    >
      {showLabel ? selectVersionLabel : ''}
    </Radio>
  )
}
