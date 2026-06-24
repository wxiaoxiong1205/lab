import React from 'react'
import { Popconfirm } from 'antd'

interface SaveTemplateModalProps {
  loading: boolean
  onConfirm: () => void
  children: React.ReactNode
}

/**
 * 保存模板二次确认组件
 */
const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  loading,
  onConfirm,
  children,
}) => {
  return (
    <Popconfirm
      title="保存为模板"
      description="确定要将当前清洗流程保存为模板吗？"
      onConfirm={onConfirm}
      okText="确定"
      cancelText="取消"
      okButtonProps={{ loading }}
    >
      {children}
    </Popconfirm>
  )
}

export default SaveTemplateModal
