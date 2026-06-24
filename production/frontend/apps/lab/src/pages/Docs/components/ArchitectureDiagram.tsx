import React from 'react'
import '../ProductPlanning.css'

export const ArchitectureDiagram: React.FC = () => {
  return (
    <div className="architecture-container">
      <svg
        width="100%"
        height="600"
        viewBox="0 0 1100 600"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 主标题 */}
        <text
          x="550"
          y="40"
          fontSize="24"
          fontWeight="bold"
          textAnchor="middle"
        >
          模型训练平台 - 双核心系统架构
        </text>

        {/* 左侧模型评估系统 */}
        <rect
          x="100"
          y="80"
          width="400"
          height="460"
          rx="10"
          fill="#f0f5ff"
          stroke="#1890ff"
          strokeWidth="2"
        />
        <text
          x="300"
          y="110"
          fontSize="20"
          fontWeight="bold"
          textAnchor="middle"
          fill="#1890ff"
        >
          模型评估系统
        </text>

        {/* 右侧模型微调系统 */}
        <rect
          x="600"
          y="80"
          width="400"
          height="460"
          rx="10"
          fill="#f6ffed"
          stroke="#52c41a"
          strokeWidth="2"
        />
        <text
          x="800"
          y="110"
          fontSize="20"
          fontWeight="bold"
          textAnchor="middle"
          fill="#52c41a"
        >
          模型微调系统
        </text>

        {/* 模型评估系统模块 */}
        <rect
          x="150"
          y="140"
          width="300"
          height="70"
          rx="5"
          fill="#fff"
          stroke="#1890ff"
          strokeWidth="1.5"
        />
        <text
          x="300"
          y="170"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
        >
          数据集管理
        </text>
        <text x="300" y="195" fontSize="12" textAnchor="middle">
          创建、导入和组织测试数据集
        </text>

        <rect
          x="150"
          y="220"
          width="300"
          height="70"
          rx="5"
          fill="#fff"
          stroke="#1890ff"
          strokeWidth="1.5"
        />
        <text
          x="300"
          y="250"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
        >
          提示词管理
        </text>
        <text x="300" y="275" fontSize="12" textAnchor="middle">
          设计和优化用于评估的提示词模板
        </text>

        <rect
          x="150"
          y="300"
          width="300"
          height="70"
          rx="5"
          fill="#fff"
          stroke="#1890ff"
          strokeWidth="1.5"
        />
        <text
          x="300"
          y="330"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
        >
          LLM配置管理
        </text>
        <text x="300" y="355" fontSize="12" textAnchor="middle">
          配置不同语言模型的参数和接口
        </text>

        <rect
          x="150"
          y="380"
          width="300"
          height="70"
          rx="5"
          fill="#fff"
          stroke="#1890ff"
          strokeWidth="1.5"
        />
        <text
          x="300"
          y="410"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
        >
          评估任务管理
        </text>
        <text x="300" y="435" fontSize="12" textAnchor="middle">
          执行评估任务和监控进度
        </text>

        <rect
          x="150"
          y="460"
          width="300"
          height="70"
          rx="5"
          fill="#fff"
          stroke="#1890ff"
          strokeWidth="1.5"
        />
        <text
          x="300"
          y="490"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
        >
          评估结果分析
        </text>
        <text x="300" y="515" fontSize="12" textAnchor="middle">
          多维度分析模型表现和生成报告
        </text>

        {/* 模型微调系统模块 */}
        <rect
          x="650"
          y="140"
          width="300"
          height="70"
          rx="5"
          fill="#fff"
          stroke="#52c41a"
          strokeWidth="1.5"
        />
        <text
          x="800"
          y="170"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
        >
          训练数据管理
        </text>
        <text x="800" y="195" fontSize="12" textAnchor="middle">
          准备和管理用于模型微调的数据集
        </text>

        <rect
          x="650"
          y="220"
          width="300"
          height="70"
          rx="5"
          fill="#fff"
          stroke="#52c41a"
          strokeWidth="1.5"
        />
        <text
          x="800"
          y="250"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
        >
          机器资源管理
        </text>
        <text x="800" y="275" fontSize="12" textAnchor="middle">
          管理训练节点和计算资源
        </text>

        <rect
          x="650"
          y="300"
          width="300"
          height="70"
          rx="5"
          fill="#fff"
          stroke="#52c41a"
          strokeWidth="1.5"
        />
        <text
          x="800"
          y="330"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
        >
          微调任务管理
        </text>
        <text x="800" y="355" fontSize="12" textAnchor="middle">
          创建、监控和管理微调任务
        </text>

        <rect
          x="650"
          y="380"
          width="300"
          height="70"
          rx="5"
          fill="#fff"
          stroke="#52c41a"
          strokeWidth="1.5"
        />
        <text
          x="800"
          y="410"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
        >
          模型管理与测试
        </text>
        <text x="800" y="435" fontSize="12" textAnchor="middle">
          管理微调产生的模型版本
        </text>

        <rect
          x="650"
          y="460"
          width="300"
          height="70"
          rx="5"
          fill="#fff"
          stroke="#52c41a"
          strokeWidth="1.5"
        />
        <text
          x="800"
          y="490"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
        >
          模型部署与应用
        </text>
        <text x="800" y="515" fontSize="12" textAnchor="middle">
          将微调后的模型部署到生产环境
        </text>

        {/* 系统连接箭头 */}
        <path
          d="M 500 200 C 550 200, 550 200, 600 200"
          stroke="#52c41a"
          strokeWidth="2"
          fill="none"
          markerEnd="url(#arrowhead)"
        />
        <path
          d="M 600 400 C 550 400, 550 400, 500 400"
          stroke="#1890ff"
          strokeWidth="2"
          fill="none"
          markerEnd="url(#arrowhead2)"
        />

        <text x="550" y="185" fontSize="12" textAnchor="middle" fill="#52c41a">
          评估结果驱动微调
        </text>
        <text x="550" y="385" fontSize="12" textAnchor="middle" fill="#1890ff">
          微调后验证评估
        </text>

        {/* 基础共享平台 */}
        <rect
          x="350"
          y="550"
          width="400"
          height="40"
          rx="5"
          fill="#722ed1"
          stroke="#722ed1"
          strokeWidth="0"
        />
        <text
          x="550"
          y="575"
          fontSize="16"
          fontWeight="bold"
          textAnchor="middle"
          fill="white"
        >
          统一数据共享平台
        </text>

        {/* 系统到共享平台的连接线 */}
        <path
          d="M 300 540 C 300 550, 350 550, 400 550"
          stroke="#722ed1"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="5,3"
        />
        <path
          d="M 800 540 C 800 550, 750 550, 700 550"
          stroke="#722ed1"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="5,3"
        />

        {/* 箭头定义 */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#52c41a" />
          </marker>
          <marker
            id="arrowhead2"
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
