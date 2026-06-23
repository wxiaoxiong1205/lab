import React from 'react'
import { Button, Input, Layout, Modal, Pagination, Select, Space, Table, Typography } from 'antd'
import { ArrowLeftOutlined, FileTextOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  ANNOTATION_FILTER_OPTIONS,
  AUDIT_FILTER_OPTIONS,
  type AnnotationDetailFooterProps,
  type AnnotationDetailTableSectionProps,
  type AnnotationDetailToolbarProps,
  type AnnotationFilter,
  type AuditRejectModalProps,
  type ImagePreviewModalProps,
  getPaginationTotalText,
} from './AnnotationDetailSections.types'

export const AnnotationDetailToolbar: React.FC<AnnotationDetailToolbarProps> = ({
  isSubmitted,
  annotationFilter,
  isAuditMode,
  onFilterChange,
  onOpenConfig,
}) => {
  const filterOptions = isAuditMode ? AUDIT_FILTER_OPTIONS : ANNOTATION_FILTER_OPTIONS

  return (
    <div className="p-6 flex-shrink-0">
      {!isSubmitted && (
        <div className="flex justify-between items-center mb-2">
          <Select
            value={annotationFilter}
            onChange={(value) => onFilterChange(value as AnnotationFilter)}
            placeholder="请选择"
            className="w-[200px]"
            options={filterOptions}
          />
          {!isAuditMode && (
            <Space>
              <Button icon={<SettingOutlined />} onClick={onOpenConfig}>
                标注配置
              </Button>
            </Space>
          )}
        </div>
      )}
    </div>
  )
}

export function AnnotationDetailTableSection<T extends { id: number | string }>({
  columns,
  dataSource,
  loading,
  isImageAnnotation,
  onRowClick,
}: AnnotationDetailTableSectionProps<T>) {
  return (
    <div className="flex-1 overflow-hidden px-6 pb-4">
      <div className="h-full overflow-auto">
        <Table
          columns={columns}
          dataSource={dataSource}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="middle"
          scroll={{ y: '100%' }}
          locale={{ emptyText: '暂无数据' }}
          className="[&_.ant-table-tbody>tr>td]:align-top [&_.ant-table-tbody>tr]:h-full [&_.ant-table-tbody>tr>td]:h-full [&_.ant-table-tbody>tr>td]:relative"
          onRow={(record) => ({
            onClick: (event) => onRowClick(record, event),
            style: { cursor: isImageAnnotation ? 'pointer' : 'default' },
          })}
        />
      </div>
    </div>
  )
}

export const AnnotationDetailFooter: React.FC<AnnotationDetailFooterProps> = ({
  pagination,
  aiLoading,
  isSubmitted,
  isAuditMode,
  auditSubmitLoading,
  isCompleted,
  onPageChange,
  onSubmitAudit,
  onSubmit,
}) => (
  <div className="bg-white border-t border-gray-200 px-6 py-4 flex justify-between items-center shadow-lg flex-shrink-0">
    <Pagination
      current={pagination.current}
      pageSize={pagination.pageSize}
      total={pagination.total}
      onChange={onPageChange}
      showSizeChanger={false}
      showTotal={getPaginationTotalText}
      disabled={aiLoading}
    />
    {!isSubmitted && (
      <Space>
        {isAuditMode
          ? (
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                onClick={onSubmitAudit}
                disabled={auditSubmitLoading || !isCompleted}
                loading={auditSubmitLoading}
              >
                提交审核
              </Button>
            )
          : (
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                onClick={onSubmit}
                disabled={aiLoading || !isCompleted}
              >
                提交标注
              </Button>
            )}
      </Space>
    )}
  </div>
)

export const AuditRejectModal: React.FC<AuditRejectModalProps> = ({
  visible,
  reason,
  loading,
  onReasonChange,
  onCancel,
  onConfirm,
}) => (
  <Modal
    title="审核不通过"
    open={visible}
    onCancel={onCancel}
    onOk={onConfirm}
    confirmLoading={loading}
    okText="确认驳回"
    okButtonProps={{ danger: true }}
    destroyOnClose
  >
    <div className="mb-2">
      <span className="text-red-500">*</span>
      {' '}
      驳回原因：
    </div>
    <Input.TextArea
      value={reason}
      onChange={(e) => onReasonChange(e.target.value)}
      placeholder="请输入驳回原因（必填）"
      className="!mb-2"
      rows={4}
      showCount
      maxLength={500}
    />
  </Modal>
)

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  visible,
  imageUrl,
  onClose,
}) => (
  <Modal
    open={visible}
    onCancel={onClose}
    width="60%"
    height={600}
    footer={null}
    onOk={onClose}
    title="图片详情"
    centered
  >
    {imageUrl && (
      <img
        src={imageUrl}
        alt="预览"
        className="w-[120%] object-contain"
      />
    )}
  </Modal>
)

export const AnnotationDetailContent: React.FC<React.PropsWithChildren<{ title: React.ReactNode }>> = ({ title, children }) => {
  const navigate = useNavigate()

  return (
    <Layout.Content className="bg-white h-[calc(100vh-100px)] flex flex-col overflow-hidden">
      <div className="px-6 pt-4 mb-4 flex items-center flex-shrink-0">
        <Button
          type="text"
          className="mr-3 !h-7 !w-7 !p-0 text-[18px] leading-7"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
        />
        <Typography.Title level={5} className="!mb-0">
          {title}
        </Typography.Title>
      </div>
      {children}
    </Layout.Content>
  )
}
