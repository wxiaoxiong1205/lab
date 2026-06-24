import { useTransform } from '@/locales'
import { Card, Col, Row, Space } from 'antd'
import _ from 'lodash'
import React, { useContext } from 'react'
import { overviewConfigs } from '../config'
import { DashboardContext } from '../config/dashboard-context'
import '../styles/index.css'
import styles from './over-view.module.css'

const renderCardItem = (data: {
  label: string
  value: React.ReactNode
  bgColor: string
}) => {
  const { label, value, bgColor } = data
  return (
    <Card
      bordered={false}
      style={{
        background: '#fff',
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
      className={`${styles['card-body']}`} // 使用自定义阴影提供更重的四周阴影效果
    >
      <div className={styles.content}>
        <div className="label font-500">{label}</div>
        <div className="value font-500">{value}</div>
      </div>
    </Card>
  )
}
const Overview: React.FC = () => {
  const { $t } = useTransform()
  const data = useContext(DashboardContext).resource_counts || {}

  const renderValue = (
    value:
      | number
      | {
        healthy: number
        warning: number
        error: number
      },
  ) => {
    if (typeof value === 'number') {
      return value
    }
    return (
      <Space className="value-box" size={20}>
        <span className="value-healthy">{value.healthy}</span>
        <span className="value-warning">{value.warning}</span>
        <span className="value-error">{value.error}</span>
      </Space>
    )
  }

  // 配置映射 - 将英文key映射到中文
  const getLabelText = (key: string) => {
    const labelMap: Record<string, string> = {
      'dashboard.workers': 'Workers',
      'dashboard.totalgpus': 'GPUs',
      'dashboard.models': $t('模型数'),
      'models.form.replicas': $t('副本数'),
    }
    return labelMap[key] || key
  }

  return (
    <div>
      <h1 className="font-bold text-xl mb-4">概览</h1>
      <Row gutter={[20, 20]} className={styles.row}>
        {overviewConfigs.map((config, index) => (
          <Col
            xs={{ flex: '100%' }}
            sm={{ flex: '50%' }}
            md={{ flex: '50%' }}
            lg={{ flex: '25%' }}
            xl={{ flex: '25%' }}
            key={config.key}
          >
            {renderCardItem({
              label: getLabelText(config.label),
              value: renderValue(_.get(data, config.key, 0)),
              bgColor: config.backgroundColor,
            })}
          </Col>
        ))}
      </Row>
    </div>
  )
}

export default React.memo(Overview)
