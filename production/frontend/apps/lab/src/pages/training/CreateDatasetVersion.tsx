import React from 'react'
import CreateDatasetVersionPage from '../../components/dataset/CreateDatasetVersionPage.tsx'

const CreateDatasetVersion: React.FC<{ usage: string }> = ({ usage }) => {
  return <CreateDatasetVersionPage type="training" usage={usage} />
}

export default CreateDatasetVersion
