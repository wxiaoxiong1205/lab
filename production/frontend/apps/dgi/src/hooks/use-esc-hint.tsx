import { createStyles } from 'antd-style'
import { throttle } from 'lodash'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import HotKeys from '@/components/gpustacks/config/hotkeys'

const useStyles = createStyles(({ css, token }) => ({
  hintOverlay: css`
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--color-esc-hint-bg);
    color: ${token.colorTextLightSolid};
    padding: 16px 24px;
    border-radius: 4px;
    z-index: 2000;
    font-size: 14px;
    pointer-events: none;
    animation: fadeInOut 2s ease-in-out;
    @keyframes fadeInOut {
      0% {
        opacity: 0;
      }
      10% {
        opacity: 1;
      }
      90% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
  `,
}))

export function useEscHint(options?: {
  enabled?: boolean
  message?: string
  throttleDelay?: number
}) {
  const { enabled = true, message, throttleDelay = 3000 } = options || {}
  const { styles } = useStyles()
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<any>(null)
  const isHintActiveRef = useRef(false)

  const showHintThrottled = useMemo(
    () =>
      throttle(
        () => {
          if (isHintActiveRef.current) return

          isHintActiveRef.current = true

          setVisible(true)

          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
          }

          timeoutRef.current = setTimeout(() => {
            setVisible(false)
            isHintActiveRef.current = false
          }, 2000)
        },
        throttleDelay,
        {
          leading: true,
          trailing: false,
        },
      ),
    [throttleDelay],
  )

  useHotkeys(
    HotKeys.ESC,
    () => {
      if (!enabled) return
      showHintThrottled()
    },
    {
      enabled,
    },
  )

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      showHintThrottled.cancel()
    }
  }, [showHintThrottled])

  const EscHint = visible ? (
    <div className={styles.hintOverlay}>
      {message || '按ESC键退出'}
    </div>
  ) : null

  return { EscHint }
}
