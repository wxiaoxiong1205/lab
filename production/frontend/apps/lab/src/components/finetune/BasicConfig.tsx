import React, { useEffect } from 'react'
import { Card, Col, DatePicker, Form, Input, Row, Space, Switch, TimePicker, Typography } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { ModelTypeMapping } from '@/utils/EnumMaping'

const { TextArea } = Input

interface BasicConfigProps {
  form: any
  datainfo: any
  taskName: string
}

const BasicConfig: React.FC<BasicConfigProps> = ({ form, datainfo, taskName }) => {
  const scheduleEnabled = Form.useWatch('schedule_enabled', form) ?? false

  // 编辑时从 datainfo 回填定时配置（父组件 setFieldsValue 后此处同步展示）
  useEffect(() => {
    if (taskName && datainfo?.schedule_at) {
      const scheduleDateTime = dayjs(datainfo.schedule_at)
      form.setFieldsValue({
        schedule_enabled: true,
        schedule_date: scheduleDateTime,
        schedule_time: scheduleDateTime,
      })
    }
  }, [taskName, datainfo?.schedule_at, form])

  return (
    <Card
      title={(
        <div className="flex items-center">
          <SettingOutlined className="mr-2 text-[var(--lab-color-brand-primary)]" />
          基础配置
        </div>
      )}
      className="mb-4 rounded-[8px]"
      size="small"
    >
      {!taskName ? (
        <>
          <Form.Item
            name="name"
            label="任务名称"
            rules={[
              { required: true, message: '请输入任务名称' },
              {
                pattern: /^[\u4E00-\u9FA5a-zA-Z0-9_\-.]{1,50}$/,
                message: '名称只能包含中英文、数字、中划线(-)、下划线(_)，最多50字符',
              },
            ]}
          >
            <Input placeholder="例如：Qwen2.5-7B-LoRA-v1" />
          </Form.Item>

          <Form.Item
            name="version"
            label="任务版本"
            layout="horizontal"
            initialValue="V1"
          >
            <Typography.Text>V1</Typography.Text>
          </Form.Item>

          <Form.Item label="任务定时配置">
            <Space direction="vertical" className="w-full">
              <Form.Item name="schedule_enabled" valuePropName="checked" className="mb-0">
                <Switch
                  checked={scheduleEnabled}
                  onChange={(checked) => {
                    form.setFieldsValue({ schedule_enabled: checked })
                    if (!checked) {
                      form.setFieldsValue({ schedule_date: undefined, schedule_time: undefined })
                    }
                  }}
                />
              </Form.Item>
              {scheduleEnabled && (
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="schedule_date"
                      label="执行时间"
                      rules={scheduleEnabled ? [{ required: true, message: '请选择日期' }] : []}
                    >
                      <DatePicker
                        className="w-full"
                        placeholder="请选择日期"
                        format="YYYY-MM-DD"
                        disabledDate={(current) => current && current < dayjs().startOf('day')}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="schedule_time"
                      label=" "
                      rules={scheduleEnabled ? [{ required: true, message: '请选择时间' }] : []}
                    >
                      <TimePicker
                        className="w-full"
                        placeholder="请选择时间"
                        format="HH:mm:ss"
                      />
                    </Form.Item>
                  </Col>
                </Row>
              )}
            </Space>
          </Form.Item>

          <Form.Item name="description" label="任务描述">
            <TextArea
              rows={4}
              maxLength={1000}
              showCount
              placeholder="描述这次训练任务的目标和注意事项..."
            />
          </Form.Item>
        </>
      ) : (
        <Row>
          <Col span={12}>
            <Form.Item
              name="version"
              label="任务版本"
              layout="horizontal"
            >
              <Typography.Text>{datainfo?.version}</Typography.Text>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="基础模型"
              layout="horizontal"
              initialValue="V1"
            >
              <Typography.Text>{datainfo?.base_model?.base_model_name}</Typography.Text>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="训练类型"
              layout="horizontal"
            >
              <Typography.Text>{ModelTypeMapping(datainfo?.training_type?.train_type_category)?.text}</Typography.Text>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="训练方法"
              layout="horizontal"
              initialValue="V1"
            >
              <Typography.Text>{datainfo?.training_type?.train_method_type}</Typography.Text>
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="任务定时配置">
              <Space direction="vertical" className="w-full">
                <Form.Item name="schedule_enabled" valuePropName="checked" className="mb-0">
                  <Switch
                    checked={scheduleEnabled}
                    onChange={(checked) => {
                      form.setFieldsValue({ schedule_enabled: checked })
                      if (!checked) {
                        form.setFieldsValue({ schedule_date: undefined, schedule_time: undefined })
                      }
                    }}
                  />
                </Form.Item>
                {scheduleEnabled && (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="schedule_date"
                        label="执行时间"
                        rules={scheduleEnabled ? [{ required: true, message: '请选择日期' }] : []}
                      >
                        <DatePicker
                          className="w-full"
                          placeholder="请选择日期"
                          format="YYYY-MM-DD"
                          disabledDate={(current) => current && current < dayjs().startOf('day')}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="schedule_time"
                        label=" "
                        rules={scheduleEnabled ? [{ required: true, message: '请选择时间' }] : []}
                      >
                        <TimePicker
                          className="w-full"
                          placeholder="请选择时间"
                          format="HH:mm:ss"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
              </Space>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="description" label="任务描述" initialValue={datainfo?.description}>
              <TextArea
                rows={4}
                maxLength={1000}
                showCount
                placeholder="描述这次训练任务的目标和注意事项..."
              />
            </Form.Item>
          </Col>
        </Row>
      )}
    </Card>
  )
}

export default BasicConfig
