import { ExclamationCircleFilled } from '@ant-design/icons'
// import { useIntl } from '@umijs/max';
import {
  Button,
  Checkbox,
  Modal,
  type ModalFuncProps,
  Space,
  message,
} from 'antd'
import { createStyles } from 'antd-style'
import { forwardRef, useImperativeHandle, useState } from 'react'
import styled from 'styled-components'
import { useTransform } from '@/locales'
import useBodyScroll from '@/hooks/use-body-scroll'

const useStyles = createStyles(({ css }) => ({
  'delete-modal-content': css`
    display: flex;
    font-size: var(--font-size-middle);
    .anticon {
      font-size: 20px;
      margin-right: 10px;
      color: var(--ant-color-warning);
    }
    .title {
      display: flex;
      align-items: center;
      font-weight: var(--font-weight-500);
    }
  `,
  'content': css`
    padding-top: 15px;
    padding-left: 30px;
    color: var(--ant-color-text-secondary);
    white-space: pre-line;
    word-break: break-all;
    span {
      color: var(--ant-color-text);
      display: flex;
      margin-top: 8px;
    }
  `,
}))

const CheckboxWrapper = styled.div`
  margin-top: 20px;
  margin-left: 30px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  .check-text {
    font-weight: 700;
    color: var(--ant-color-warning);
  }
`

interface DataOptions {
  content?: string
  selection?: boolean
  name?: string
  okText?: string
  cancelText?: string
  title?: string
  operation: string
  checkConfig?: {
    checkText: string
    defautlChecked: boolean
  }
}

interface Configuration {
  checked: boolean
}

const DeleteModal = forwardRef((props, ref) => {
  // const intl = useIntl();
  const { $t } = useTransform()
  const { styles } = useStyles()
  const { saveScrollHeight, restoreScrollHeight } = useBodyScroll()
  const [visible, setVisible] = useState(false)
  const [configuration, setConfiguration] = useState<Configuration>({
    checked: false,
  })
  const [config, setConfig] = useState<ModalFuncProps & DataOptions>({} as any)

  const show = (data: ModalFuncProps & DataOptions) => {
    saveScrollHeight()
    setConfig(data)
    setConfiguration({
      checked: data.checkConfig?.defautlChecked || false,
    })
    setVisible(true)
  }

  const hide = () => {
    setVisible(false)
    restoreScrollHeight()
  }

  const handleCancel = () => {
    setVisible(false)
    config.onCancel?.()
    restoreScrollHeight()
  }

  const handleOk = async () => {
    try {
      const res = await config.onOk?.()
      const isArray = Array.isArray(res)
      if (isArray) {
        const allSuccess = res.every(
          (item: any) => item?.status === 'fulfilled',
        )
        if (allSuccess) {
          message.success($t('操作成功'))
        }
      }
      else {
        message.success($t('操作成功'))
      }
    }
    catch (error) {
      // Handle error if needed
    }
    finally {
      setVisible(false)
      restoreScrollHeight()
    }
  }

  useImperativeHandle(ref, () => ({
    show,
    hide,
    configuration,
  }))

  return (
    <Modal
      style={{
        top: '20%',
      }}
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      destroyOnClose={false}
      closeIcon={false}
      maskClosable={false}
      keyboard={false}
      width={460}
      styles={{
        footer: {
          marginTop: '20px',
        },
      }}
      footer={(
        <Space size={20}>
          <Button onClick={handleCancel} size="middle">
            {config.cancelText
              ? config.cancelText
              : $t('取消')}
          </Button>
          <Button type="primary" onClick={handleOk} size="middle">
            {config.okText
              ? config.okText
              : $t('确认删除')}
          </Button>
        </Space>
      )}
    >
      <div className={styles['delete-modal-content']}>
        <span className="title">
          <ExclamationCircleFilled style={{ color: '#FAAD14' }} />
          <span>
            {config.title
              ? config.title
              : $t('确认删除')}
          </span>
        </span>
      </div>
      <div
        className={styles.content}
        dangerouslySetInnerHTML={{
          __html: $t(config.content as any) || config.content || '',
        }}
      >
      </div>
      {config.checkConfig && (
        <CheckboxWrapper>
          <Checkbox
            checked={configuration.checked}
            onChange={(e) =>
              setConfiguration({
                checked: e.target.checked,
              })}
          >
            <span className="check-text">
              {config.checkConfig?.checkText}
            </span>
          </Checkbox>
        </CheckboxWrapper>
      )}
    </Modal>
  )
})

export default DeleteModal
