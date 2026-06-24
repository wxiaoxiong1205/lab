import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { TablePaginationConfig, TableProps } from 'antd'
import { useRequest } from 'ahooks'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'

import {
  Button,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
} from 'antd'
import {
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import type { RangePickerProps } from 'antd/es/date-picker'
import ApprovalModal from './ApprovalModal'
import { useTransform } from '@/locales'
import { apiQueryApprovalDetails, apiQueryApprovalList } from '@/services/api'
import DgiDateTimePicker from '@/components/dgi-date-time-picker'
import DynamicTags from '@/components/DynamicTags'
import { useSystemConfig } from '@/hooks/use-system-config'

interface ApprovalProps {
  [key: string]: any
}0.0

const { Option } = Select

export default function ApprovalManagementPage({
  status,
  type,
  tabComponent,
}: { status: string, type?: number, tabComponent?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()

  const [approvalDetails, setApprovalDetails] = useState(null)
  const [isApproval, setIsApproval] = useState(false)

  const [isLoading, setIsLoading] = useState(false)

  const [searchTime, setSearchTime] = useState<[Dayjs, Dayjs]>()
  const [searchApprovalTime, setSearchApprovalTime] = useState<[Dayjs, Dayjs]>()

  const { $t } = useTransform()
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
  })

  const { amountSymbol } = useSystemConfig(true)

  // 状态筛选逻辑提取
  const getStatusFilter = (
    filterStatus: string,
    paramStatus?: string,
  ): string => {
    if (filterStatus === 'pending') return '1'
    if (filterStatus === 'approved') {
      return !Number(paramStatus) ? '2,3' : String(paramStatus!)
    }
    return !Number(paramStatus) ? '1,2,3' : String(paramStatus!)
  }

  // 使用 useRequest 处理数据请求，添加手动触发功能
  const {
    data = [],
    loading,
    run: runQueryApprovalList,
  } = useRequest(
    async (params?: {
      applicant_name?: string
      approver_name?: string
      submitTimeRange?: [Dayjs, Dayjs]
      approvalTimeRange?: [Dayjs, Dayjs]
      status?: string
    }) => {
      const buildRequestParams = () => {
        const req: any = {
          applicant_name: params?.applicant_name,
          approver_name: params?.approver_name,
          status: getStatusFilter(status, params?.status),
          type,
        }
        // 处理时间范围
        if (params?.submitTimeRange && params?.submitTimeRange?.length > 0) {
          const [start, end] = params.submitTimeRange
          req.created_start_time = dayjs(start.format('YYYY-MM-DD HH:mm:ss')).unix()
          req.created_end_time = dayjs(end.format('YYYY-MM-DD HH:mm:ss')).unix()
        }

        if (params?.approvalTimeRange && params?.approvalTimeRange?.length > 0) {
          const [start, end] = params.approvalTimeRange
          req.approved_start_time = dayjs(start.format('YYYY-MM-DD HH:mm:ss')).unix()
          req.approved_end_time = dayjs(end.format('YYYY-MM-DD HH:mm:ss')).unix()
        }

        return req
      }

      const response = await apiQueryApprovalList({
        page_number: pagination.current,
        page_size: pagination.pageSize,
        ...buildRequestParams(),
      })

      setPagination((prev) => ({
        ...prev,
        total: response.data.total,
        showTotal: (total) => $t(`总共 {total} 条`, { total }),
      }))

      return response.data.items
    },
    {
      refreshDeps: [pagination.current, pagination.pageSize],
      debounceWait: 300,
    },
  )

  useEffect(() => {
    setPagination({
      ...pagination,
      showTotal: (total) => $t(`总共 {total} 条`, { total }),
    })
  }, [$t])

  const disabledDate: RangePickerProps['disabledDate'] = (current) => {
    // Can not select days after today
    return current && current > dayjs().endOf('day')
  }

  const handleReset = () => {
    form.resetFields()
    setPagination({
      ...pagination,
      current: 1,
      pageSize: 10,
    })
    runQueryApprovalList()
  }

  const columns: TableProps<ApprovalProps>['columns'] = [
    {
      title: $t('申请人'),
      dataIndex: 'applicant_name',
      key: 'applicant_name',
      width: 160,
    },
    {
      title: type === 1 ? `${$t('申请额度')} (${amountSymbol})` : $t('申请模型'),
      dataIndex: 'content',
      key: 'content',
      width: 260,
      render: (content: string) => {
        let applyContent
        try {
          const parseContent = JSON.parse(content)
          switch (type) {
            // 额度
            case 1:
              applyContent = parseContent?.unlimited_quota
                ? $t('无限额度')
                : parseContent?.balance_add
              break

            // 模型
            case 2: {
              const model_names = parseContent?.model_names as string[] || []
              if (model_names.length === 0) {
                applyContent = '-'
              }
              else {
                applyContent = <DynamicTags data={model_names} />
              }
              break
            }
          }
        }
        catch {
          applyContent = 0
        }
        return applyContent
      },
    },
    ...(type === 2 ? [{
      title: $t('申请API'),
      dataIndex: 'content',
      key: 'content',
      width: 260,
      render: (content: string) => {
        try {
          const parseContent = JSON.parse(content)
          const api_names = parseContent?.api_names as string[] || []
          if (api_names.length === 0) {
            return '-'
          }
          else {
            return <DynamicTags data={api_names} />
          }
        }
        catch {
          return '-'
        }
      },
    }] : []),
    {
      title: $t('提交时间'),
      dataIndex: 'created_time',
      key: 'created_time',
      width: 180,
      render: (text: string) => {
        return dayjs(Number(text) * 1000).format('YYYY-MM-DD HH:mm:ss')
      },
    },
    ...(status !== 'pending'
      ? [
          {
            title: $t('审批人'),
            dataIndex: 'approver_name',
            key: 'approver_name',
            width: 160,
          },
          {
            title: $t('审批结果'),
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (status: string) => {
              const statusMap: Record<string, { text: string, color: string, icon: string }> = {
                2: {
                  text: $t('通过'),
                  color: 'success', // or 'green'
                  icon: '',
                // icon: <CheckCircleOutlined />,
                },
                3: {
                  text: $t('不通过'),
                  color: 'error', // or 'red'
                  icon: '',
                // icon: <CloseCircleOutlined />,
                },
                1: {
                  text: $t('待审批'),
                  color: 'processing', // or 'blue'
                  icon: '',
                // icon: <ClockCircleOutlined />,
                },
              }

              const statusObj = statusMap[status] || {
                text: status,
                color: 'default',
                icon: '',
              }

              return (
                <Tag
                  color={statusObj.color}
                  icon={statusObj.icon}
                  style={{ marginRight: 0 }}
                >
                  {statusObj.text}
                </Tag>
              )
            },
          },
          {
            title: $t('审批时间'),
            dataIndex: 'approved_time',
            key: 'approved_time',
            width: 180,
            render: (text: string) => {
              return text
                ? dayjs(Number(text) * 1000).format('YYYY-MM-DD HH:mm:ss')
                : '-'
            },
          },
        ]
      : []),
    {
      title: $t('操作'),
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_, record) => (
        <Space size="middle">
          {['approved', 'submitted'].includes(status) ? (
            <a
              className="text-blue-600"
              onClick={() => handleApprove(record.id, false)}
            >
              {$t('查看详情')}
            </a>
          ) : (
            <a
              className="text-blue-600"
              onClick={() => handleApprove(record.id, true)}
            >
              {$t('审批')}
            </a>
          )}
        </Space>
      ),
    },
  ]

  const handleApprove = async (id: number, isApprove: boolean) => {
    setIsLoading(true)
    setOpen(true)
    const rep = await apiQueryApprovalDetails(id)
    setApprovalDetails(rep.data?.approval)
    setIsApproval(isApprove)
    setIsLoading(false)
  }

  const onApprove = () => {
    setOpen(false)
    runQueryApprovalList()
  }

  const onReject = () => {
    setOpen(false)
  }

  const onSearch = () => {
    console.log(searchTime, 'searchTime')
    runQueryApprovalList({ ...form.getFieldsValue(), submitTimeRange: searchTime })
  }

  const handleDateTimeChange = (range: [Dayjs, Dayjs]) => {
    setSearchTime(range)
  }

  const handleApprovalDateTimeChange = (range: [Dayjs, Dayjs]) => {
    setSearchApprovalTime(range)
  }

  return (
    <div className="bg-white min-h-full rounded-lg p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-4">{$t('审批管理')}</h1>
      </div>

      {/* 组件内tabs控制 */}
      {tabComponent}

      <Form form={form} layout="inline" className="flex flex-wrap gap-y-4 !mb-6">
        {!['submitted'].includes(status) && (
          <Form.Item name="applicant_name" className="mb-0">
            <Input
              placeholder={$t('请输入申请人')}
              prefix={<SearchOutlined className="text-gray-400" />}
              className="w-48"
              allowClear
            />
          </Form.Item>
        )}

        <Form.Item className="mb-0">
          <DgiDateTimePicker
            value={searchTime}
            onChange={handleDateTimeChange}
            placeholder={`${$t('提交开始时间')}~${$t('提交结束时间')}`}
            className="w-[380px]"
            hasOptions={false}
          />
          {/* <RangePicker
              showTime={{ format: "HH:mm" }}
              format="YYYY-MM-DD HH:mm"
              placeholder={[$t("提交开始时间"), $t("提交结束时间")]}
              disabledDate={disabledDate}
              className="w-64"
            /> */}
        </Form.Item>

        {['approved', 'submitted'].includes(status) && (
          <>
            <Form.Item name="approver_name" className="mb-0">
              <Input
                placeholder={$t('请输入审批人')}
                prefix={<SearchOutlined className="text-gray-400" />}
                className="w-48"
                allowClear
              />
            </Form.Item>

            <Form.Item name="approvalTimeRange" className="mb-0">
              {/* <RangePicker
                  showTime={{ format: "HH:mm" }}
                  format="YYYY-MM-DD HH:mm"
                  placeholder={[$t("审批开始时间"), $t("审批结束时间")]}
                  disabledDate={disabledDate}
                  className="w-64"
                /> */}
              <DgiDateTimePicker
                value={searchApprovalTime}
                onChange={handleApprovalDateTimeChange}
                placeholder={`${$t('审批开始时间')}~${$t('审批结束时间')}`}
                className="w-[380px]"
                hasOptions={false}
              />
            </Form.Item>

            <Form.Item name="status" className="mb-0">
              <Select
                placeholder={$t('审批结果')}
                className="min-w-[100px]"
                allowClear
              >
                <Option value="0">{$t('全部')}</Option>
                {status === 'submitted' && (
                  <Option value="1">{$t('待审批')}</Option>
                )}
                <Option value="2">{$t('通过')}</Option>
                <Option value="3">{$t('不通过')}</Option>
              </Select>
            </Form.Item>
          </>
        )}
        <Space>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SearchOutlined />}
            onClick={onSearch}
          >
            {$t('搜索')}
          </Button>
          <Button onClick={handleReset} icon={<ReloadOutlined />}>
            {$t('重置')}
          </Button>
        </Space>
      </Form>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={pagination}
        onChange={(pagination) => setPagination(pagination)}
        scroll={{ x: 'max-content' }}
      />

      <ApprovalModal
        open={open}
        onSuccess={onApprove}
        onCancel={onReject}
        approvalDetails={approvalDetails}
        isApproval={isApproval}
        isLoading={isLoading}
        type={type}
      />
    </div>
  )
}
