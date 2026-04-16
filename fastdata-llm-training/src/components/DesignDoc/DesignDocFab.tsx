import React from 'react'
import { Button, Tooltip } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'

interface DesignDocFabProps {
  open: boolean
  onToggle: () => void
  rightOffset: number
}

const DesignDocFab: React.FC<DesignDocFabProps> = ({ open, onToggle, rightOffset }) => {
  return (
    <Tooltip title={open ? '收起需求文档' : '展开需求文档'}>
      <Button
        type="primary"
        shape="round"
        icon={<FileTextOutlined />}
        onClick={onToggle}
        className={`design-doc-fab ${open ? 'design-doc-fab--open' : ''}`}
        style={{ right: rightOffset }}
      >
        {open ? '收起文档' : '需求文档'}
      </Button>
    </Tooltip>
  )
}

export default DesignDocFab
