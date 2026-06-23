import {
  AppleOutlined,
  LinuxOutlined,
  WindowsOutlined,
} from '@ant-design/icons'
// import { useIntl } from '@umijs/max';
import type { TabsProps } from 'antd'
import { Tabs } from 'antd'
import React from 'react'
import ScrollerModal from './scroller-modal'
import MacOS from './add-worker-macos'
import ContainerInstall from './container-install'

type ViewModalProps = {
  open: boolean
  onCancel: () => void
}

const AddWorker: React.FC<ViewModalProps> = (props) => {
  const { open, onCancel } = props || {}
  // const intl = useIntl();
  const [token, setToken] = React.useState('')
  const [activeKey, setActiveKey] = React.useState('container')

  const items: TabsProps['items'] = [
    {
      key: 'container',
      label: 'Linux',
      icon: <LinuxOutlined />,
      children: <ContainerInstall token={token} />,
    },
    {
      key: 'macos',
      label: 'macOS',
      icon: <AppleOutlined />,
      children: (
        <MacOS
          token={token}
          platform={{
            os: 'macOS',
            supportVersions: 'resource.register.maos.support',
          }}
        />
      ),
    },
    {
      key: 'windows',
      label: 'Windows',
      icon: <WindowsOutlined />,
      children: (
        <MacOS
          token={token}
          platform={{
            os: 'Windows',
            supportVersions: 'resource.register.windows.support',
          }}
        />
      ),
    },
  ]

  return (
    <ScrollerModal
      title="resources.button.create"
      open={open}
      centered={false}
      onCancel={onCancel}
      destroyOnClose
      closeIcon
      maskClosable={false}
      keyboard={false}
      width={700}
      style={{
        top: 100,
      }}
      styles={{
        body: {
          minHeight: 450,
        },
      }}
      footer={null}
    >
      <Tabs
        size="small"
        items={items}
        activeKey={activeKey}
        type="card"
        onChange={(key) => setActiveKey(key)}
      >
      </Tabs>
    </ScrollerModal>
  )
}

export default AddWorker
