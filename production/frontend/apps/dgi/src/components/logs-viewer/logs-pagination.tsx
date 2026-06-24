import {
  DownOutlined,
  UpOutlined,
  VerticalLeftOutlined,
} from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import React from 'react'
import './styles/pagination.css'

interface LogsPaginationProps {
  page: number
  total: number
  pageSize?: number
  onPrev?: () => void
  onNext?: () => void
  onBackend?: () => void
  onToFirst?: () => void
}

const LogsPagination: React.FC<LogsPaginationProps> = (props) => {
  const { page, total, pageSize, onNext, onPrev, onBackend, onToFirst } = props

  const handleOnPrev = () => {
    onPrev?.()
  }

  const handleOnNext = () => {
    onNext?.()
  }

  return (
    <div className="pagination">
      <Tooltip
        title="第一页"
        placement="left"
      >
        <Button
          onClick={onToFirst}
          type="text"
          shape="circle"
          style={{ color: 'rgba(255,255,255,.7)', marginBottom: 10 }}
        >
          <VerticalLeftOutlined rotate={-90} />
        </Button>
      </Tooltip>
      <Tooltip
        placement="left"
        title={`上一页 ${pageSize} 行`}
      >
        <Button
          onClick={handleOnPrev}
          type="text"
          shape="circle"
          style={{ color: 'rgba(255,255,255,.7)' }}
        >
          <UpOutlined />
        </Button>
      </Tooltip>
      <span className="pages">
        <span className="curr">{page}</span>
        {' '}
        /
        {' '}
        <span className="total">{total}</span>
      </span>
      {page < total && (
        <>
          <Tooltip
            placement="left"
            title={`下一页 ${pageSize} 行`}
          >
            <Button
              onClick={handleOnNext}
              type="text"
              shape="circle"
              style={{ color: 'rgba(255,255,255,.7)' }}
            >
              <DownOutlined />
            </Button>
          </Tooltip>
          <Tooltip
            title="最后一页"
            placement="left"
          >
            <Button
              onClick={onBackend}
              type="text"
              shape="circle"
              style={{ color: 'rgba(255,255,255,.7)', marginTop: 10 }}
            >
              <VerticalLeftOutlined rotate={90} />
            </Button>
          </Tooltip>
        </>
      )}
    </div>
  )
}

export default LogsPagination
