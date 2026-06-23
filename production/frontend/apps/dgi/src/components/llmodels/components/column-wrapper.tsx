import React from 'react'
import useOverlayScroller from '@/hooks/use-overlay-scroller'
import useClientOnly from '@/hooks/use-client-only'
import '../style/column-wrapper.css'

const ColumnWrapper: React.FC<any> = ({
  children,
  footer,
  maxHeight,
  paddingBottom = 50,
}) => {
  const isClient = useClientOnly()
  const scroller = React.useRef<any>(null)
  const { initialize } = useOverlayScroller({
    options: {
      scrollbars: {
        autoHide: 'move',
      },
    },
  })

  React.useEffect(() => {
    if (isClient && scroller.current) {
      initialize(scroller.current)
    }
  }, [isClient])

  return (
    <>
      {footer ? (
        <div className="column-wrapper-footer">
          <div className="column-wrapper" ref={scroller} style={{ maxHeight }}>
            <div
              style={{
                paddingBottom,
              }}
            >
              {children}
            </div>
          </div>
          <div className="footer">{footer}</div>
        </div>
      ) : (
        <div className="column-wrapper" ref={scroller} style={{ maxHeight }}>
          <div>{children}</div>
        </div>
      )}
    </>
  )
}

export default ColumnWrapper
