import React from 'react'
import { Input, Modal } from 'antd'
import AnnotationServiceConfigModal, { type MachineAnnotationConfig } from './AnnotationServiceConfigModal'

interface DetailModalsProps {
  configVisible: boolean
  addLabelVisible: boolean
  creatingLabel: boolean
  newLabelName: string
  taskTemplateType?: string
  labelModalTitle?: string
  labelModalOkText?: string
  taskId?: number
  initialConfig?: MachineAnnotationConfig | null
  onCloseConfig: () => void
  onConfigConfirm: (config: MachineAnnotationConfig) => void
  onCloseAddLabel: () => void
  onNewLabelNameChange: (value: string) => void
  onCreateLabel: () => void
}

const DetailModals: React.FC<DetailModalsProps> = ({
  configVisible,
  addLabelVisible,
  creatingLabel,
  newLabelName,
  taskTemplateType,
  labelModalTitle = '新增标签',
  labelModalOkText = '确定',
  taskId,
  initialConfig,
  onCloseConfig,
  onConfigConfirm,
  onCloseAddLabel,
  onNewLabelNameChange,
  onCreateLabel,
}) => {
  return (
    <>
      <AnnotationServiceConfigModal
        visible={configVisible}
        taskId={taskId}
        taskTemplateType={taskTemplateType}
        initialConfig={initialConfig}
        onCancel={onCloseConfig}
        onConfirm={onConfigConfirm}
      />

      <Modal
        title={labelModalTitle}
        open={addLabelVisible}
        confirmLoading={creatingLabel}
        onCancel={onCloseAddLabel}
        onOk={onCreateLabel}
        okText={labelModalOkText}
        cancelText="取消"
      >
        <Input
          placeholder="请输入标签名，支持英文逗号分隔批量导入"
          value={newLabelName}
          maxLength={50}
          onChange={(event) => onNewLabelNameChange(event.target.value)}
          onPressEnter={() => {
            void onCreateLabel()
          }}
        />
      </Modal>
    </>
  )
}

export default DetailModals
