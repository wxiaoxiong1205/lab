import React from 'react'
import { Badge, Button, Input, Popover, Radio, Space, Tag, Typography } from 'antd'
import { FilterOutlined, RobotOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import ExpandableCell from '../../components/common/ExpandableCell'
import { isInteractiveElement } from '../../utils/domUtils'
import type { AnnotationDataItem } from './annotationDetail.shared'
import { AnnotationDetailContent, AnnotationDetailFooter, AnnotationDetailTableSection, AnnotationDetailToolbar, AuditRejectModal, ImagePreviewModal } from './components/AnnotationDetailSections'
import AnnotationConfigModal from './components/AnnotationConfigModal'
import { useAnnotationDetailController } from './useAnnotationDetailController'
import MdPreview from '@/components/md-preview'

const AnnotationDetail: React.FC = () => {
  const { projectId, taskId, formerListData, taskName, loading, dataList, pagination, annotationFilter, isCompleted, isSubmitted, isReauditRound, manualContent, dpoContents, dpoProcessingTarget, assistantContents, savingDraft, auditSubmitting, auditSubmitLoading, auditRejectModalVisible, auditRejectReason, resolvedContentTab, isImageAnnotation, expandedCells, rowHeights, currentProcessingIndex, imagePreviewVisible, previewImageUrl, streamingContent, aiLoading, configModalVisible, annotationConfig, isMultiPerson, isAuditMode, isMultiPersonPassedLocked, setManualContent, setDpoContents, setAssistantContents, setAuditRejectReason, setAuditRejectModalVisible, setConfigModalVisible, setImagePreviewVisible, handleFilterChange, handlePageChange, handleSaveDraft, handleSubmit, handleAuditPass, handleAuditFailOpen, handleAuditFailConfirm, handleSubmitAudit, handleOpenConfig, handleConfigConfirm, toggleRowExpand, toggleCellExpand, handleHeightChange, handleImageClick, handleOpenAIAnnotation } = useAnnotationDetailController()
  const isDpoAnnotation = formerListData?.training_method_type === 'dpo'
  const isGrpoAnnotation = formerListData?.training_method_type === 'grpo' || formerListData?.dataset_format === 'grpo'
  const isDpoRoleBased = isDpoAnnotation && formerListData?.dataset_format === 'role-based'

  const aiAnnotationButtonClass = '!absolute !bottom-2 !right-2 !z-10 !w-auto !min-w-[88px] !max-w-max !px-3 opacity-0 transition-opacity group-hover:opacity-100'
  const dpoEditorHeightClass = '!h-[calc(100vh-400px)] !min-h-[400px]'
  const [activeDpoEditor, setActiveDpoEditor] = React.useState<'chosen' | 'rejected' | null>(null)
  const renderMarkdownBlock = (content?: string) => (
    content
      ? <MdPreview content={content} />
      : <span className="text-gray-400">-</span>
  )
  const renderTextBlock = (content?: string) => (
    <div className="max-w-full max-h-[calc(100vh-400px)] overflow-y-auto break-words whitespace-pre-wrap">
      {content || '-'}
    </div>
  )
  const renderDpoEditor = (
    value: string,
    field: 'chosen' | 'rejected',
    placeholder: string,
    loading: boolean,
  ) => {
    const isActive = activeDpoEditor === field
    const editable = !isSubmitted

    return (
      <div className="h-[calc(100vh-400px)] min-h-[400px] relative group">
        {isActive && editable
          ? (
              <Input.TextArea
                value={value}
                onChange={(e) => setDpoContents((prev) => ({ ...prev, [field]: e.target.value }))}
                onBlur={(e) => {
                  setDpoContents((prev) => ({ ...prev, [field]: e.target.value }))
                  setActiveDpoEditor(null)
                }}
                className={`w-full resize-none ${dpoEditorHeightClass}`}
                style={{ height: 'calc(100vh - 400px)', minHeight: 400 }}
                placeholder={placeholder}
                autoFocus
              />
            )
          : (
              <div
                className="h-full w-full overflow-y-auto rounded-md border border-[#d9d9d9] bg-white px-[11px] py-[5px]"
                onClick={() => {
                  if (editable) setActiveDpoEditor(field)
                }}
              >
                {value ? <MdPreview content={value} /> : <span className="text-gray-400">{placeholder}</span>}
              </div>
            )}
        {!isSubmitted && !isAuditMode && (
          <Button
            className={aiAnnotationButtonClass}
            type="primary"
            size="small"
            icon={<RobotOutlined />}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleOpenAIAnnotation(field)}
            loading={loading}
            style={{ backgroundColor: 'rgba(24, 144, 255, 0.9)' }}
          >
            AI标注
          </Button>
        )}
      </div>
    )
  }
  const columns: ColumnsType<AnnotationDataItem<string>> = [
    {
      title: '序号',
      dataIndex: 'row_number',
      key: 'row_number',
      align: 'center',
      width: 100,
      render: (rowNumber: number) => (
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
            {rowNumber}
          </div>
        </div>
      ),
    },
    {
      title: 'System',
      dataIndex: isImageAnnotation ? '_systemMessage' : 'system',
      key: 'system',
      align: 'left',
      hidden: isDpoAnnotation || isGrpoAnnotation,
      render: (text: string, record: AnnotationDataItem<string>) => {
        if (isImageAnnotation) {
          const rowKey = record.id?.toString() || record.row_number?.toString() || '0'
          const systemMessage = record._systemMessage || ''
          return (<ExpandableCell text={systemMessage} rowKey={rowKey} columnKey="system" bgColor="#f0f9ff" borderColor="#1890ff" isExpanded={expandedCells.has(`${rowKey}-system`)} onToggle={toggleCellExpand} onHeightChange={handleHeightChange} />)
        }
        return (
          <div className="max-w-full max-h-[calc(100vh-400px)] overflow-y-auto break-words">
            {text || '-'}
          </div>
        )
      },
    },
    {
      title: isImageAnnotation ? 'User' : 'Prompt',
      dataIndex: isImageAnnotation ? '_userMessages' : 'prompt',
      key: isImageAnnotation ? 'user' : 'prompt',
      align: 'left',
      hidden: isDpoAnnotation || isGrpoAnnotation,
      render: (text: any, record: AnnotationDataItem<string>) => {
        if (isImageAnnotation) {
          const rowKey = record.id?.toString() || record.row_number?.toString() || '0'
          const userMessages = record._userMessages || []
          const rawImages = record._rawImages || []
          const systemMessage = record._systemMessage || ''
          if (userMessages.length === 0) {
            return <span className="text-gray-400">-</span>
          }
          const systemImageCount = (systemMessage.match(/<img\s+[^>]*?\/?>/gi) || []).length
          const getMessageStartImageIndex = (messageIndex: number) => {
            let imageCount = systemImageCount
            for (let i = 0; i < messageIndex; i++) {
              const msg = userMessages[i]
              const matches = msg.match(/<img\s+[^>]*?\/?>/gi)
              if (matches) {
                imageCount += matches.length
              }
            }
            return imageCount
          }
          return (
            <div
              className="space-y-2"
              onClick={(e) => {
                const target = e.target as HTMLElement
                if (target.tagName === 'IMG') {
                  e.preventDefault()
                  e.stopPropagation()
                  const imageIndex = target.getAttribute('data-image-index')
                  if (imageIndex !== null) {
                    const index = parseInt(imageIndex, 10)
                    if (index >= 0 && index < rawImages.length) {
                      handleImageClick(index, record)
                    }
                  }
                }
              }}
            >
              {userMessages.map((msg: string, index: number) => {
                const startImageIndex = getMessageStartImageIndex(index)
                let processedMsg = msg
                let currentImageIndex = startImageIndex
                processedMsg = processedMsg.replace(/<img\s+([^>]*?)(\/?)>/gi, (match, attributes, selfClose) => {
                  if (attributes.includes('data-image-index')) {
                    return match
                  }
                  const imageIndex = currentImageIndex++
                  const closingTag = selfClose ? ' />' : '>'
                  return `<img data-image-index="${imageIndex}" ${attributes}${closingTag}`
                })
                return (
                  <div key={index} className="user-message-container">
                    {index > 0 && (<div className="my-2 border-t border-gray-100"></div>)}
                    <ExpandableCell text={processedMsg} rowKey={`${rowKey}-user-${index}`} columnKey="user" bgColor="#fff7e6" borderColor="#faad14" isExpanded={expandedCells.has(`${rowKey}-user-${index}-user`)} onToggle={toggleCellExpand} onHeightChange={handleHeightChange} />
                  </div>
                )
              })}
            </div>
          )
        }
        return (
          <div className="max-w-full max-h-[calc(100vh-400px)] overflow-y-auto break-words">
            {text || '-'}
          </div>
        )
      },
    },
    {
      title: isImageAnnotation ? 'Assistant' : 'Ground Truth',
      dataIndex: isImageAnnotation ? '_assistantMessages' : 'ground_truth',
      key: isImageAnnotation ? 'assistant' : 'ground_truth',
      align: 'left',
      hidden: isDpoAnnotation || isGrpoAnnotation,
      render: (text: any, record: AnnotationDataItem<string>) => {
        if (isImageAnnotation) {
          const rowKey = record.id?.toString() || record.row_number?.toString() || '0'
          const assistantMessages = record._assistantMessages || []
          const rowPrefix = rowKey.includes('-') ? rowKey.split('-')[0] : rowKey
          const maxHeight = rowHeights[`${rowPrefix}-max`] || 100
          const assistantHeight = maxHeight > 100 ? `${maxHeight}px` : '100px'
          return (
            <div className="space-y-2">
              {assistantMessages.map((msg: string, index: number) => {
                const isCurrentProcessing = currentProcessingIndex === index && aiLoading
                const displayValue = isCurrentProcessing && streamingContent
                  ? streamingContent
                  : (assistantContents[index] !== undefined
                      ? assistantContents[index]
                      : (manualContent && index === assistantMessages.length - 1 ? manualContent : msg))
                return (
                  <div key={index}>
                    {index > 0 && (<div className="border-t border-gray-100 my-2"></div>)}
                    <div className="relative group">
                      <Input.TextArea
                        className="w-full overflow-y-auto"
                        value={displayValue}
                        onChange={(e) => {
                          setAssistantContents((prev) => ({
                            ...prev,
                            [index]: e.target.value,
                          }))
                          if (index === assistantMessages.length - 1) {
                            setManualContent(e.target.value)
                          }
                        }}
                        onBlur={(e) => {
                          setAssistantContents((prev) => ({
                            ...prev,
                            [index]: e.target.value,
                          }))
                          if (index === assistantMessages.length - 1) {
                            setManualContent(e.target.value)
                          }
                        }}
                        placeholder={`请输入第 ${index + 1} 条标注内容`}
                        readOnly={isSubmitted}
                        style={{
                          height: assistantHeight,
                          maxHeight: assistantHeight,
                        }}
                      />
                      {!isSubmitted && !isAuditMode && (
                        <Button className={aiAnnotationButtonClass} type="primary" size="small" icon={<RobotOutlined />} onClick={() => handleOpenAIAnnotation(index)} loading={isCurrentProcessing} style={{ backgroundColor: 'rgba(24, 144, 255, 0.9)' }}>
                          AI标注
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }
        const displayValue = manualContent ?? streamingContent ?? record?.annotation?.response ?? text ?? ''
        const isCurrentProcessing = !isImageAnnotation && aiLoading
        return (
          <div className="flex flex-col gap-2 h-[calc(100vh-400px)] min-h-[400px] relative group">
            <Input.TextArea
              value={displayValue}
              onChange={(e) => {
                setManualContent(e.target.value)
              }}
              onBlur={(e) => {
                setManualContent(e.target.value)
              }}
              className="w-full flex-1 resize-none min-h-0"
              placeholder="请输入标注内容"
              readOnly={isSubmitted}
            />
            {!isSubmitted && !isAuditMode && (
              <Button className={aiAnnotationButtonClass} type="primary" size="small" icon={<RobotOutlined />} onClick={() => handleOpenAIAnnotation()} loading={isCurrentProcessing} style={{ backgroundColor: 'rgba(24, 144, 255, 0.9)' }}>
                AI标注
              </Button>
            )}
          </div>
        )
      },
    },
    {
      title: 'data_source',
      dataIndex: 'data_source',
      key: 'data_source',
      align: 'left',
      width: 220,
      hidden: !isGrpoAnnotation,
      render: (text: string) => renderTextBlock(text),
    },
    {
      title: 'prompt',
      dataIndex: 'prompt',
      key: 'grpo_prompt',
      align: 'left',
      width: 420,
      hidden: !isGrpoAnnotation,
      render: (text: string) => (
        <div
          className="max-w-full max-h-[calc(100vh-400px)] overflow-y-auto break-words whitespace-pre-wrap [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_img]:my-1"
          dangerouslySetInnerHTML={{ __html: text || '-' }}
        />
      ),
    },
    {
      title: 'reward_model',
      dataIndex: 'reward_model',
      key: 'reward_model',
      align: 'left',
      width: 360,
      hidden: !isGrpoAnnotation,
      render: (_value: unknown, record: AnnotationDataItem<string>) => {
        const displayValue = manualContent ?? streamingContent ?? record.reward_model?.ground_truth ?? ''
        const isCurrentProcessing = aiLoading
        return (
          <div className="group relative flex h-[calc(100vh-400px)] min-h-[400px] flex-col">
            <Input.TextArea
              value={displayValue}
              onChange={(e) => setManualContent(e.target.value)}
              onBlur={(e) => setManualContent(e.target.value)}
              className="w-full flex-1 resize-none min-h-0"
              placeholder="请输入 ground_truth"
              readOnly={isSubmitted}
            />
            {!isSubmitted && !isAuditMode && (
              <Button className={aiAnnotationButtonClass} type="primary" size="small" icon={<RobotOutlined />} onClick={() => handleOpenAIAnnotation()} loading={isCurrentProcessing} style={{ backgroundColor: 'rgba(24, 144, 255, 0.9)' }}>
                AI标注
              </Button>
            )}
          </div>
        )
      },
    },
    {
      title: 'ability',
      dataIndex: 'ability',
      key: 'ability',
      align: 'left',
      width: 160,
      hidden: !isGrpoAnnotation,
      render: (text: string) => renderTextBlock(text),
    },
    {
      title: 'extra_info',
      dataIndex: 'extra_info',
      key: 'extra_info',
      align: 'left',
      width: 260,
      hidden: !isGrpoAnnotation,
      render: (text: string) => renderTextBlock(text),
    },
    {
      title: 'Instruction',
      dataIndex: 'instruction',
      key: 'instruction',
      align: 'left',
      width: 260,
      hidden: !isDpoAnnotation || isDpoRoleBased,
      render: (text: string) => (
        <div className="max-w-full max-h-[calc(100vh-400px)] overflow-y-auto break-words whitespace-pre-wrap">
          {renderMarkdownBlock(text)}
        </div>
      ),
    },
    {
      title: 'Input',
      dataIndex: 'input',
      key: 'input',
      align: 'left',
      width: 260,
      hidden: !isDpoAnnotation || isDpoRoleBased,
      render: (text: string) => (
        <div className="max-w-full max-h-[calc(100vh-400px)] overflow-y-auto break-words whitespace-pre-wrap">
          {renderMarkdownBlock(text)}
        </div>
      ),
    },
    {
      title: 'Messages',
      dataIndex: 'messages',
      key: 'messages',
      align: 'left',
      width: 420,
      hidden: !isDpoRoleBased,
      render: (_: any, record: AnnotationDataItem<string>) => {
        const messages = Array.isArray(record.messages) ? record.messages : []
        if (messages.length === 0) {
          return <span className="text-gray-400">-</span>
        }
        return (
          <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto">
            {messages.map((msg: any, index: number) => (
              <div key={`${msg?.role || 'message'}-${index}`} className="rounded border border-gray-100 bg-gray-50 p-2">
                <Tag color={msg?.role === 'system' ? 'purple' : msg?.role === 'assistant' ? 'green' : msg?.role === 'user' ? 'blue' : 'default'} className="!mb-1">
                  {msg?.role || 'message'}
                </Tag>
                {renderMarkdownBlock(msg?.content)}
              </div>
            ))}
          </div>
        )
      },
    },
    {
      title: 'Chosen',
      dataIndex: 'chosen',
      key: 'chosen',
      align: 'left',
      width: 360,
      hidden: !isDpoAnnotation,
      render: (_: string, record: AnnotationDataItem<string>) => {
        const isCurrentProcessing = dpoProcessingTarget === 'chosen' && aiLoading
        const displayValue = isCurrentProcessing && streamingContent
          ? streamingContent
          : (dpoContents.chosen ?? record.chosen ?? '')
        return renderDpoEditor(displayValue, 'chosen', '请输入 Chosen 标注内容', isCurrentProcessing)
      },
    },
    {
      title: 'Rejected',
      dataIndex: 'rejected',
      key: 'rejected',
      align: 'left',
      width: 360,
      hidden: !isDpoAnnotation,
      render: (_: string, record: AnnotationDataItem<string>) => {
        const isCurrentProcessing = dpoProcessingTarget === 'rejected' && aiLoading
        const displayValue = isCurrentProcessing && streamingContent
          ? streamingContent
          : (dpoContents.rejected ?? record.rejected ?? '')
        return renderDpoEditor(displayValue, 'rejected', '请输入 Rejected 标注内容', isCurrentProcessing)
      },
    },
    {
      title: (
        <Popover
          content={(
            <Radio.Group
              value={annotationFilter}
              onChange={(e) => {
                handleFilterChange(e.target.value as 'all' | 'annotated' | 'unannotated')
              }}
              className="flex flex-col gap-2"
            >
              <Radio value="all">全部</Radio>
              <Radio value="unannotated">未标注</Radio>
              <Radio value="annotated">已完成</Radio>
            </Radio.Group>
          )}
          trigger="click"
          placement="bottomLeft"
        >
          <Space className="cursor-pointer">
            <span>标注进度</span>
            <FilterOutlined />
          </Space>
        </Popover>
      ),
      dataIndex: 'is_annotated',
      key: 'is_annotated',
      align: 'center',
      width: 120,
      hidden: isAuditMode,
      render: (_status: string, record: AnnotationDataItem<string>) => {
        const is_annotated = record?.is_annotated
        return <Badge status={is_annotated ? 'success' : 'default'} text={is_annotated ? '已完成' : '未标注'} />
      },
    },
    {
      title: '审核结果',
      dataIndex: 'audit_result',
      key: 'audit_result',
      align: 'center',
      width: 220,
      hidden: !isMultiPerson || dataList[0]?.status === 'pending' || dataList[0]?.status === 'saved',
      render: (_auditResult: string, record: AnnotationDataItem<string>) => {
        const audit_result = record?.audit_result
        const audit_reason = record?.audit_reason
        if (!audit_result) {
          return '未审核'
        }
        if (audit_result === 'passed') {
          return <Badge status="success" text="审核通过" />
        }
        const reasonPart = audit_reason ? `：${audit_reason}` : ''
        return <Badge status="error" text={`审核不通过${reasonPart}`} />
      },
    },
    {
      title: '操作',
      key: 'action',
      align: 'center',
      hidden: isSubmitted,
      width: isAuditMode ? 180 : 120,
      fixed: 'right' as const,
      render: (_: unknown, record: AnnotationDataItem<string>) => {
        const auditActionDisabled = auditSubmitting || (isReauditRound && record?.audit_result === 'passed')
        return isAuditMode
          ? (
              <Space>
                <Typography.Link onClick={handleAuditPass} disabled={auditActionDisabled} className={auditActionDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}>
                  审核通过
                </Typography.Link>
                <Typography.Link type="danger" onClick={handleAuditFailOpen} disabled={auditActionDisabled} className={auditActionDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}>
                  审核不通过
                </Typography.Link>
              </Space>
            )
          : (
              <Typography.Link onClick={handleSaveDraft} disabled={aiLoading || savingDraft || isMultiPersonPassedLocked} className={aiLoading || savingDraft || isMultiPersonPassedLocked ? 'cursor-not-allowed' : 'cursor-pointer'}>
                {savingDraft ? '保存中...' : '完成标注'}
              </Typography.Link>
            )
      },
    },
  ]
  return (
    <AnnotationDetailContent title={`${isAuditMode ? '审核详情' : '标注详情'}${taskName ? ` - ${taskName}` : ''}`}>
      <AnnotationDetailToolbar isSubmitted={isSubmitted} annotationFilter={annotationFilter} isAuditMode={isAuditMode} onFilterChange={handleFilterChange} onOpenConfig={handleOpenConfig} />

      <AnnotationDetailTableSection
        columns={columns}
        dataSource={dataList}
        loading={loading}
        isImageAnnotation={isImageAnnotation}
        onRowClick={(record, e) => {
          const target = e.target as HTMLElement
          if (!isInteractiveElement(target)) {
            toggleRowExpand(record)
          }
        }}
      />

      <AnnotationDetailFooter pagination={pagination} aiLoading={aiLoading} isSubmitted={isSubmitted} isAuditMode={isAuditMode} auditSubmitLoading={auditSubmitLoading} isCompleted={isCompleted} onPageChange={handlePageChange} onSubmitAudit={handleSubmitAudit} onSubmit={handleSubmit} />

      <AnnotationConfigModal
        visible={configModalVisible}
        taskId={taskId ? Number(taskId) : undefined}
        projectId={projectId}
        initialConfig={annotationConfig}
        modelType={resolvedContentTab === 'image' ? '图像理解' : '文本生成'}
        onCancel={() => {
          setConfigModalVisible(false)
        }}
        onConfirm={handleConfigConfirm}
      />

      <AuditRejectModal visible={auditRejectModalVisible} reason={auditRejectReason} loading={auditSubmitting} onReasonChange={setAuditRejectReason} onCancel={() => setAuditRejectModalVisible(false)} onConfirm={handleAuditFailConfirm} />

      <ImagePreviewModal visible={imagePreviewVisible} imageUrl={previewImageUrl} onClose={() => setImagePreviewVisible(false)} />
    </AnnotationDetailContent>
  )
}
export default AnnotationDetail
