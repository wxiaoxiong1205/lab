/*
 * @FilePath: \deepexi-lab-web\src\pages\training\CreateTrainingDatasetPage.tsx
 */
import React from 'react'
import CreateDatasetPage from '@/components/dataset/CreateDatasetPage'

/**
 * 创建训练数据集页面组件
 * 使用公共组件 CreateDatasetPage，设置 type="training"
 */
const CreateTrainingDatasetPage: React.FC<{ usage: string }> = ({ usage }) => {
  return <CreateDatasetPage type="training" usage={usage} />
}

export default CreateTrainingDatasetPage
