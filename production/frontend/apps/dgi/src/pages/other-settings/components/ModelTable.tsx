import {
  Button,
  Col,
  Form,
  Input,
  Row,
  Select,
  Table,
  message,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import { useRequest } from 'ahooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ModelEditModal from './ModelEditModal'
import { apiModelDelete, apiModelList } from '@/services/api'
import { useTransform } from '@/locales'
import { useSystemConfig } from '@/hooks/use-system-config'

interface ModelItem {
  id: number
  model_name: string
  model_type: string
  model_count?: number
  description?: string
}

export default function ModelTable() {
  const navigate = useNavigate()
  const { $t } = useTransform()
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [filters, setFilters] = useState({})
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [currentModelId, setCurrentModelId] = useState<number | null>(null)
  const { securityPolicyOptions, isLoading, amountSymbol, modelTypeOptions, securityLevel, securityLevelEnabled }
    = useSystemConfig(true)
  const [form] = Form.useForm()
  // 获取可用的数据安全级别选项
  // const [securityLevels, setSecurityLevels] = useState<DataSecurityLevelOption[]>([]);

  // 获取模型列表
  const {
    data = { items: [], total: 0 },
    loading,
    refresh,
  } = useRequest(
    () =>
      apiModelList({
        page_number: pagination.current,
        page_size: pagination.pageSize,
        ...filters,
      }).then((res) => {
        setPagination((prev) => ({ ...prev, total: res.data.total }))
        return {
          items: res.data.items,
          total: res.data.total,
        }
      }),
    {
      refreshDeps: [pagination.current, pagination.pageSize, filters],
      debounceWait: 300,
    },
  )

  // 删除模型
  const { run: handleDelete, loading: deleteLoading } = useRequest(
    async (id: number) => {
      await apiModelDelete(id)
      message.success($t('删除成功'))
      refresh()
    },
    { manual: true },
  )

  // 类型 label 显示
  const getTypeLabel = (type: string) =>
    modelTypeOptions.find((item) => item.value === type)?.label || type

  const columns: ColumnsType<ModelItem> = [
    {
      title: $t('模型名称'),
      dataIndex: 'model_name',
      key: 'model_name',
      width: 200,
    },
    {
      title: $t('模型密级'),
      dataIndex: 'data_level',
      hidden: !securityLevelEnabled,
      key: 'data_level',
    },
    {
      title: $t('模型类型'),
      dataIndex: 'category',
      key: 'category',
      render: (v) =>
        v
          .split(',')
          .map((m: string) => getTypeLabel(m))
          .join('、'),
      width: 150,
    },
    // {
    //   title: $t("安全审核策略"),
    //   dataIndex: "security_policy",
    //   key: "security_policy",
    //   width: 200,
    //   render: (v) => {
    //     const policy = securityPolicyOptions.find((item) => item.value === v);
    //     return policy ? policy.label : "-";
    //   },
    // },
    {
      title: $t('输入审核策略'),
      dataIndex: 'security_policy',
      key: 'security_policy',
      width: 200,
      render: (v) => {
        const policy = securityPolicyOptions.find((item) => item.value === v)
        return policy ? policy.label : '-'
      },
    },
    {
      title: $t('输出审核策略'),
      dataIndex: 'security_policy_out',
      key: 'security_policy_out',
      width: 200,
      render: (v) => {
        const policy = securityPolicyOptions.find((item) => item.value === v)
        return policy ? policy.label : '-'
      },
    },
    {
      title: `${$t('输入Token价格')}(${amountSymbol}/1K tokens)`,
      dataIndex: 'input_token_price',
      key: 'input_token_price',
      ellipsis: true,
      width: 240,
      render: (v) => v || '-',
    },
    {
      title: `${$t('输出Token价格')}(${amountSymbol}/1K tokens)`,
      dataIndex: 'output_token_price',
      key: 'output_token_price',
      ellipsis: true,
      width: 240,
      render: (v) => v || '-',
    },
    {
      title: $t('实时语音识别价格(￥/秒)'),
      dataIndex: 'second_price',
      key: 'second_price',
      width: 200,
      render: (v) => v || '-',
    },
    {
      title: $t('实例数'),
      dataIndex: 'ability_count',
      key: 'ability_count',
      width: 200,
      render: (v) => v || '-',
    },
    {
      title: $t('模型说明'),
      width: 200,
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v) => v || '-',
    },
    {
      title: $t('操作'),
      key: 'action',
      width: 170,
      fixed: 'right',
      render: (_, record) => (
        <div className="flex gap-2">
          <Button
            size="small"
            type="link"
            onClick={() => {
              setCurrentModelId(record.id)
              setEditModalOpen(true)
            }}
          >
            {$t('设置')}
          </Button>
          <Button
            size="small"
            type="link"
            onClick={() => {
              navigate(`/channel-manage/channel-test/${encodeURIComponent(record.model_name)}`)
            }}
          >
            {$t('查看实例')}
          </Button>
          {/* <Popconfirm
            title={$t("确认删除该模型？")}
            onConfirm={() => handleDelete(record.id)}
            okText={$t("删除")}
            cancelText={$t("取消")}
          >
            <Button size="small" danger loading={deleteLoading}>
              {$t("删除")}
            </Button>
          </Popconfirm> */}
        </div>
      ),
    },
  ]

  const handleTableChange = (page: TablePaginationConfig) => {
    setPagination((prev) => ({ ...prev, ...page }))
  }

  const handleFilterChange = (_: any, allValues: any) => {
    setPagination((p) => ({ ...p, current: 1 })) // reset page to 1
    setFilters(allValues)
  }

  // useEffect(() => {
  //   const enabledLevels = PermissionHelper.getEnabledDataSecurityLevels(securityLevel as UserPermissionLevel);
  //   setSecurityLevels(enabledLevels);
  // }, [securityLevel])

  return (
    <>
      <div className="mb-4 flex justify-between">
        <Form form={form} onValuesChange={handleFilterChange} className="!flex-1">
          <Row gutter={24}>
            <Col span={4}>
              <Form.Item name="model_name">
                <Input placeholder={$t('请输入模型名称')} allowClear />
              </Form.Item>
            </Col>
            {securityLevelEnabled && (
              <Col span={8}>
                <Form.Item name="data_level">
                  <Select
                    placeholder={$t('请选择密级')}
                    allowClear
                    options={[{ label: $t('全部'), value: '' }, ...securityLevel]}
                  />
                </Form.Item>
              </Col>
            )}
            {/* <Col span={8}>
              <Form.Item name="security_policy">
                <Select
                  placeholder={$t("安全审核策略")}
                  options={[
                    {
                      label: $t("全部"),
                      value: "",
                    },
                    ...securityPolicyOptions,
                  ]}
                  loading={isLoading}
                  allowClear
                />
              </Form.Item>
            </Col> */}
            <Col span={4}>
              <Form.Item name="security_policy">
                <Select
                  placeholder={$t('请选择输入审核策略')}
                  options={[
                    {
                      label: $t('全部'),
                      value: '',
                    },
                    ...securityPolicyOptions,
                  ]}
                  loading={isLoading}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="security_policy_out">
                <Select
                  placeholder={$t('请选择输出审核策略')}
                  options={[
                    {
                      label: $t('全部'),
                      value: '',
                    },
                    ...securityPolicyOptions,
                  ]}
                  loading={isLoading}
                  allowClear
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Button type="primary" onClick={() => navigate('/channel-manage/model-attribute')}>
          {$t('模型属性')}
        </Button>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data.items}
        loading={loading}
        pagination={{
          ...pagination,
          showTotal: (total) => $t('总共 {total} 条', { total }),
        }}
        onChange={handleTableChange}
        scroll={{ x: 800 }}
      />
      <ModelEditModal
        open={editModalOpen}
        modelId={currentModelId}
        onCancel={() => setEditModalOpen(false)}
        onSuccess={() => {
          setEditModalOpen(false)
          refresh()
        }}
        securityLevels={securityLevel}
      />
    </>
  )
}
