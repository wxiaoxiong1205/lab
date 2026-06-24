import { Button, Form, Input, Select, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'

const { Title } = Typography

export interface DeployServiceMoreConfigFormProps {
  form: FormInstance
  configParamOptions: any[]
  reasoningParams: any
  disabedParamsKeyList: string[]
  isMachine?: boolean
}

export function DeployServiceMoreConfigForm(props: DeployServiceMoreConfigFormProps) {
  const { form, configParamOptions, reasoningParams, disabedParamsKeyList, isMachine } = props

  return (
    <div className="mt-4">
      <Form
        form={form}
        layout="vertical"
      >
        <div className="mb-6">
          <Title level={5} className="mb-1">参数</Title>
          <Form.List name="inferenceParams">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} className="flex gap-2">
                    <Form.Item
                      {...restField}
                      name={[name, 'key']}
                      className="flex-1"
                    >
                      {isMachine
                        ? (
                            <Input
                              placeholder="请输入参数名"
                              disabled={
                                disabedParamsKeyList.includes(form.getFieldValue(['inferenceParams', name, 'key']))
                              }
                            />
                          )
                        : (
                            <Select
                              placeholder="选择或输入参数名"
                              showSearch
                              allowClear
                              disabled={
                                disabedParamsKeyList.includes(form.getFieldValue(['inferenceParams', name, 'key']))
                              }
                            >
                              {configParamOptions
                                .filter((param) => !reasoningParams?.some((selectedItem: any) => selectedItem?.key === param?.value))
                                .map((param) => (
                                  <Select.Option key={param.value} value={param.value} label={param.label}>
                                    {param.label}
                                  </Select.Option>
                                ))}
                            </Select>
                          )}
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'value']}
                      className="flex-1 mb-0"
                    >
                      <Input
                        disabled={
                          disabedParamsKeyList.includes(form.getFieldValue(['inferenceParams', name, 'key']))
                        }
                        placeholder="参数值"
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      onClick={() => remove(name)}
                      icon={<span>−</span>}
                      className="h-8 w-8 rounded-full border border-gray-300"
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add()}
                  block
                >
                  + 添加参数
                </Button>
              </>
            )}
          </Form.List>
        </div>

        <div className="mb-6">
          <Title level={5} className="mb-3">环境变量</Title>
          <Form.List name="envVariables">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} className="flex gap-2 mb-2">
                    <Form.Item
                      {...restField}
                      name={[name, 'key']}
                      className="flex-1 mb-0"
                    >
                      <Input placeholder="请输入环境变量名" />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'value']}
                      className="flex-1 mb-0"
                    >
                      <Input placeholder="环境变量值" />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      onClick={() => remove(name)}
                      icon={<span>−</span>}
                      className="h-8 w-8 rounded-full border border-gray-300"
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add()}
                  block
                  className="mt-2"
                >
                  + 添加变量
                </Button>
              </>
            )}
          </Form.List>
        </div>
      </Form>
    </div>
  )
}
