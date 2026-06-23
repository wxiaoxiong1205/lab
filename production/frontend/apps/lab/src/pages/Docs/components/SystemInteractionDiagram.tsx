import React from 'react'
import { withBasePath } from '@/utils/path'
import '../ProductPlanning.css'

export const SystemInteractionDiagram: React.FC = () => {
  return (
    <div className="architecture-container">
      <img className="w-[100%] max-w-[900px] m-[0_auto] block" src={withBasePath('/eval_fintune.svg')} alt="双核心系统交互架构图" />
    </div>
  )
}
