import { BulbOutlined } from '@ant-design/icons'
import { Button, Tag } from 'antd'
import _ from 'lodash'
import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import styled from 'styled-components'
import { LinkOutlined } from '@ant-design/icons'
import { modelCategoriesMap } from '../config'
import ScrollerModal from '@/components/scroller-modal'
import CopyButton from '@/components/copy-button'
import AutoTooltip from '@/components/auto-tooltip'

const ApiAccessInfoWrapper = styled.div`
  display: grid;
  padding-left: 20px;
  grid-template-columns: max-content 1fr max-content;
  gap: 12px 0px;
  justify-items: start;
  align-items: center;
  .label {
    font-weight: 600;
  }
  .value {
    margin-left: 20px;
    display: flex;
    align-items: center;
    color: var(--ant-color-text-secondary);
  }
  .copy-btn {
    margin-left: 8px;
  }
`

const Tips = styled.div`
  color: var(--ant-color-text-secondary);
  font-size: var(--font-size-small);
  .tips {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  dd {
    margin-bottom: 16px;
  }
`

const APITAG = styled(Tag)`
  border-radius: 12px;
  margin: 0;
  margin-left: 8px;
`

const CreateButton = styled(Button)`
  padding-inline: 0;
`

interface ApiAccessInfoProps {
  open: boolean
  data: any
  onClose: () => void
}

const ApiAccessInfo = ({ open, data, onClose }: ApiAccessInfoProps) => {
  const navigate = useNavigate()

  const endPoint = `${typeof window !== 'undefined' ? window.location.origin : ''}/v1`

  const isRanker = useMemo(() => {
    return _.includes(data.categories, modelCategoriesMap.reranker)
  }, [data])

  const handleClose = () => {
    onClose()
  }
  return (
    <ScrollerModal
      open={open}
      style={{
        top: '20%',
      }}
      title="API访问信息"
      width={550}
      destroyOnClose
      closable
      maskClosable={false}
      onOk={handleClose}
      onCancel={handleClose}
      styles={{
        content: {
          padding: '0 0 16px 0',
        },
        header: {
          padding: '24px 20px 0',
          paddingBottom: '0',
        },
        body: {
          padding: '16px 24px 32px',
        },
        footer: {
          padding: '16px 24px',
          margin: '0',
        },
      }}
      footer={null}
    >
      <Tips>
        <dl className="tips">
          <dt>
            <BulbOutlined />
          </dt>
          <dd>
            您可以使用以下信息通过API访问该模型。请确保您已创建API密钥。
          </dd>
        </dl>
      </Tips>
      <ApiAccessInfoWrapper>
        <span className="label">
          接入点
        </span>
        <span className="value">
          <AutoTooltip ghost maxWidth={180}>
            {endPoint}
          </AutoTooltip>
          <APITAG color="geekblue">
            {isRanker ? 'Jina 兼容' : 'OpenAI 兼容'}
          </APITAG>
        </span>
        <span className="copy-btn">
          <CopyButton text={endPoint} type="link" size="small"></CopyButton>
        </span>
        <span className="label">
          模型名称
        </span>
        <span className="value">
          <AutoTooltip ghost maxWidth={300}>
            {data.name}
          </AutoTooltip>
        </span>
        <span className="copy-btn">
          <CopyButton text={data.name} type="link" size="small"></CopyButton>
        </span>
        {/* <span className="label">
          API密钥
        </span>
        <span className="value">
          <CreateButton
            type="link"
            size="small"
            onClick={() => navigate('/access-key')}
          >
            前往创建
            <LinkOutlined
              className="font-size-14"
            />
          </CreateButton>
        </span> */}
      </ApiAccessInfoWrapper>
    </ScrollerModal>
  )
}
export default ApiAccessInfo
