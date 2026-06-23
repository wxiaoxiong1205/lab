import { formatNumber } from '@/utils'
import { ApiOutlined, DownloadOutlined, HeartOutlined } from '@ant-design/icons'
import classNames from 'classnames'
import dayjs from 'dayjs'
import React from 'react'
import { modelSourceMap } from '../config'
import type { EvaluateResult } from '../config/types'
import '../style/hf-model-item.css'
import IncompatiableInfo from './incompatiable-info'

interface HFModelItemProps {
  title: string
  downloads: number
  likes: number
  task?: string
  updatedAt: string
  active: boolean
  source?: string
  tags?: string[]
  evaluateResult?: EvaluateResult
  isEvaluating?: boolean
}

const HFModelItem: React.FC<HFModelItemProps> = (props) => {
  const { evaluateResult, isEvaluating } = props

  return (
    <div
      className={classNames('hf-model-item', {
        active: props.active,
      })}
    >
      <div className="title">
        <ApiOutlined
          style={{
            color: props.source === modelSourceMap.huggingface_value ? '#ff6b35' : '#5470c6',
            fontSize: '16px',
          }}
        />
        {props.title}
      </div>
      <div className="info">
        <div className="info-item">
          <span>{dayjs(props.updatedAt).format('YYYY-MM-DD')}</span>
          <span className="flex-center">
            <HeartOutlined className="m-r-5" />
            {props.likes}
          </span>
          <span className="flex-center">
            <DownloadOutlined className="m-r-5" />
            {formatNumber(props.downloads)}
          </span>
        </div>
        <IncompatiableInfo
          data={evaluateResult}
          isEvaluating={isEvaluating}
        >
        </IncompatiableInfo>
      </div>
    </div>
  )
}

export default HFModelItem
