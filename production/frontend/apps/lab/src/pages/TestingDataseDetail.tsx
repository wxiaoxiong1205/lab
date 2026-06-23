import React from 'react'
import DatasetDetail from '@/components/dataset/DatasetDetail.tsx'

const TestingDatasetDetail: React.FC<{ usage: string }> = ({ usage }) => {
  return <DatasetDetail type="test" usage={usage} />
}

export default TestingDatasetDetail
