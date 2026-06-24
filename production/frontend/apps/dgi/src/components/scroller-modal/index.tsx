import { Modal, type ModalProps } from 'antd'
import React from 'react'
import useBodyScroll from '@/hooks/use-body-scroll'

const ScrollerModal = (props: ModalProps) => {
  const { saveScrollHeight, restoreScrollHeight } = useBodyScroll()

  React.useEffect(() => {
    if (props.open) {
      saveScrollHeight()
    }
    else {
      restoreScrollHeight()
    }
  }, [props.open])

  return <Modal {...props} />
}

export default ScrollerModal
