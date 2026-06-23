import React, { useEffect, useState } from 'react'
import { Button, Col, Form, Input, Modal, Row, Space, Spin, Switch, message } from 'antd'
import { getPasswordStrengthColor, getPasswordStrengthText, validatePassword } from '../utils/passwordValidator'
import useI18n from '../hooks/useI18n'
import type { SSHConfig } from '../services/kubernetesService'
import { generateSSHKey, getSSHConfig, updateSSHConfig } from '../services/kubernetesService'

interface SSHConfigModalProps {
  visible: boolean
  onClose: () => void
  sshConfig: SSHConfig
  isLoading: boolean
  sshProjectId: number
}
const SSHConfigModal: React.FC<SSHConfigModalProps> = ({ sshConfig, visible, onClose, isLoading, sshProjectId }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [sshEnabled, setSshEnabled] = useState(true)
  const [isflag, setIsflag] = useState(false)
  const [isConfirmflag, setIsConfirmflag] = useState(false)
  const [isUsernamePasswordEditing, setIsUsernamePasswordEditing] = useState(true)
  const [form] = Form.useForm()
  const { t } = useI18n()
  useEffect(() => {
    if (sshConfig && form) {
      setTimeout(() => {
        form.setFieldsValue(sshConfig)
        setSshEnabled(sshConfig.is_ssh)
        setIsEditing(sshConfig.is_ssh)
        setIsUsernamePasswordEditing(sshConfig.is_ssh)
      }, 0)
    }
  }, [sshConfig, form])
  const handleClose = () => {
    setIsEditing(false)
    form.resetFields()
    onClose()
  }
  // 自定义验证函数
  const validateUsername = (_: unknown, value: string) => {
    if (!value) {
      return Promise.reject(new Error(t('user.usernameRequired')))
    }
    // 只允许英文字母
    if (!/^[a-zA-Z]+$/.test(value)) {
      return Promise.reject(new Error(t('user.usernameEnglishOnly')))
    }
    return Promise.resolve()
  }
  const handleUsernamePasswordConfig = () => {
    setIsEditing(true)
  }
  const validatePasswordStrength = (_: unknown, value: string) => {
    // 新增用户时密码不能为空
    if (!value) {
      return Promise.reject(new Error(t('user.passwordRequired')))
    }
    const validation = validatePassword(value)
    if (!validation.isValid) {
      return Promise.reject(new Error(validation.errors[0]))
    }
    return Promise.resolve()
  }
  const handleSshEnabledChange = (checked: boolean) => {
    if (checked === false) {
      // 如果当前SSH是开启状态，关闭时需要确认提示
      if (sshEnabled) {
        Modal.confirm({
          title: t('确认关闭SSH配置'),
          content: t('关闭后，SSH功能将被禁用，用户名密码和SSH Key都将失效'),
          okText: t('确定'),
          cancelText: t('取消'),
          onOk: () => {
            updateSSHConfig(Number(sshProjectId), {
              is_ssh: checked,
            })
            form.setFieldsValue({
              ssh_username: '',
              ssh_password: '',
              ssh_key: '',
            })
            setSshEnabled(checked)
            setIsEditing(false)
            sshConfig.ssh_key = ''
          },
        })
      }
      else {
        // 如果本来就是关闭状态，直接更新
        updateSSHConfig(Number(sshProjectId), {
          is_ssh: checked,
        })
        setSshEnabled(checked)
      }
    }
    else {
      // 开启SSH时直接更新
      setSshEnabled(checked)
    }
  }
  const handleGenerateSSHKey = async (status?: 'generate' | 'reset') => {
    try {
      setIsflag(true)
      // 调用 generateSSHKey 并获取完整响应
      const response = await generateSSHKey(Number(sshProjectId))
      // 从响应头中获取文件名
      const contentDisposition = response.headers['content-disposition']
      let filename = 'ssh-key.pem' // 默认文件名
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/)
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1]
        }
      }
      // 从响应中获取 SSH Key 内容
      const sshKeyContent = response.headers['x-key-fingerprint'] // 假设响应数据就是 SSH Key
      // 创建 Blob 对象用于下载
      const blob = new Blob([response.data], { type: 'application/x-pem-file' })
      // 创建下载链接
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename // 使用从响应头获取的文件名
      // 触发下载
      document.body.appendChild(link)
      link.click()
      // 清理
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      // 同时更新表单中的 SSH Key 值
      if (status === 'generate') {
        setIsEditing(true)
      }
      form.setFieldsValue({
        ssh_key: sshKeyContent,
      })
      if (status === 'generate') {
        message.success(t('SSH Key 生成并下载成功'))
        sshConfig.ssh_key = sshKeyContent
      }
      else {
        message.success(t('SSH Key 重置成功'))
      }
    }
    catch (error) {
      if (status === 'generate') {
        message.error(t('SSH Key 生成失败'))
      }
      else {
        message.error(t('SSH Key 重置失败'))
      }
    }
    finally {
      setIsflag(false)
    }
  }
  const handleConfirm = (values) => {
    try {
      setIsConfirmflag(true)
      updateSSHConfig(Number(sshProjectId), {
        is_ssh: true,
        ssh_username: values.ssh_username,
        ssh_password: values.ssh_password,
      })
      message.success(t('ssh配置已保存'))
      setIsUsernamePasswordEditing(true)
    }
    catch (error) {
      message.error(t('ssh配置保存失败'))
    }
    finally {
      setIsConfirmflag(false)
    }
  }
  const renderInitialState = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-gray-700">{t('用户名/密码')}</span>
        <Button type="primary" onClick={handleUsernamePasswordConfig} className="bg-blue-500 hover:bg-blue-600" disabled={!sshEnabled}>
          {t('点击设置')}
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gray-700">{t('SSH Key')}</span>
        <Button type="primary" onClick={() => handleGenerateSSHKey('generate')} className="bg-blue-500 hover:bg-blue-600" disabled={!sshEnabled} loading={isflag}>
          {t('生成SSH Key')}
        </Button>
      </div>
    </div>
  )
  const renderEditingState = () => (
    <Form form={form} layout="vertical" className="space-y-4" onFinish={handleConfirm}>
      <Row gutter={16}>
        <Col span={24}>
          <Form.Item
            name="ssh_username"
            label={t('用户名')}
            required
            rules={[
              { validator: validateUsername },
            ]}
          >
            <Input placeholder={t('请输入用户名')} disabled={isUsernamePasswordEditing} />
          </Form.Item>
        </Col>
        <Col span={16}>
          <Form.Item
            name="ssh_password"
            label={t('密码')}
            required
            rules={[
              { validator: validatePasswordStrength },
            ]}
          >
            <Input.Password placeholder={t('请输入密码')} disabled={isUsernamePasswordEditing} />
          </Form.Item>
        </Col>
        <Col span={8} className="flex items-center">
          {isUsernamePasswordEditing ? (
            <Button
              type="primary"
              onClick={() => {
                form.setFieldsValue({
                  ssh_password: '',
                })
                setIsUsernamePasswordEditing(false)
              }}
              className="bg-blue-500 hover:bg-blue-600"
            >
              {t('编辑')}
            </Button>
          ) : (
            <Space size={16}>
              <Button type="primary" htmlType="submit" className="bg-blue-500 hover:bg-blue-600" loading={isConfirmflag}>
                {t('确定')}
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  setIsUsernamePasswordEditing(true)
                  form.setFieldsValue({
                    ssh_password: sshConfig?.ssh_password,
                  })
                }}
                className="bg-blue-500 hover:bg-blue-600"
              >
                {t('取消')}
              </Button>
            </Space>
          )}
        </Col>
        <Col span={16}>
          <Form.Item name="ssh_key" label="SSH Key">
            <Input.TextArea readOnly rows={1} autoSize className="flex-1" />
          </Form.Item>
        </Col>
        <Col span={8} className="flex items-center">
          <Button
            type="primary"
            onClick={() => {
              if (sshConfig?.ssh_key !== '' && sshConfig?.ssh_key !== null) {
              // 重置SSH Key时显示确认提示
                Modal.confirm({
                  title: t('确认重置SSH Key'),
                  content: t('重置后，此SSH Key将不再支持作为登录凭证，请谨慎操作'),
                  okText: t('确定'),
                  cancelText: t('取消'),
                  onOk: () => handleGenerateSSHKey('reset'),
                })
              }
              else {
              // 生成SSH Key时直接执行
                handleGenerateSSHKey('generate')
              }
            }}
            className="bg-blue-500 hover:bg-blue-600"
            loading={isflag}
          >
            {sshConfig?.ssh_key !== '' && sshConfig?.ssh_key !== null ? t('重置 SSH Key') : t('生成 SSH Key')}
          </Button>
        </Col>
      </Row>
    </Form>
  )
  return (
    <Modal
      className="ssh-config-modal rounded-[8px]"
      title={(
        <div className="flex items-center">
          <span className="text-lg font-semibold mr-7">{t('ssh配置')}</span>
          <div className="flex items-center space-x-2">
            <Switch checked={sshEnabled} onChange={handleSshEnabledChange} className="bg-blue-500" />
          </div>
        </div>
      )}
      open={visible}
      onCancel={handleClose}
      width={500}
      footer={null}
    >

      <div className="py-4">
        {isLoading ? <Spin spinning={isLoading} className="w-full h-full" />
          : isEditing ? renderEditingState() : renderInitialState()}
      </div>
    </Modal>
  )
}
export default SSHConfigModal
