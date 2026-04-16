import React from 'react'
import { Typography } from 'antd'

const { Title, Paragraph } = Typography

const UsageGuide: React.FC = () => {
  return (
    <div>
      <Title level={2} style={{ marginTop: 0 }}>
        使用指南
      </Title>
      <Paragraph type="secondary" style={{ fontSize: 15, marginBottom: 32 }}>
        本页介绍 DeepexiLab 大模型训练平台的核心能力与日常使用方式，帮助您快速完成数据准备、训练、评估与部署等流程。
      </Paragraph>

      <Title level={4}>平台概览</Title>
      <Paragraph>
        平台当前采用<strong>项目空间</strong>与<strong>系统管理</strong>双入口结构。登录后默认进入项目空间，用户可先查看自己有权限访问的项目卡片，点击项目后再进入数据服务、模型训练、模型评估、模型服务与机器学习等业务模块；平台级治理能力统一从系统管理入口进入。
      </Paragraph>

      <Title level={4} style={{ marginTop: 28 }}>
        典型工作流
      </Title>
      <ol style={{ paddingLeft: 20, lineHeight: 1.8, marginBottom: 0 }}>
        <li>
          <strong>准备数据</strong>：在「训练数据管理」中上传或关联数据集；如需标注或清洗，可使用「数据标注」「数据清洗」。
        </li>
        <li>
          <strong>发起训练</strong>：在「大模型训练」中创建训练任务，配置基础模型、超参与数据路径，提交后可在任务详情中查看日志与指标。
        </li>
        <li>
          <strong>评估与发布</strong>：通过「效果评估」「评估指标」查看模型表现；在「模型部署」或「在线推理服务」中将模型发布为可调用的服务。
        </li>
      </ol>

      <Title level={4} style={{ marginTop: 28 }}>
        权限与项目
      </Title>
      <Paragraph>
        系统管理中的「项目管理」用于维护项目成员和数据权限。登录后系统会自动匹配当前账号可访问的项目；请先从项目空间点击项目卡片进入，再在该项目上下文中执行训练、评估和部署等业务操作。
      </Paragraph>

      <Title level={4} style={{ marginTop: 28 }}>
        获取帮助
      </Title>
      <Paragraph style={{ marginBottom: 0 }}>
        若需接口对接、嵌入网站或自动化流水线说明，可在后续版本中查阅「开发指南」；当前版本以控制台操作为主。遇到问题请联系平台管理员或提交工单。
      </Paragraph>
    </div>
  )
}

export default UsageGuide
