/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-09-22 17:11:41
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-09-24 17:26:32
 * @FilePath: \deepexi-lab-web\src\pages\CreateVersionDemo.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import React, { useState } from 'react'
import { Button, Card, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import CreateVersionModal from './modalCreateVersion'

interface CreateVersionFormData {
  version: string
  description: string
  taskVersion: string
  checkpoint: string
}
const CreateVersionDemo: React.FC = () => {
  const [modalVisible, setModalVisible] = useState(false)
  const [submittedData, setSubmittedData] = useState<CreateVersionFormData | null>(null)
  const handleOpenModal = () => {
    setModalVisible(true)
  }
  const handleCloseModal = () => {
    setModalVisible(false)
  }
  const handleConfirm = (values: CreateVersionFormData) => {
    setSubmittedData(values)
    setModalVisible(false)
  }
  return (
    <div className="p-[24px] min-h-[100vh]" style={{ background: '#f5f5f5' }}>
      <Card className="max-w-[800px] m-[0_auto]" title="新增版本模态框演示">
        <Space direction="vertical" size="large" className="w-full">
          <div>
            <p>点击下方按钮打开"新增版本"模态框：</p>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenModal} size="large">
              新增版本
            </Button>
          </div>

          {submittedData && (
            <Card title="提交的数据" size="small">
              <pre
                className="p-[12px] rounded-[6px] text-[14px] overflow-auto"
                style={{
                  background: '#f6f8fa',
                }}
              >
                {JSON.stringify(submittedData, null, 2)}
              </pre>
            </Card>
          )}

          <div
            className="p-[16px] rounded-[6px]"
            style={{
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
            }}
          >
            <h4 className="m-[0_0_8px_0]" style={{ color: '#1890ff' }}>功能说明：</h4>
            <ul className="m-0 pl-5">
              <li>模型版本：显示当前版本号（只读）</li>
              <li>版本描述：多行文本输入，必填，最多500字符</li>
              <li>模型任务版本：下拉选择，必填</li>
              <li>Checkpoint：下拉选择，必填</li>
              <li>表单验证：所有必填字段都有验证</li>
              <li>响应式设计：适配不同屏幕尺寸</li>
            </ul>
          </div>
        </Space>
      </Card>
      {/*
        <CreateVersionModal
          visible={modalVisible}
          onCancel={handleCloseModal}
          onConfirm={handleConfirm}
          currentVersion="V2"
        /> */}
    </div>
  )
}
export default CreateVersionDemo
