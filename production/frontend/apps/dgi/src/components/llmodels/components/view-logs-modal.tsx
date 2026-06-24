import { Modal } from 'antd'
import React, { useCallback, useEffect, useState } from 'react'
import { MODELS_API } from '../apis'
import { InstanceRealtimeLogStatus } from '../config'
import useSetChunkRequest from '@/hooks/use-chunk-request'
import LogsViewer from '@/components/logs-viewer/virtual-log-list'

type ViewModalProps = {
  open: boolean
  url: string
  id?: number | string
  modelId?: number | string
  tail?: number
  onCancel: () => void
}

const ViewLogsModal: React.FC<ViewModalProps> = (props) => {
  const { setChunkRequest } = useSetChunkRequest()
  const { open, url, onCancel, tail } = props || {}
  const [enableScorllLoad, setEnableScorllLoad] = useState(true)
  const logsViewerRef = React.useRef<any>(null)
  const requestRef = React.useRef<any>(null)
  const contentRef = React.useRef<any>(null)

  const handleCancel = useCallback(() => {
    logsViewerRef.current?.abort()
    onCancel()
  }, [onCancel])

  const updateHandler = (list: any) => {
    const data = list?.find((item: any) => item.data?.id === props.id)
    // state in InstanceRealtimeLogStatus will not enable scorll load, because it is in the trasisition state
    if (data) {
      setEnableScorllLoad(
        () => !InstanceRealtimeLogStatus.includes(data?.data?.state),
      )
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: any) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        if (contentRef.current && typeof document !== 'undefined') {
          const range = document.createRange()
          range.selectNodeContents(contentRef.current)
          if (typeof window !== 'undefined') {
            const selection = window.getSelection()
            selection?.removeAllRanges()
            selection?.addRange(range)
          }
        }
      }
    }

    if (open && typeof document !== 'undefined') {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [open])

  useEffect(() => {
    if (!props.id) return
    if (open) {
      requestRef.current?.current?.cancel?.()
      requestRef.current = setChunkRequest({
        url: `${MODELS_API}/${props.modelId}/instances`,
        handler: updateHandler,
      })
    }

    return () => {
      logsViewerRef.current?.abort()
      requestRef.current?.current?.cancel?.()
    }
  }, [props.id, open])

  return (
    <Modal
      title={(
        <span className="flex flex-center">
          <span style={{ fontWeight: 'var(--font-weight-bold)' }}>
            查看日志
          </span>
        </span>
      )}
      zIndex={3000}
      open={open}
      centered
      onCancel={handleCancel}
      destroyOnClose
      closeIcon
      maskClosable={false}
      keyboard
      styles={{
        content: {
          borderRadius: 0,
        },
      }}
      width="100%"
      footer={null}
    >
      <div className="viewer-wrapper" ref={contentRef}>
        <LogsViewer
          ref={logsViewerRef}
          diffHeight={78}
          url={url}
          tail={tail}
          enableScorllLoad={enableScorllLoad}
          params={{
            follow: true,
          }}
        >
        </LogsViewer>
      </div>
    </Modal>
  )
}

export default ViewLogsModal
