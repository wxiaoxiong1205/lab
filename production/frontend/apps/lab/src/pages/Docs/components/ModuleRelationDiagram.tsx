import React from 'react'
import '../ProductPlanning.css'

export const ModuleRelationDiagram: React.FC = () => {
  return (
    <div className="architecture-container">
      <svg
        width="100%"
        height="500"
        viewBox="0 0 900 500"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 项目节点 */}
        <rect x="390" y="50" width="120" height="60" rx="5" fill="#e6f7ff" stroke="#1890ff" strokeWidth="2" />
        <text x="450" y="85" fontSize="14" fontWeight="bold" textAnchor="middle">项目(Project)</text>

        {/* 从项目到下层的连接线 */}
        <line x1="450" y1="110" x2="450" y2="140" stroke="#1890ff" strokeWidth="2" />
        <text x="470" y="135" fontSize="12" textAnchor="start">包含</text>

        {/* 三个中层节点连接到项目的线 */}
        <path d="M 450 140 L 450 170 L 200 170 L 200 200" stroke="#1890ff" strokeWidth="2" fill="none" />
        <path d="M 450 140 L 450 170 L 450 200" stroke="#1890ff" strokeWidth="2" fill="none" />
        <path d="M 450 140 L 450 170 L 700 170 L 700 200" stroke="#1890ff" strokeWidth="2" fill="none" />

        {/* 三个中层节点 */}
        <rect x="140" y="200" width="120" height="60" rx="5" fill="#e6f7ff" stroke="#1890ff" strokeWidth="2" />
        <text x="200" y="235" fontSize="14" fontWeight="bold" textAnchor="middle">数据集(Dataset)</text>

        <rect x="390" y="200" width="120" height="60" rx="5" fill="#e6f7ff" stroke="#1890ff" strokeWidth="2" />
        <text x="450" y="235" fontSize="14" fontWeight="bold" textAnchor="middle">提示词(Prompt)</text>

        <rect x="640" y="200" width="120" height="60" rx="5" fill="#e6f7ff" stroke="#1890ff" strokeWidth="2" />
        <text x="700" y="235" fontSize="14" fontWeight="bold" textAnchor="middle">LLM配置(Config)</text>

        {/* 中层节点到评估任务的连接线 */}
        <path d="M 200 260 L 200 300 L 450 300 L 450 340" stroke="#1890ff" strokeWidth="2" fill="none" />
        <path d="M 450 260 L 450 300 L 450 340" stroke="#1890ff" strokeWidth="2" fill="none" />
        <path d="M 700 260 L 700 300 L 450 300 L 450 340" stroke="#1890ff" strokeWidth="2" fill="none" />

        {/* 评估任务节点 */}
        <rect x="390" y="340" width="120" height="60" rx="5" fill="#fff4e8" stroke="#fa8c16" strokeWidth="2" />
        <text x="450" y="375" fontSize="14" fontWeight="bold" textAnchor="middle">评估任务(Task)</text>

        {/* 评估任务到评估结果的连接线 */}
        <line x1="450" y1="400" x2="450" y2="430" stroke="#fa8c16" strokeWidth="2" />
        <text x="470" y="425" fontSize="12" textAnchor="start">生成</text>

        {/* 评估结果节点 */}
        <rect x="390" y="430" width="120" height="60" rx="5" fill="#fff2e8" stroke="#fa541c" strokeWidth="2" />
        <text x="450" y="465" fontSize="14" fontWeight="bold" textAnchor="middle">评估结果(Result)</text>

        {/* 箭头标记定义 */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#1890ff" />
          </marker>
        </defs>
      </svg>
    </div>
  )
}
