import React, { useState } from 'react'
import { Select, Space, Table, Tag } from 'antd'
import { PermissionHelper } from '@/utils/permission-helper'
import type { DataSecurityLevelOption, UserPermissionLevel } from '@/types/permission'

const { Option } = Select

interface PermissionExampleProps {
  // 可选的默认用户权限级别
  defaultUserLevel?: UserPermissionLevel
}

/**
 * 权限映射示例组件
 * 展示如何根据用户权限级别动态显示可访问的数据安全级别
 */
export const PermissionExample: React.FC<PermissionExampleProps> = ({
  defaultUserLevel = '非密',
}) => {
  const [selectedUserLevel, setSelectedUserLevel] = useState<UserPermissionLevel>(defaultUserLevel)
  const [dataSecurityLevels, setDataSecurityLevels] = useState<DataSecurityLevelOption[]>(
    PermissionHelper.getAvailableDataSecurityLevels(defaultUserLevel),
  )

  const handleUserLevelChange = (value: UserPermissionLevel) => {
    setSelectedUserLevel(value)
    setDataSecurityLevels(PermissionHelper.getAvailableDataSecurityLevels(value))
  }

  const userPermissionOptions = PermissionHelper.getUserPermissionLevelOptions()

  const columns = [
    {
      title: '数据安全级别',
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: '英文标识',
      dataIndex: 'value',
      key: 'value',
      render: (value: string) => <code>{value}</code>,
    },
    {
      title: '访问权限',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'red'}>
          {enabled ? '可访问' : '不可访问'}
        </Tag>
      ),
    },
  ]

  const enabledCount = dataSecurityLevels.filter((item) => item.enabled).length
  const disabledCount = dataSecurityLevels.filter((item) => !item.enabled).length

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-xl font-semibold mb-4">权限映射配置示例</h2>

      <div className="mb-6">
        <Space>
          <span>选择用户权限级别：</span>
          <Select
            value={selectedUserLevel}
            onChange={handleUserLevelChange}
            style={{ width: 200 }}
            placeholder="选择用户权限级别"
          >
            {userPermissionOptions.map((option) => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
        </Space>
      </div>

      <div className="mb-4">
        <Space>
          <Tag color="blue">
            总计：
            {dataSecurityLevels.length}
            {' '}
            个级别
          </Tag>
          <Tag color="green">
            可访问：
            {enabledCount}
            {' '}
            个
          </Tag>
          <Tag color="red">
            不可访问：
            {disabledCount}
            {' '}
            个
          </Tag>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={dataSecurityLevels}
        rowKey="value"
        pagination={false}
        size="small"
        rowClassName={(record) =>
          record.enabled ? 'bg-green-50' : 'bg-red-50'}
      />

      <div className="mt-6 p-4 bg-gray-50 rounded">
        <h3 className="text-sm font-medium mb-2">使用说明：</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• 绿色背景表示用户可以访问该数据安全级别</li>
          <li>• 红色背景表示用户无权访问该数据安全级别</li>
          <li>• 权限级别越高，可访问的数据安全级别越多</li>
          <li>
            • 可以通过
            <code>PermissionHelper</code>
            {' '}
            工具类进行权限检查
          </li>
        </ul>
      </div>
    </div>
  )
}

export default PermissionExample
