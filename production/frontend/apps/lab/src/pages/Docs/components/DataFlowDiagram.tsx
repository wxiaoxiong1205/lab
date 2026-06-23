import React from 'react'
import '../ProductPlanning.css'

export const DataFlowDiagram: React.FC = () => {
  // 定义流程步骤
  const steps = [
    { id: 1, title: '数据集导入', next: '数据集处理', final: '数据集存储' },
    { id: 2, title: '提示词设计', next: '变量替换', final: '提示词应用' },
    { id: 3, title: 'LLM配置', next: 'API请求构建', final: 'LLM调用' },
    { id: 4, title: '结果收集', next: '指标计算', final: '结果分析' },
    { id: 5, title: '报告生成', next: '可视化', final: '改进建议' },
  ]

  return (
    <div className="architecture-container">
      <svg
        width="100%"
        height="600"
        viewBox="0 0 900 600"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M0,0 L0,10 L10,5 z" fill="#1890ff" />
          </marker>
        </defs>

        {steps.map((step, index) => (
          <g key={step.id} transform={`translate(0, ${index * 100})`}>
            {/* 第一个节点 */}
            <rect x="100" y="50" width="140" height="60" rx="5" fill="#e6f7ff" stroke="#1890ff" strokeWidth="2" />
            <text x="170" y="85" fontSize="14" fontWeight="bold" textAnchor="middle">{step.title}</text>

            {/* 第一个连接箭头 */}
            <line
              x1="240"
              y1="80"
              x2="330"
              y2="80"
              stroke="#1890ff"
              strokeWidth="2"
              markerEnd="url(#arrow)"
            />

            {/* 第二个节点 */}
            <rect x="350" y="50" width="140" height="60" rx="5" fill="#f0f5ff" stroke="#1890ff" strokeWidth="2" />
            <text x="420" y="85" fontSize="14" fontWeight="bold" textAnchor="middle">{step.next}</text>

            {/* 第二个连接箭头 */}
            <line
              x1="490"
              y1="80"
              x2="580"
              y2="80"
              stroke="#1890ff"
              strokeWidth="2"
              markerEnd="url(#arrow)"
            />

            {/* 第三个节点 */}
            <rect x="600" y="50" width="140" height="60" rx="5" fill="#f9f0ff" stroke="#722ed1" strokeWidth="2" />
            <text x="670" y="85" fontSize="14" fontWeight="bold" textAnchor="middle">{step.final}</text>

            {/* 垂直连接线到下一个流程 */}
            {index < steps.length - 1 && (
              <>
                <line
                  x1="670"
                  y1="110"
                  x2="670"
                  y2="150"
                  stroke="#722ed1"
                  strokeWidth="2"
                  strokeDasharray="5,3"
                />
                <line
                  x1="670"
                  y1="150"
                  x2="170"
                  y2="150"
                  stroke="#722ed1"
                  strokeWidth="2"
                  strokeDasharray="5,3"
                />
                <line
                  x1="170"
                  y1="150"
                  x2="170"
                  y2="170"
                  stroke="#722ed1"
                  strokeWidth="2"
                  strokeDasharray="5,3"
                  markerEnd="url(#arrow)"
                />
              </>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}
