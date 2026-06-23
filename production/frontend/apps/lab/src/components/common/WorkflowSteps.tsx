import type { ReactNode } from 'react'
import './WorkflowSteps.css'

export interface WorkflowStepItem {
  key?: string
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
}

interface WorkflowStepsProps {
  steps: WorkflowStepItem[]
  className?: string
}

export default function WorkflowSteps({ steps, className = '' }: WorkflowStepsProps) {
  return (
    <div className={`workflow-steps ${className}`.trim()}>
      {steps.map((step) => (
        <div
          key={step.key ?? String(step.title)}
          className="workflow-steps-item"
        >
          <div className="workflow-steps-icon">{step.icon}</div>
          <div className="workflow-steps-copy">
            <div className="workflow-steps-title">{step.title}</div>
            {step.description ? <div className="workflow-steps-desc">{step.description}</div> : null}
          </div>
        </div>
      ))}
    </div>
  )
}
