/*
 * @FilePath: \deepexi-lab-web\src\pages\testing\CreateTestingDatasetPage.tsx
 */
import React from 'react'
import CreateDatasetPage from '@/components/dataset/CreateDatasetPage'

/**
 * 创建测试数据集页面组件
 * 使用公共组件 CreateDatasetPage，设置 type="test"
 */
const CreateTestingDatasetPage: React.FC<{ usage: string }> = ({ usage }) => {
  return <CreateDatasetPage type="test" usage={usage} />
}

export default CreateTestingDatasetPage
