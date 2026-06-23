import React from 'react'
import { Alert, Button, Card, Col, Row, Space, Typography, message } from 'antd'
import { InfoCircleOutlined, LinkOutlined, LockOutlined, TagsOutlined, UserOutlined } from '@ant-design/icons'
import useI18n from '../hooks/useI18n'
import './DataAnnotation.css'

const { Title, Paragraph, Text } = Typography
/**
 * 数据标注页面
 * 提供Deepexi Label数据标注工具的访问
 */
const DataAnnotation: React.FC = () => {
  const { t } = useI18n()
  // 打开Deepexi Label新窗口，带token参数
  const handleOpenDeepexiLabel = () => {
    try {
      // 获取当前系统token
      const token = localStorage.getItem('auth_token')
      if (!token) {
        message.error('获取用户认证信息失败，请重新登录')
        return
      }
      // 构建带token的URL
      const baseUrl = 'http://101.126.150.150:9048'
      const url = `${baseUrl}/projects?page=1&token=${encodeURIComponent(token)}`
      // 在新窗口打开标注工具
      window.open(url, '_blank')
    }
    catch (error) {
      console.error('打开标注工具失败:', error)
      message.error('打开标注工具失败，请稍后重试')
    }
  }
  return (
    <div className="p-[32px_40px] max-w-[800px] m-[0_auto]">
      {/* 页面标题和介绍 */}
      <div className="data-annotation-hero mb-[40px] text-center p-[60px_20px] rounded-[12px]">
        <Title
          className="data-annotation-title mb-[16px]"
          level={1}
        >
          <TagsOutlined className="mr-3" />
          {t('dataAnnotation.title', '数据标注')}
        </Title>
        <Paragraph
          className="text-[var(--lab-color-text-muted)] text-[18px] max-w-[600px] m-[0_auto_32px]"
        >
          {t('dataAnnotation.description', '数据标注采用独立部署的标注工具进行。点击下方按钮可以打开Deepexi Label标注平台，系统将自动传递您的登录凭证，无需重复登录。')}
        </Paragraph>

        {/* 主要访问按钮 */}
        <Button
          className="data-annotation-primary-button text-[16px] h-[48px] pl-[32px] pr-[32px] rounded-[8px]"
          type="primary"
          size="large"
          icon={<LinkOutlined />}
          onClick={handleOpenDeepexiLabel}
        >
          {t('dataAnnotation.openDeepexiLabel', '打开Deepexi Label')}
        </Button>
      </div>

      {/* 登录信息 */}
      <Card className="mb-[32px]">
        <Title level={3}>
          <UserOutlined className="mr-2 text-[var(--lab-color-brand-primary)]" />
          {t('dataAnnotation.loginInfo', '访问说明')}
        </Title>
        <Alert message={t('dataAnnotation.loginTitle', '系统将自动传递您的身份认证信息')} description={t('dataAnnotation.loginDescription', '点击上方按钮后，系统会自动将您当前的登录凭证传递给标注工具，您无需手动输入用户名和密码。如果遇到登录问题，请确保您的账号有标注工具的访问权限。')} type="info" showIcon className="mb-4" />
        <div className="text-[14px] text-[var(--lab-color-text-muted)]">
          <p>
            <Text strong>备用登录方式：</Text>
            如果自动登录失败，您也可以使用以下账号手动登录：
          </p>
          <Row gutter={[16, 16]} className="mt-3">
            <Col xs={24} md={12}>
              <Card size="small" className="data-annotation-account-card">
                <Space>
                  <UserOutlined className="text-[var(--lab-color-brand-primary)]" />
                  <Text strong>
                    {t('dataAnnotation.username', '用户名')}
                    :
                  </Text>
                  <Text code copyable>xujiahao@deepexi.com</Text>
                </Space>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" className="data-annotation-account-card">
                <Space>
                  <LockOutlined className="text-[var(--lab-color-brand-primary)]" />
                  <Text strong>
                    {t('dataAnnotation.password', '密码')}
                    :
                  </Text>
                  <Text code copyable>12345678</Text>
                </Space>
              </Card>
            </Col>
          </Row>
        </div>
      </Card>

      {/* 使用说明 */}
      <Card>
        <Title level={3}>
          <InfoCircleOutlined className="mr-2 text-[var(--lab-color-brand-primary)]" />
          {t('dataAnnotation.usage', '使用说明')}
        </Title>
        <div className="text-[14px] text-[var(--lab-color-text-muted)] leading-[1.6]">
          <p>
            1.
            {t('dataAnnotation.steps.access', '点击上方按钮打开Deepexi Label外置标注工具')}
          </p>
          <p>
            2.
            {t('dataAnnotation.steps.auto', '系统会自动传递您的身份认证信息，实现无缝登录')}
          </p>
          <p>
            3.
            {t('dataAnnotation.steps.manual', '如果自动登录失败，请使用上方提供的备用账号手动登录')}
          </p>
          <p>
            4.
            {t('dataAnnotation.steps.start', '在外置工具中开始进行数据标注')}
          </p>
        </div>
      </Card>
    </div>
  )
}
export default DataAnnotation
