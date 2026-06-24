/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-08-27 15:39:53
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-09-30 16:27:42
 * @FilePath: \deepexi-lab-web\src\components\dataset\TrainingDatasetTab.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import React from 'react'
import DatasetTab from './DatasetTab.tsx'

interface TrainingDatasetTabProps {
  projectId: number
}

const TrainingDatasetTab: React.FC<TrainingDatasetTabProps> = ({ projectId }) => {
  return (
    <DatasetTab
      projectId={projectId}
      type="training"
      basePath={`/project/${projectId}/datasets/training`}
    />
  )
}

export default TrainingDatasetTab
