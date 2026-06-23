import React from 'react'
import CreateDatasetVersionPage from '../../components/dataset/CreateDatasetVersionPage.tsx'

const CreateTestDatasetTestVersion: React.FC<{ usage: string }> = ({ usage }) => {
  return <CreateDatasetVersionPage type="test" usage={usage} />
}

export default CreateTestDatasetTestVersion
