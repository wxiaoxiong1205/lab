import { AppstoreOutlined, CloudServerOutlined, ExperimentOutlined } from '@ant-design/icons'
import React from 'react'

export type TaskScope = 'all' | 'llm' | 'ml'

interface TaskScopeFilterProps {
  value: TaskScope
  counts: Record<TaskScope, number>
  options?: TaskScope[]
  onChange: (scope: TaskScope) => void
}

const scopeOptions: Array<{
  value: TaskScope
  label: string
  hint: string
  icon: React.ReactNode
  color: string
}> = [
  {
    value: 'all',
    label: '全部任务',
    hint: '当前视图',
    icon: <AppstoreOutlined />,
    color: '#1d4ed8',
  },
  {
    value: 'llm',
    label: '大模型',
    hint: '筛选视图',
    icon: <CloudServerOutlined />,
    color: '#2563eb',
  },
  {
    value: 'ml',
    label: '机器学习',
    hint: '筛选视图',
    icon: <ExperimentOutlined />,
    color: '#0f766e',
  },
]

const TaskScopeFilter = ({ value, counts, options, onChange }: TaskScopeFilterProps) => {
  const visibleOptions = options?.length
    ? scopeOptions.filter((item) => options.includes(item.value))
    : scopeOptions

  return (
    <div
      className={`task-overview-scope-grid ${visibleOptions.length === 1 ? 'task-overview-scope-grid--single' : ''}`}
      role="tablist"
      aria-label="任务范围"
    >
      {visibleOptions.map((item) => {
        const active = value === item.value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`task-overview-scope-card ${active ? 'task-overview-scope-card--active' : ''}`}
            style={{ '--scope-color': item.color } as React.CSSProperties}
            onClick={() => onChange(item.value)}
          >
            <span className="task-overview-scope-card__icon">{item.icon}</span>
            <span className="task-overview-scope-card__main">
              <span className="task-overview-scope-card__label">{item.label}</span>
              <span className="task-overview-scope-card__hint">{item.hint}</span>
            </span>
            <span className="task-overview-scope-card__count">{counts[item.value] || 0}</span>
          </button>
        )
      })}
    </div>
  )
}

export default TaskScopeFilter
