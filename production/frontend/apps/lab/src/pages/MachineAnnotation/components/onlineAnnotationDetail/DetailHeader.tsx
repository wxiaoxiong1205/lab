import React from 'react'
import { Button, Select, Space, Tooltip, Typography } from 'antd'
import {
  ArrowLeftOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons'

const { Text } = Typography

export type DetailStatusFilter = 'all' | 'annotated' | 'unannotated' | 'unaudited' | 'passed' | 'failed'

const ANNOTATION_FILTER_OPTIONS: Array<{ label: string, value: DetailStatusFilter }> = [
  { label: '全部', value: 'all' },
  { label: '已标注', value: 'annotated' },
  { label: '未标注', value: 'unannotated' },
]

const AUDIT_FILTER_OPTIONS: Array<{ label: string, value: DetailStatusFilter }> = [
  { label: '全部', value: 'all' },
  { label: '未审核', value: 'unaudited' },
  { label: '审核通过', value: 'passed' },
  { label: '审核不通过', value: 'failed' },
]

interface AuditStatusChipProps {
  result: 'passed' | 'failed'
  auditReason?: string | null
}

const AuditStatusChip: React.FC<AuditStatusChipProps> = ({ result, auditReason }) => {
  const trimmedAuditReason = auditReason?.trim() ?? ''

  if (result === 'passed') {
    return (
      <div className="shrink-0 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-1.5">
        <Text className="text-[13px] text-[#166534]">审核通过</Text>
      </div>
    )
  }

  return (
    <div className="shrink-0 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-1.5">
      <Text className="text-[13px] text-[#b42318]">
        审核不通过
        {!!trimmedAuditReason && (
          <Tooltip
            title={trimmedAuditReason}
            placement="topLeft"
            overlayStyle={{ maxWidth: 400 }}
          >
            <span className="ml-1 cursor-help underline decoration-dotted decoration-[#b42318]/50 underline-offset-2">
              查看原因
            </span>
          </Tooltip>
        )}
      </Text>
    </div>
  )
}

interface DetailHeaderProps {
  title: string
  savingDraft: boolean
  autoAnnotating?: boolean
  isSubmitted?: boolean
  isAuditMode?: boolean
  useAuditStatusFilter?: boolean
  hideFilter?: boolean
  readOnly?: boolean
  auditSubmitting?: boolean
  auditActionDisabled?: boolean
  auditResult?: 'passed' | 'failed' | null
  auditReason?: string | null
  isOnlineTabDetail?: boolean
  hideAnnotationActions?: boolean
  filterValue: DetailStatusFilter
  onFilterChange: (value: DetailStatusFilter) => void
  onShowConfig: () => void
  onAutoAnnotate: () => void
  onComplete: () => void
  onBack?: () => void
  onAuditPass?: () => void
  onAuditFail?: () => void
}

const DetailHeader: React.FC<DetailHeaderProps> = ({
  title,
  savingDraft,
  autoAnnotating = false,
  isSubmitted = false,
  isAuditMode = false,
  useAuditStatusFilter = false,
  hideFilter = false,
  readOnly = false,
  auditSubmitting = false,
  auditActionDisabled = false,
  auditResult,
  auditReason,
  isOnlineTabDetail = false,
  hideAnnotationActions = false,
  filterValue,
  onFilterChange,
  onShowConfig,
  onAutoAnnotate,
  onComplete,
  onBack,
  onAuditPass,
  onAuditFail,
}) => {
  const filterOptions = (isAuditMode || useAuditStatusFilter) ? AUDIT_FILTER_OPTIONS : ANNOTATION_FILTER_OPTIONS
  const showAuditResult = isAuditMode && (auditResult === 'passed' || auditResult === 'failed')
  const auditChip = (auditResult === 'passed' || auditResult === 'failed') ? <AuditStatusChip result={auditResult} auditReason={auditReason} /> : null

  return (
    <div className="border-b border-[#edf0f5] px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <Space align="center" size="middle">
          {onBack && (
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
              返回
            </Button>
          )}
          {!hideFilter && (
            <Select
              value={filterValue}
              options={filterOptions}
              className="w-[140px]"
              onChange={onFilterChange}
            />
          )}
          {/* <Text strong className="text-[15px] text-[#1f2937]">
            {title}
          </Text> */}
        </Space>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          {isAuditMode && !isSubmitted
            ? (
                <Space>
                  <Button onClick={onAuditPass} loading={auditSubmitting} disabled={auditActionDisabled}>
                    审核通过
                  </Button>
                  <Button danger onClick={onAuditFail} disabled={auditActionDisabled}>
                    审核不通过
                  </Button>
                </Space>
              )
            : !hideAnnotationActions && !isSubmitted && !readOnly && (
                <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
                  {auditChip
                    ? (
                        <div className="mr-auto shrink-0 self-center">
                          {auditChip}
                        </div>
                      )
                    : null}
                  <Space>
                    <Button type="primary" icon={<SettingOutlined />} onClick={onShowConfig}>
                      标注配置
                    </Button>
                    {(auditResult === 'failed' || auditResult === null || isOnlineTabDetail) && (
                      <>
                        <Button icon={<RobotOutlined />} loading={autoAnnotating} onClick={onAutoAnnotate}>
                          AI自动标注
                        </Button>
                        <Button
                          type="primary"
                          icon={<RobotOutlined />}
                          loading={savingDraft}
                          onClick={onComplete}
                        >
                          完成标注
                        </Button>
                      </>
                    )}
                  </Space>
                </div>
              )}
          {showAuditResult && auditChip}
        </div>
      </div>
    </div>
  )
}

export default DetailHeader
