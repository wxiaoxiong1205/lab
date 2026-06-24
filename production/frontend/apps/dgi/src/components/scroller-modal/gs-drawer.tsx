import { Drawer, type DrawerProps } from 'antd'
import { useEscHint } from '@/hooks/use-esc-hint'

const ScrollerModal = (props: DrawerProps) => {
  const { EscHint } = useEscHint({
    enabled: !props.keyboard && props.open,
  })

  return (
    <Drawer {...props}>
      {props.children}
      {EscHint}
    </Drawer>
  )
}

export default ScrollerModal
