import React, { useState } from 'react'
import { Button, Modal } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import ThinkableContent from '../dataset-logs/ThinkableContent'

export interface TruncatedOutputProps {
  content: string
  onCopy: (content: string) => void
}

function hasThinkTags(output: string) {
  return output && (output.includes('<think>') || output.includes('</think>'))
}

export const TruncatedOutput: React.FC<TruncatedOutputProps> = ({
  content,
  onCopy,
}) => {
  const { t } = useTranslation()
  const [isModalVisible, setIsModalVisible] = useState(false)

  if (!content) return <span>-</span>

  const hasThink = hasThinkTags(content)

  const showModal = () => setIsModalVisible(true)
  const handleCancel = () => setIsModalVisible(false)

  return (
    <>
      <div>
        <div className="mb-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {content}
        </div>
        <Button
          type="link"
          size="small"
          onClick={showModal}
          className="p-0"
        >
          {t('common.viewFull')}
        </Button>
      </div>
      <Modal
        title={t('datasetLog.output')}
        open={isModalVisible}
        onCancel={handleCancel}
        footer={[
          <Button
            key="copy"
            icon={<CopyOutlined />}
            onClick={() => onCopy(content)}
          >
            {t('common.copy')}
          </Button>,
          <Button key="close" onClick={handleCancel}>
            {t('common.close')}
          </Button>,
        ]}
        width={800}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
      >
        {hasThink ? (
          <ThinkableContent content={content} />
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {content}
          </div>
        )}
      </Modal>
    </>
  )
}
