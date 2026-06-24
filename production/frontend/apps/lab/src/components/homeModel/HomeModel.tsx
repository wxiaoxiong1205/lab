import React, { useState } from 'react'
import { Checkbox, Modal } from 'antd'
import type { CheckboxProps } from 'antd'
import welcomeBackground from '@/assets/Group 3.png'

export const HOME_MODEL_SKIP_STORAGE_KEY = 'lab-home-model-skip'

export const shouldSkipHomeModel = () => {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(HOME_MODEL_SKIP_STORAGE_KEY) === 'true'
}

const persistSkipHomeModel = (value: boolean) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(HOME_MODEL_SKIP_STORAGE_KEY, String(value))
}

interface HomeModelProps {
  open: boolean
  onClose: () => void
}

const HomeModel: React.FC<HomeModelProps> = ({
  open,
  onClose,
}) => {
  const [skipNextTime, setSkipNextTime] = useState(() => shouldSkipHomeModel())

  const handleSkipChange: NonNullable<CheckboxProps['onChange']> = (event) => {
    const checked = event.target.checked
    setSkipNextTime(checked)
    persistSkipHomeModel(checked)
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={870}
      height={739}
      centered
      closable
      maskClosable
      destroyOnClose={false}
      className="[&_.ant-modal-content]:!px-[20px] [&_.ant-modal-content]:!pt-[20px] [&_.ant-modal-content]:!pb-[76px] [&_.ant-modal-body]:!p-0"
    >
      <div className="bg-white">
        <div className="text-center">
          <p className="text-foreground-primary text-[24px] font-semibold leading-8 mb-[11px] mt-[9px]">
            欢迎使用DeepexiLab模型开发平台
          </p>
          <p className="text-foreground-muted text-[14px] font-normal leading-5 mb-[20px]">
            从数据准备到模型评估，大模型全生命周期管理
          </p>
        </div>
        <img
          src={welcomeBackground}
          alt=""
          className="block h-[550px] w-[830px] object-cover"
        />
        <div>
          <div className="flex min-h-8 items-center">
            <Checkbox checked={skipNextTime} onChange={handleSkipChange}>
              下次启动不再弹出
            </Checkbox>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default HomeModel
