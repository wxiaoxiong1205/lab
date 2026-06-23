import React from 'react'
import DatasetDetail from '@/components/dataset/DatasetDetail.tsx'

const TrainingDatasetDetail: React.FC<{ usage: string }> = ({ usage }) => {
  return <DatasetDetail type="training" usage={usage} />
}

export default TrainingDatasetDetail
