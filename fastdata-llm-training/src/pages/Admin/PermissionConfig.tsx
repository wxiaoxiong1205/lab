import React, { useMemo, useState } from 'react'
import { Card, Checkbox, Empty, Input, Space, Tabs, Tag, Tree, Typography } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { SearchOutlined } from '@ant-design/icons'
import { OPERATION_PERMISSION_TREE, type PermissionTreeNode } from '../../services/permissionCatalog'
import {
  BUILT_IN_ROLE_KEYS,
  DATA_PERMISSION_DOMAINS,
  getVisibleRoles,
  updateRole,
  usePermissionStore,
  type PermissionRole,
  type RoleDataPermissions,
} from '../../services/permissionStore'

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

function isBuiltInRole(role?: PermissionRole): boolean {
  return Boolean(role && BUILT_IN_ROLE_KEYS.includes(role.key as (typeof BUILT_IN_ROLE_KEYS)[number]))
}

const PermissionConfig: React.FC = () => {
  const permissionState = usePermissionStore()
  const [roleSearch, setRoleSearch] = useState('')
  const [permissionSearch, setPermissionSearch] = useState('')
  const [selectedRoleKey, setSelectedRoleKey] = useState('project_admin')

  const visibleRoles = useMemo(() => getVisibleRoles(permissionState), [permissionState])
  const filteredRoles = useMemo(
    () => visibleRoles.filter(role => role.name.toLowerCase().includes(roleSearch.toLowerCase())),
    [roleSearch, visibleRoles],
  )

  const selectedRole =
    filteredRoles.find(item => item.key === selectedRoleKey) ??
    visibleRoles.find(item => item.key === selectedRoleKey) ??
    visibleRoles[0]

  const checkedKeys = selectedRole?.operationPermissions ?? []
  const editable = Boolean(selectedRole && !isBuiltInRole(selectedRole))

  const treeData = useMemo(
    () => filterTree(OPERATION_PERMISSION_TREE, permissionSearch, !editable),
    [editable, permissionSearch],
  )

  const updateOperationPermissions = (keys: React.Key[] | { checked: React.Key[] }) => {
    if (!selectedRole || !editable) {
      return
    }
    const nextKeys = Array.isArray(keys) ? keys : keys.checked
    updateRole(selectedRole.key, { operationPermissions: nextKeys.map(String) })
  }

  const updateDataPermission = (domain: keyof RoleDataPermissions, all: boolean) => {
    if (!selectedRole || !editable) {
      return
    }
    updateRole(selectedRole.key, {
      dataPermissions: {
        ...selectedRole.dataPermissions,
        [domain]: { all },
      },
    })
  }

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      <Card style={{ borderRadius: 24, border: '1px solid #dbe5f3', minHeight: 'calc(100vh - 136px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div>
            <Title level={2} style={{ marginBottom: 8 }}>
              权限配置
            </Title>
            <Text type="secondary">
              配置角色在 Lab 内的操作权限和数据权限。
            </Text>
          </div>
        </div>

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
                      color: '#0f172a',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{role.name}</span>
                    </div>
                    <div style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>
                      全部数据：{DATA_PERMISSION_DOMAINS.filter(item => role.dataPermissions[item.key].all).map(item => item.label).join('、') || '无'}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ padding: '24px 0 24px 24px' }}>
            <Tabs
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
                        <Text type="secondary">
                          必须同时具备菜单权限、操作权限、项目权限和数据权限方可执行操作。
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
                            onCheck={updateOperationPermissions}
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
                {
                  key: 'data',
                  label: '数据权限',
                  children: selectedRole ? (
                    <div style={{ display: 'grid', gap: 16 }}>
                      <Text type="secondary">
                        每个模块默认拥有“个人数据/任务”权限且不可取消；勾选“全部数据”后，可在拥有操作权限的基础上操作其他人的数据和任务。
                      </Text>
                      {DATA_PERMISSION_DOMAINS.map(domain => (
                        <Card key={domain.key} size="small" style={{ borderRadius: 16, border: '1px solid #e5e7eb' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 16 }}>{domain.label}</div>
                            </div>
                            <Space size={24}>
                              <Checkbox checked disabled>个人数据/任务</Checkbox>
                              <Checkbox
                                checked={selectedRole.dataPermissions[domain.key].all}
                                disabled={!editable}
                                onChange={event => updateDataPermission(domain.key, event.target.checked)}
                              >
                                全部数据
                              </Checkbox>
                            </Space>
                          </div>
                        </Card>
                      ))}
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
