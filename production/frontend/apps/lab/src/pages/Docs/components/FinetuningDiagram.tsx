import React from 'react'
import '../ProductPlanning.css'

export const FinetuningDiagram: React.FC = () => {
  return (
    <div className="architecture-container">
      <svg
        width="100%"
        height="500"
        viewBox="0 0 900 500"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 外部容器框 */}
        <rect x="150" y="50" width="600" height="400" rx="10" fill="#f0f5ff" stroke="#1890ff" strokeWidth="2" />
        <text x="450" y="80" fontSize="16" fontWeight="bold" textAnchor="middle">在线微调功能架构</text>

        {/* 机器管理和资源调度 */}
        <rect x="220" y="120" width="140" height="60" rx="5" fill="#e6f7ff" stroke="#1890ff" strokeWidth="2" />
        <text x="290" y="155" fontSize="14" fontWeight="bold" textAnchor="middle">机器管理</text>

        <rect x="540" y="120" width="140" height="60" rx="5" fill="#e6f7ff" stroke="#1890ff" strokeWidth="2" />
        <text x="610" y="155" fontSize="14" fontWeight="bold" textAnchor="middle">资源调度</text>

        {/* 机器管理和资源调度的双向连接 */}
        <line x1="360" y1="150" x2="540" y2="150" stroke="#1890ff" strokeWidth="2" />
        <polygon points="535,145 545,150 535,155" fill="#1890ff" />
        <polygon points="365,145 355,150 365,155" fill="#1890ff" />

        {/* 微调任务和训练数据集 */}
        <rect x="220" y="220" width="140" height="60" rx="5" fill="#fff4e8" stroke="#fa8c16" strokeWidth="2" />
        <text x="290" y="255" fontSize="14" fontWeight="bold" textAnchor="middle">微调任务</text>

        <rect x="540" y="220" width="140" height="60" rx="5" fill="#fff4e8" stroke="#fa8c16" strokeWidth="2" />
        <text x="610" y="255" fontSize="14" fontWeight="bold" textAnchor="middle">训练数据集</text>

        {/* 微调任务和训练数据集的双向连接 */}
        <line x1="360" y1="250" x2="540" y2="250" stroke="#fa8c16" strokeWidth="2" />
        <polygon points="535,245 545,250 535,255" fill="#fa8c16" />
        <polygon points="365,245 355,250 365,255" fill="#fa8c16" />

        {/* 模型管理和评估与部署 */}
        <rect x="220" y="320" width="140" height="60" rx="5" fill="#f6ffed" stroke="#52c41a" strokeWidth="2" />
        <text x="290" y="355" fontSize="14" fontWeight="bold" textAnchor="middle">模型管理</text>

        <rect x="540" y="320" width="140" height="60" rx="5" fill="#f6ffed" stroke="#52c41a" strokeWidth="2" />
        <text x="610" y="355" fontSize="14" fontWeight="bold" textAnchor="middle">评估与部署</text>

        {/* 模型管理和评估与部署的双向连接 */}
        <line x1="360" y1="350" x2="540" y2="350" stroke="#52c41a" strokeWidth="2" />
        <polygon points="535,345 545,350 535,355" fill="#52c41a" />
        <polygon points="365,345 355,350 365,355" fill="#52c41a" />

        {/* 垂直连接线 */}
        <line x1="290" y1="180" x2="290" y2="220" stroke="#1890ff" strokeWidth="2" />
        <polygon points="285,215 290,225 295,215" fill="#1890ff" />
        <polygon points="285,185 290,175 295,185" fill="#1890ff" />

        <line x1="290" y1="280" x2="290" y2="320" stroke="#fa8c16" strokeWidth="2" />
        <polygon points="285,315 290,325 295,315" fill="#fa8c16" />
        <polygon points="285,285 290,275 295,285" fill="#fa8c16" />
      </svg>
    </div>
  )
}
