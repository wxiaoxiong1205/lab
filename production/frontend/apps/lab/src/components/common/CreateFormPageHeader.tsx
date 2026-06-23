import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Space } from 'antd'
import type { ReactNode } from 'react'
import './CreateFormPageHeader.css'

interface CreateFormPageHeaderProps {
  title: ReactNode
  description?: ReactNode
  onBack: () => void
  actions?: ReactNode
  backAriaLabel?: string
}

export default function CreateFormPageHeader({
  title,
  description,
  onBack,
  actions,
  backAriaLabel = '返回',
}: CreateFormPageHeaderProps) {
  return (
    <header className="create-form-header">
      <div className="create-form-title-group">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          className="create-form-back"
          onClick={onBack}
          aria-label={backAriaLabel}
        />
        <div className="create-form-title-copy">
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {actions ? <Space size={10}>{actions}</Space> : null}
    </header>
  )
}
