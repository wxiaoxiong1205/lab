import React from 'react'
import DatasetTab from './DatasetTab.tsx'

interface TestingDatasetTabProps {
  projectId: number
}

const EvaluationDatasetTab: React.FC<TestingDatasetTabProps> = ({ projectId }) => {
  return (
    <DatasetTab
      projectId={projectId}
      type="validation"
      basePath={`/project/${projectId}/datasets/validation`}
    />
  )
}

export default EvaluationDatasetTab
