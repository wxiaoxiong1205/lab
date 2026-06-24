import React from 'react'
import DatasetTab from './DatasetTab.tsx'

interface BusinessTestingDatasetTabProps {
  projectId: number
}

export default function BusinessTestingDatasetTab({ projectId }: BusinessTestingDatasetTabProps) {
  return (
    <DatasetTab
      projectId={projectId}
      type="business_test"
      dataset_type="business"
      basePath={`/project/${projectId}/business-test/training`}
    />
  )
}
