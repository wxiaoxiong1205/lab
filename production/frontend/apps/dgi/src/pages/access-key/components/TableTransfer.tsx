import React from 'react'
import { Table, Transfer } from 'antd'
import type { GetProp, TableColumnsType, TableProps, TransferProps } from 'antd'
import { useTransform } from '@/locales'

type TransferItem = GetProp<TransferProps, 'dataSource'>[number]
type TableRowSelection<T extends object> = TableProps<T>['rowSelection']

export interface DataType {
  id: number
  logo: string
  model_name: string
  category: string
  created_time: number
  updated_time: number
  creator: string
  security_policy: string
  ability_count: number
}

interface TableTransferProps extends TransferProps<TransferItem> {
  dataSource: DataType[] | undefined
  leftColumns: TableColumnsType<DataType>
  rightColumns: TableColumnsType<DataType>
}

// Customize Table Transfer
export const TableTransfer: React.FC<TableTransferProps> = (props) => {
  const { leftColumns, rightColumns, titles, locale, ...restProps } = props as any
  const { $t } = useTransform()

  const defaultTitles = [$t('待添加模型'), $t('已添加模型')]
  const defaultLocale = {
    itemUnit: $t('模型'),
    itemsUnit: $t('模型'),
    searchPlaceholder: $t('请输入模型名称'),
  }
  return (
    <Transfer
      style={{ width: '100%', height: '100%' }}
      {...restProps}
      titles={titles ?? defaultTitles}
      locale={{ ...defaultLocale, ...(locale ?? {}) }}
    >
      {({
        direction,
        filteredItems,
        onItemSelect,
        onItemSelectAll,
        selectedKeys: listSelectedKeys,
        disabled: listDisabled,
      }) => {
        const columns = direction === 'left' ? leftColumns : rightColumns
        const rowSelection: TableRowSelection<TransferItem> = {
          getCheckboxProps: () => ({ disabled: listDisabled }),
          onChange(selectedRowKeys) {
            onItemSelectAll(selectedRowKeys, 'replace')
          },
          selectedRowKeys: listSelectedKeys,
        }

        return (
          <Table
            rowSelection={rowSelection}
            columns={columns}
            dataSource={filteredItems}
            size="small"
            scroll={{ y: 600 }}
            style={{ pointerEvents: listDisabled ? 'none' : undefined }}
            onRow={({ key, disabled: itemDisabled }) => ({
              onClick: () => {
                if (itemDisabled || listDisabled) {
                  return
                }
                onItemSelect(key, !listSelectedKeys.includes(key))
              },
            })}
          />
        )
      }}
    </Transfer>
  )
}
