import React from 'react'
import { Card, Col, List, Row, Typography } from 'antd'
import { ArchitectureDiagram } from './components/ArchitectureDiagram'
import { SystemInteractionDiagram } from './components/SystemInteractionDiagram'
import './ProductPlanning.css'

const { Title, Paragraph, Text } = Typography
const ProductPlanning: React.FC = () => {
  return (
    <div className="product-planning p-[32px_40px]">
      <div className="product-header">
        <Title level={1}>模型训练平台产品规划</Title>
        <Paragraph className="subtitle">
          一站式大语言模型评估与微调平台
        </Paragraph>
      </div>

      <Card className="section-card">
        <Title level={2}>1. 产品概述</Title>
        <Paragraph>
          模型训练平台（DeepeXiLab）是专为大语言模型(LLM)设计的一站式评估与微调平台，由模型评估和模型微调两大核心功能组成，它们相互联动，形成完整的模型优化闭环。平台旨在帮助用户高效评估模型性能、发现不足，并通过精准微调提升模型能力，最终实现LLM的持续迭代优化。
        </Paragraph>

        <div className="highlight-block">
          <Title level={3}>核心价值主张</Title>
          <List
            dataSource={[
              '双核心一体化：评估+微调形成完整闭环',
              '数据驱动优化：基于评估结果精准微调',
              '全流程管理：从数据准备到模型部署',
              '多维度分析：全方位评估模型性能',
              '持续迭代：支持模型不断优化升级',
            ]}
            renderItem={(item) => <List.Item>{item}</List.Item>}
          />
        </div>
      </Card>

      <Card className="section-card">
        <Title level={2}>2. 产品架构</Title>

        <Title level={3}>2.1 双核心系统架构</Title>
        <Paragraph>
          模型训练平台采用"双核心系统架构"，由"模型评估系统"和"模型微调系统"两大核心部分组成，两系统紧密联动，形成完整的模型优化闭环：
        </Paragraph>

        <Row gutter={[24, 24]} className="feature-grid">
          <Col xs={24} sm={24} lg={12}>
            <Card className="feature-card" title="1. 模型评估系统">
              <List
                dataSource={[
                  '数据集管理: 创建、导入和组织测试数据集',
                  '提示词管理: 设计和优化用于评估的提示词模板',
                  'LLM配置管理: 配置不同语言模型的参数和接口',
                  '评估任务管理: 执行评估任务和监控进度',
                  '评估结果分析: 多维度分析模型表现和生成报告',
                ]}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
          </Col>
          <Col xs={24} sm={24} lg={12}>
            <Card className="feature-card" title="2. 模型微调系统">
              <List
                dataSource={[
                  '训练数据管理: 准备和管理用于模型微调的数据集',
                  '机器资源管理: 管理训练节点和计算资源',
                  '微调任务管理: 创建、监控和管理微调任务',
                  '模型管理与测试: 管理微调产生的模型版本',
                  '模型部署与应用: 将微调后的模型部署到生产环境',
                ]}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
          </Col>
        </Row>

        <Title level={3}>2.2 系统架构图</Title>
        <ArchitectureDiagram />

        <Title level={3}>2.3 双系统联动机制</Title>
        <Paragraph>
          模型训练平台基于"评估-微调-再评估"一体化解决方案，建立了模型评估系统和模型微调系统之间的紧密联动机制，通过这种双核心架构设计，模型训练平台形成了完整的模型优化闭环，评估系统可以精准识别模型弱点，微调系统可以有针对性地强化模型能力，两者协同工作，持续迭代提升模型性能，实现从评估到优化的无缝衔接。
        </Paragraph>
        <SystemInteractionDiagram />
      </Card>

      <div className="footer">
        <Text>© 2023 模型训练平台(DeepeXiLab). 保留所有权利。</Text>
      </div>
    </div>
  )
}
export default ProductPlanning
