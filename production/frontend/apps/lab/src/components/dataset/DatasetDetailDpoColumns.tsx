import React, { useCallback } from 'react'
import { Tag } from 'antd'
import ExpandableCell from '@/components/common/ExpandableCell.tsx'
import MdPreview from '@/components/md-preview'
import { replaceImagePlaceholders } from '@/utils/imageUtils.ts'

interface UseDatasetDetailDpoColumnsParams {
  expandedCells: Set<string>
  toggleCellExpand: (rowKey: string, columnKey: string) => void
  handleCellHeightChange: (rowKey: string | number, columnKey: string, height: number) => void
  getRowMaxHeight: (rowKey: string | number) => number | undefined
}

export const useDatasetDetailDpoColumns = ({
  expandedCells,
  toggleCellExpand,
  handleCellHeightChange,
  getRowMaxHeight,
}: UseDatasetDetailDpoColumnsParams) => {
  const createDpoRoleBasedDataContentColumns = useCallback((getRowKey: (record: any) => any) => {
    const renderCell = (
      text: string,
      record: any,
      columnKey: string,
      bgColor: string,
      borderColor: string,
      content?: React.ReactNode,
    ) => {
      const rowKey = getRowKey(record)
      const baseRowKey = rowKey?.toString() || '0'
      return (
        <ExpandableCell
          text={text || ''}
          content={content}
          rowKey={rowKey}
          columnKey={columnKey}
          bgColor={bgColor}
          borderColor={borderColor}
          isExpanded={expandedCells.has(`${rowKey}-${columnKey}`)}
          onToggle={toggleCellExpand}
          onHeightChange={handleCellHeightChange}
          synchronizedHeight={getRowMaxHeight(baseRowKey)}
        />
      )
    }

    const renderMarkdownCell = (
      text: string,
      record: any,
      columnKey: string,
      bgColor: string,
      borderColor: string,
    ) => renderCell(
      text,
      record,
      columnKey,
      bgColor,
      borderColor,
      text ? <MdPreview content={text} /> : undefined,
    )

    const getRoleTagColor = (role?: string) => {
      const normalizedRole = role || 'message'
      const roleColorMap: Record<string, string> = {
        system: 'purple',
        user: 'blue',
        assistant: 'green',
      }
      return roleColorMap[normalizedRole] || 'default'
    }

    const getRoleLabel = (role?: string) => {
      const normalizedRole = role || 'message'
      return normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1)
    }

    const replaceImagePlaceholdersWithMarkdown = (
      content: string,
      images: string[],
      baseUrl: string,
      startIndex: number,
    ): { processedContent: string, nextIndex: number } => {
      if (!content || images.length === 0) {
        return { processedContent: content || '', nextIndex: startIndex }
      }

      let imageIndex = startIndex
      const imageBaseUrl = import.meta.env.DEV
        ? `${import.meta.env.VITE_PREFIX_BASE_URL}/api/v1/storage/download/`
        : '/lab-backend/api/v1/storage/download/'

      const processedContent = content.replace(/<image>/g, () => {
        if (imageIndex >= images.length) return '<image>'

        const imagePath = images[imageIndex]
        const fileName = imagePath.includes('/') ? imagePath.split('/').pop() : imagePath
        const imageUrl = `${imageBaseUrl}${baseUrl}/${fileName}`
        imageIndex++

        return `![Image](${imageUrl})`
      })

      return { processedContent, nextIndex: imageIndex }
    }

    const renderMessagesContent = (record: any) => {
      const messages = Array.isArray(record.messages) ? record.messages : []
      const images = Array.isArray(record.images) ? record.images : []
      const baseUrl = record.base_url || ''
      let imageIndex = 0

      return (
        <div className="space-y-3">
          {messages.map((item: any, index: number) => {
            const { processedContent, nextIndex } = replaceImagePlaceholdersWithMarkdown(
              item?.content || '',
              images,
              baseUrl,
              imageIndex,
            )
            imageIndex = nextIndex

            return (
              <div key={`${item?.role || 'message'}-${index}`}>
                <Tag color={getRoleTagColor(item?.role)} className="!mb-1">
                  {getRoleLabel(item?.role)}
                </Tag>
                <MdPreview content={processedContent} />
              </div>
            )
          })}
        </div>
      )
    }

    const getMessagesText = (record: any) => {
      const messages = Array.isArray(record.messages) ? record.messages : []
      const images = Array.isArray(record.images) ? record.images : []
      const baseUrl = record.base_url || ''
      let imageIndex = 0

      return messages.map((item: any) => {
        const { processedContent, nextIndex } = replaceImagePlaceholders(
          item?.content || '',
          images,
          baseUrl,
          imageIndex,
        )
        imageIndex = nextIndex

        return `${getRoleLabel(item?.role)}\n${processedContent}`
      }).join('\n\n')
    }

    return [
      {
        title: '序号',
        dataIndex: 'id',
        key: 'id',
        width: 80,
        align: 'center' as const,
        fixed: 'left' as const,
        render: (text: any) => (
          <span className="font-semibold text-blue-500 text-sm">{text}</span>
        ),
      },
      {
        title: 'Messages',
        dataIndex: 'messages',
        key: 'messages',
        width: 520,
        align: 'left' as const,
        ellipsis: { showTitle: false },
        getExpandKeys: (record: any, rowKey: any) => [`${rowKey?.toString() || '0'}-messages`],
        render: (_: string, record: any) => renderCell(getMessagesText(record), record, 'messages', '#f0f9ff', '#1890ff', renderMessagesContent(record)),
      },
      {
        title: 'Chosen',
        dataIndex: ['chosen', 'content'],
        key: 'chosen',
        width: 360,
        align: 'left' as const,
        ellipsis: { showTitle: false },
        getExpandKeys: (record: any, rowKey: any) => [`${rowKey?.toString() || '0'}-chosen`],
        render: (_: string, record: any) => renderMarkdownCell(record.chosen?.content || '', record, 'chosen', '#f6ffed', '#52c41a'),
      },
      {
        title: 'Rejected',
        dataIndex: ['rejected', 'content'],
        key: 'rejected',
        width: 360,
        align: 'left' as const,
        ellipsis: { showTitle: false },
        getExpandKeys: (record: any, rowKey: any) => [`${rowKey?.toString() || '0'}-rejected`],
        render: (_: string, record: any) => renderMarkdownCell(record.rejected?.content || '', record, 'rejected', '#fff1f0', '#ff4d4f'),
      },
    ]
  }, [expandedCells, toggleCellExpand, handleCellHeightChange, getRowMaxHeight])

  const createDpoAlpacaDataContentColumns = useCallback((getRowKey: (record: any) => any) => {
    const renderCell = (
      text: string,
      record: any,
      columnKey: string,
      bgColor: string,
      borderColor: string,
      content?: React.ReactNode,
    ) => {
      const rowKey = getRowKey(record)
      const baseRowKey = rowKey?.toString() || '0'
      return (
        <ExpandableCell
          text={text || ''}
          content={content}
          rowKey={rowKey}
          columnKey={columnKey}
          bgColor={bgColor}
          borderColor={borderColor}
          isExpanded={expandedCells.has(`${rowKey}-${columnKey}`)}
          onToggle={toggleCellExpand}
          onHeightChange={handleCellHeightChange}
          synchronizedHeight={getRowMaxHeight(baseRowKey)}
        />
      )
    }

    const renderMarkdownCell = (
      text: string,
      record: any,
      columnKey: string,
      bgColor: string,
      borderColor: string,
    ) => renderCell(
      text,
      record,
      columnKey,
      bgColor,
      borderColor,
      text ? <MdPreview content={text} /> : undefined,
    )

    return [
      {
        title: '序号',
        dataIndex: 'id',
        key: 'id',
        width: 80,
        align: 'center' as const,
        fixed: 'left' as const,
        render: (text: any) => (
          <span className="font-semibold text-blue-500 text-sm">{text}</span>
        ),
      },
      {
        title: 'Instruction',
        dataIndex: 'instruction',
        key: 'instruction',
        width: 340,
        align: 'left' as const,
        ellipsis: { showTitle: false },
        getExpandKeys: (record: any, rowKey: any) => [`${rowKey?.toString() || '0'}-instruction`],
        render: (text: string, record: any) => renderMarkdownCell(text, record, 'instruction', '#f0f9ff', '#1890ff'),
      },
      {
        title: 'Input',
        dataIndex: 'input',
        key: 'input',
        width: 300,
        align: 'left' as const,
        ellipsis: { showTitle: false },
        getExpandKeys: (record: any, rowKey: any) => [`${rowKey?.toString() || '0'}-input`],
        render: (text: string, record: any) => renderMarkdownCell(text, record, 'input', '#fff7e6', '#faad14'),
      },
      {
        title: 'Chosen',
        dataIndex: 'chosen',
        key: 'chosen',
        width: 360,
        align: 'left' as const,
        ellipsis: { showTitle: false },
        getExpandKeys: (record: any, rowKey: any) => [`${rowKey?.toString() || '0'}-chosen`],
        render: (text: string, record: any) => renderMarkdownCell(text, record, 'chosen', '#f6ffed', '#52c41a'),
      },
      {
        title: 'Rejected',
        dataIndex: 'rejected',
        key: 'rejected',
        width: 360,
        align: 'left' as const,
        ellipsis: { showTitle: false },
        getExpandKeys: (record: any, rowKey: any) => [`${rowKey?.toString() || '0'}-rejected`],
        render: (text: string, record: any) => renderMarkdownCell(text, record, 'rejected', '#fff1f0', '#ff4d4f'),
      },
    ]
  }, [expandedCells, toggleCellExpand, handleCellHeightChange, getRowMaxHeight])

  return {
    createDpoRoleBasedDataContentColumns,
    createDpoAlpacaDataContentColumns,
  }
}
