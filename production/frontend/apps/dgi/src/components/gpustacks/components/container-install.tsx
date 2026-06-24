import { Radio } from 'antd'
import React from 'react'
import { addWorkerGuide, containerInstallOptions } from '../config'
import EditorWrap from './editor-wrap'
import { GPUStackVersionAtom } from '@/stores/user'
import { getAtomStorage } from '@/stores/utils'
import HighlightCode from '@/components/highlight-code'
// import { useIntl } from '@umijs/max';
import './styles/installation.css'

type ViewModalProps = {
  token: string
}

const npuOptions = [
  { label: '910B', value: 'npu' },
  { label: '310P', value: 'npu310p' },
]

const AddWorker: React.FC<ViewModalProps> = (props) => {
  // const intl = useIntl();

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const [activeKey, setActiveKey] = React.useState('cuda')
  const [npuKey, setNpuKey] = React.useState('npu')
  const versionInfo = getAtomStorage(GPUStackVersionAtom)

  const code = React.useMemo(() => {
    let version = versionInfo?.version
    if (!version || !versionInfo.isProduction) {
      version = 'main'
    }

    let commandCode = addWorkerGuide[activeKey]

    if (npuKey === 'npu310p' && activeKey === 'npu') {
      commandCode = addWorkerGuide[npuKey]
    }

    const tag = activeKey === 'cuda' ? version : `${version}-${activeKey}`

    return commandCode?.registerWorker({
      server: origin,
      tag,
      token: '${token}',
      workerip: '${workerip}',
    })
  }, [versionInfo, activeKey, props.token, npuKey])

  const handleOnChange = (value: string | number) => {
    setNpuKey(value as string)
  }

  return (
    <div className="container-install">
      <ul className="notes">
        <li>
          {/* {intl.formatMessage(
            { id: 'resources.worker.current.version' },
            { version: versionInfo.version }
          )} */}
          当前版本:
          {' '}
          {versionInfo.version}
        </li>
        <li>
          <span
            dangerouslySetInnerHTML={{
              __html: /* intl.formatMessage({
                id: 'resources.worker.driver.install'
              }) */ '请确保已安装相应的驱动程序',
            }}
          >
          </span>
        </li>
      </ul>
      <h3 className="font-size-14 font-600">
        1.
        {' '}
        <span
          dangerouslySetInnerHTML={{
            __html: /* intl.formatMessage({ id: 'resources.worker.add.step1' }) */ '获取 Token',
          }}
        >
        </span>
      </h3>
      <HighlightCode
        code={addWorkerGuide.container.getToken}
        theme="dark"
        lang="bash"
      >
      </HighlightCode>
      <h3 className="m-t-10 font-size-14 font-600">
        2.
        {' '}
        {/* intl.formatMessage({ id: 'resources.worker.add.step2' }) */ '选择安装类型'}
        {' '}
        <span
          className="font-size-12"
          style={{ color: 'var(--ant-color-text-tertiary)' }}
          dangerouslySetInnerHTML={{
            __html: /* `${intl.formatMessage({
              id: 'resources.worker.add.step2.tips'
            })}` */ '请根据您的硬件环境选择合适的安装类型',
          }}
        >
        </span>
      </h3>
      <div className="m-b-16">
        <Radio.Group
          block
          options={containerInstallOptions}
          defaultValue={activeKey}
          value={activeKey}
          optionType="button"
          buttonStyle="solid"
          onChange={(e) => setActiveKey(e.target.value)}
          size="small"
        />
      </div>
      {activeKey === 'npu' && (
        <div
          className="m-b-8 text-tertiary"
          dangerouslySetInnerHTML={{
            __html: /* intl.formatMessage({ id: 'resources.worker.cann.tips' }) */ '请确保已安装 CANN 软件包',
          }}
        >
        </div>
      )}
      {activeKey === 'npu' ? (
        <EditorWrap
          headerHeight={32}
          copyText={code}
          langOptions={npuOptions}
          defaultValue="npu"
          showHeader
          onChangeLang={handleOnChange}
          styles={{
            wrapper: {
              backgroundColor: 'var(--color-editor-dark)',
            },
          }}
        >
          <HighlightCode
            theme="dark"
            code={code.replace(/\\/g, '')}
            copyValue={code}
            lang="bash"
            copyable={false}
          >
          </HighlightCode>
        </EditorWrap>
      ) : (
        <HighlightCode
          theme="dark"
          code={code.replace(/\\/g, '')}
          copyValue={code}
          lang="bash"
        >
        </HighlightCode>
      )}
      <h3 className="m-b-0 m-t-10 font-size-14 font-600">
        3.
        {' '}
        {/* intl.formatMessage({ id: 'resources.worker.add.step3' }) */ '等待安装完成'}
      </h3>
    </div>
  )
}

export default React.memo(AddWorker)
