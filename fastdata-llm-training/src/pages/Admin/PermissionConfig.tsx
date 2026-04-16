import React, { useMemo, useState } from 'react'
import { Card, Checkbox, Empty, Input, Tabs, Tag, Tree, Typography } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { LockOutlined, SearchOutlined } from '@ant-design/icons'
import { OPERATION_PERMISSION_TREE, type PermissionTreeNode } from '../../services/permissionCatalog'
import { usePermissionStore } from '../../services/permissionStore'

const { Title, Text } = Typography

function filterTree(nodes: PermissionTreeNode[], keyword: string, disabled: boolean): DataNode[] {
  return nodes
    .map(node => {
      const filteredChildren = node.children?.length
        ? filterTree(node.children, keyword, disabled)
        : undefined
      const selfMatched = !keyword || node.label.toLowerCase().includes(keyword.toLowerCase())
      const shouldKeep = selfMatched || Boolean(filteredChildren?.length)

      if (!shouldKeep) {
        return null
      }

      return {
        key: node.key,
        title: node.label,
        disableCheckbox: disabled,
        disabled,
        children: filteredChildren,
      } satisfies DataNode
    })
    .filter(Boolean) as DataNode[]
}

const PermissionConfig: React.FC = () => {
  const permissionState = usePermissionStore()
  const [roleSearch, setRoleSearch] = useState('')
  const [permissionSearch, setPermissionSearch] = useState('')

  const filteredRoles = useMemo(
    () =>
      permissionState.roles.filter(role =>
        role.name.toLowerCase().includes(roleSearch.toLowerCase()),
      ),
    [permissionState.roles, roleSearch],
  )
  const [selectedRoleKey, setSelectedRoleKey] = useState(permissionState.roles[0]?.key ?? 'platform_admin')

  const selectedRole =
    filteredRoles.find(item => item.key === selectedRoleKey) ??
    permissionState.roles.find(item => item.key === selectedRoleKey) ??
    permissionState.roles[0]

  const treeData = useMemo(
    () => filterTree(OPERATION_PERMISSION_TREE, permissionSearch, Boolean(selectedRole?.lockedOperations)),
    [permissionSearch, selectedRole?.lockedOperations],
  )

  const checkedKeys = selectedRole?.operationPermissions ?? []

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      <Card style={{ borderRadius: 24, border: '1px solid #dbe5f3', minHeight: 'calc(100vh - 136px)' }}>
        <Title level={2} style={{ marginBottom: 24 }}>
          权限配置
        </Title>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '360px minmax(0, 1fr)',
            borderTop: '1px solid #edf2f7',
            minHeight: 620,
          }}
        >
          <div style={{ padding: '24px 24px 24px 0', borderRight: '1px solid #edf2f7' }}>
            <Title level={3} style={{ margin: '0 0 20px' }}>
              角色管理
            </Title>

            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="搜索角色名称"
              value={roleSearch}
              onChange={event => setRoleSearch(event.target.value)}
              style={{ height: 40, marginBottom: 20 }}
            />

            <div style={{ display: 'grid', gap: 12 }}>
              {filteredRoles.map(role => {
                const active = role.key === selectedRole?.key
                return (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => setSelectedRoleKey(role.key)}
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: 14,
                      border: active ? '1px solid #3b82f6' : '1px solid transparent',
                      background: active ? '#dbeafe' : '#fff',
                      boxShadow: active ? 'inset 0 0 0 1px rgba(59, 130, 246, 0.08)' : 'none',
                      cursor: 'pointer',
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#0f172a',
                    }}
                  >
                    {role.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ padding: '24px 0 24px 24px' }}>
            <Tabs
              activeKey="operations"
              items={[
                {
                  key: 'operations',
                  label: '操作权限',
                  children: selectedRole ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                        <Input
                          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                          placeholder="搜索操作权限"
                          value={permissionSearch}
                          onChange={event => setPermissionSearch(event.target.value)}
                          style={{ maxWidth: 360, height: 40 }}
                        />

                        <Checkbox checked={checkedKeys.length > 0} disabled>
                          全选
                        </Checkbox>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <Tag color="blue">{selectedRole.name}</Tag>
                        {selectedRole.lockedOperations && (
                          <Tag icon={<LockOutlined />} color="default">
                            初始化角色操作权限只读
                          </Tag>
                        )}
                        <Text type="secondary">
                          必须同时具备菜单权限、操作权限、项目权限方可执行操作。
                        </Text>
                      </div>

                      {treeData.length ? (
                        <div
                          style={{
                            border: '1px solid #edf2f7',
                            borderRadius: 18,
                            padding: 18,
                            minHeight: 520,
                            background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
                          }}
                        >
                          <Tree
                            checkable
                            selectable={false}
                            defaultExpandAll
                            checkedKeys={checkedKeys}
                            treeData={treeData}
                          />
                        </div>
                      ) : (
                        <Empty description="未检索到匹配的操作权限" style={{ paddingTop: 88 }} />
                      )}
                    </div>
                  ) : (
                    <Empty description="暂无角色" style={{ paddingTop: 88 }} />
                  ),
                },
              ]}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}

export default PermissionConfig
