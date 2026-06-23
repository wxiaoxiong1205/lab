import { DownOutlined } from '@ant-design/icons'
import { Button, Card, Dropdown, Pagination, Select, Skeleton, Space, Table, Tabs, Typography } from 'antd'
import type { MenuProps } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { EvaluationResultData, EvaluationType } from '@/types/ReportDetailTypes.ts'
import type { DatasetModelRelation, ProjectEvaluationTaskDetail, ProjectEvaluationTaskReport, ProjectEvaluationTaskResults } from '@/services/modelEvaluationServices'
import type { EvaluationListResponse } from '@/services/manualEvaluationService'
import { isInteractiveElement } from '@/utils/domUtils'

const { Title } = Typography

interface EvaluationMethodOption {
  value: string
  label: string
  apiValue: string
}

interface EvaluationDetailsTabProps {
  evaluationType: EvaluationType
  isCompleted: boolean
  isFailed: boolean
  isLoadingTaskDetail: boolean
  taskDetail: ProjectEvaluationTaskDetail | null
  isLoadingResults: boolean
  isLoadingManualResults: boolean
  evaluationMethodFilterForResults: string
  setEvaluationMethodFilterForResults: (value: string) => void
  getEvaluationMethodOptions: () => EvaluationMethodOption[]
  downloadMenuItems: MenuProps['items']
  evaluationResultColumns: ColumnsType<EvaluationResultData>
  currentModelData: EvaluationResultData[]
  currentPage: number
  pageSize: number
  manualEvaluationResults: EvaluationListResponse | null
  evaluationResults: ProjectEvaluationTaskResults | null
  setCurrentPage: (page: number) => void
  selectedModelTab: string
  setSelectedModelTab: (key: string) => void
  reportData: ProjectEvaluationTaskReport | null
  getModelTabLabel: (relation: DatasetModelRelation) => string
  toggleRowExpand: (record: EvaluationResultData) => void
}

function ResultTable({
  columns,
  data,
  loading,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onRowClick,
}: {
  columns: ColumnsType<EvaluationResultData>
  data: EvaluationResultData[]
  loading: boolean
  currentPage: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onRowClick: (record: EvaluationResultData) => void
}) {
  if (loading) {
    return <Skeleton active paragraph={{ rows: 6 }} />
  }

  return (
    <>
      <Table
        columns={columns}
        dataSource={data}
        pagination={false}
        scroll={{ x: 1200 }}
        bordered
        size="small"
        onRow={(record) => ({
          onClick: (e) => {
            const target = e.target as HTMLElement
            if (!isInteractiveElement(target)) {
              onRowClick(record)
            }
          },
          className: 'cursor-pointer',
        })}
      />

      <div className="flex justify-end items-center mt-4">
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          showSizeChanger={false}
          showQuickJumper
          showTotal={(total, range) => `第 ${range?.[0] || 1}-${range?.[1] || total} 条，共 ${total} 条记录`}
          onChange={onPageChange}
        />
      </div>
    </>
  )
}

export default function EvaluationDetailsTab({
  evaluationType,
  isCompleted,
  isFailed,
  isLoadingTaskDetail,
  taskDetail,
  isLoadingResults,
  isLoadingManualResults,
  evaluationMethodFilterForResults,
  setEvaluationMethodFilterForResults,
  getEvaluationMethodOptions,
  downloadMenuItems,
  evaluationResultColumns,
  currentModelData,
  currentPage,
  pageSize,
  manualEvaluationResults,
  evaluationResults,
  setCurrentPage,
  selectedModelTab,
  setSelectedModelTab,
  reportData,
  getModelTabLabel,
  toggleRowExpand,
}: EvaluationDetailsTabProps) {
  const tableLoading = isLoadingResults || isLoadingManualResults
  const downloadDisabled = evaluationType === 'manual' ? isLoadingManualResults : isLoadingResults

  return (
    <div className="evaluation-details-content">
      <Card className="min-h-[500px]">
        {isCompleted ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <Space className="flex items-center">
                <Title level={5} className="mt-2">评估数据结果</Title>
                {evaluationType !== 'manual' && (
                  <Select
                    value={evaluationMethodFilterForResults}
                    onChange={setEvaluationMethodFilterForResults}
                    size="small"
                    className="w-[120px]"
                    disabled={tableLoading}
                  >
                    {getEvaluationMethodOptions().map((option) => (
                      <Select.Option key={option.value} value={option.value}>
                        {option.label}
                      </Select.Option>
                    ))}
                  </Select>
                )}
              </Space>
              <Space>
                <Dropdown
                  menu={{ items: downloadMenuItems }}
                  disabled={downloadDisabled}
                  trigger={['hover']}
                >
                  <Button type="primary" disabled={downloadDisabled}>
                    下载
                    {' '}
                    <DownOutlined />
                  </Button>
                </Dropdown>
              </Space>
            </div>

            {isLoadingTaskDetail || !taskDetail?.dataset_model_relations || taskDetail.dataset_model_relations.length === 0 ? (
              <Skeleton active paragraph={{ rows: 8 }} />
            ) : evaluationType === 'manual' ? (
              <div className="min-h-[400px]">
                <ResultTable
                  columns={evaluationResultColumns}
                  data={currentModelData}
                  loading={tableLoading}
                  currentPage={currentPage}
                  pageSize={pageSize}
                  total={manualEvaluationResults?.total || 0}
                  onPageChange={setCurrentPage}
                  onRowClick={toggleRowExpand}
                />
              </div>
            ) : (
              <Tabs
                activeKey={selectedModelTab}
                onChange={setSelectedModelTab}
                type="card"
                items={taskDetail.dataset_model_relations.map((relation, index) => ({
                  key: Object.prototype.hasOwnProperty.call(relation, 'inference_result_dataset_id')
                    ? String((relation as DatasetModelRelation & { inference_result_dataset_id?: number }).inference_result_dataset_id)
                    : String(relation.evaluated_model_id),
                  label: reportData?.model_reports?.[index]?.model_name ?? getModelTabLabel(relation),
                  children: (
                    <div className="min-h-[400px]">
                      <ResultTable
                        columns={evaluationResultColumns}
                        data={currentModelData}
                        loading={tableLoading}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        total={evaluationResults?.total || 0}
                        onPageChange={setCurrentPage}
                        onRowClick={toggleRowExpand}
                      />
                    </div>
                  ),
                }))}
              />
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-400">
            {isFailed ? '任务执行失败，暂时无法查看评估数据结果' : '任务尚未完成，评估数据结果将在任务完成后显示'}
          </div>
        )}
      </Card>
    </div>
  )
}
