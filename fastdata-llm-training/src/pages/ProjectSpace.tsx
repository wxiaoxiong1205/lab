import React, { useMemo, useState } from 'react'
import {
  Card,
  Input,
  Typography,
  Empty,
  Button,
  Space,
} from 'antd'
import { SearchOutlined, FolderOpenOutlined, StarFilled, AppstoreOutlined, ClusterOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  getAccessibleProjects,
  getCurrentUser,
  setCurrentProject,
  usePermissionStore,
} from '../services/permissionStore'

const { Title, Text, Paragraph } = Typography

const ProjectSpace: React.FC = () => {
  const navigate = useNavigate()
  const permissionState = usePermissionStore()
  const currentUser = getCurrentUser(permissionState)
  const projects = getAccessibleProjects(permissionState)
  const [searchValue, setSearchValue] = useState('')
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null)

  const filteredProjects = useMemo(
    () =>
      projects.filter(project => {
        const keyword = searchValue.trim().toLowerCase()
        if (!keyword) return true
        return (
          project.name.toLowerCase().includes(keyword) ||
          project.description.toLowerCase().includes(keyword)
        )
      }),
    [projects, searchValue],
  )

  const handleEnterProject = (projectId: string, mode: 'llm' | 'ml') => {
    setCurrentProject(projectId, mode)
    navigate(mode === 'llm' ? '/datasets' : '/machine-data-management')
  }

  return (
    <div style={{ padding: '34px 40px 40px', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ marginBottom: 0, fontSize: 22 }}>
          项目空间
        </Title>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 22,
        }}
      >
        <div
          style={{
            flex: 1,
            maxWidth: 420,
            background: 'rgba(255,255,255,0.76)',
            borderRadius: 18,
            padding: 4,
            border: '1px solid rgba(148, 163, 184, 0.18)',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="项目空间名称"
            value={searchValue}
            onChange={event => setSearchValue(event.target.value)}
            style={{
              height: 46,
              border: 'none',
              boxShadow: 'none',
              background: 'transparent',
            }}
          />
        </div>
      </div>

      {filteredProjects.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 22,
          }}
        >
          {filteredProjects.map(project => (
            <Card
              key={project.id}
              hoverable
              onMouseEnter={() => setHoveredProjectId(project.id)}
              onMouseLeave={() => setHoveredProjectId(current => (current === project.id ? null : current))}
              style={{
                borderRadius: 24,
                border: '1px solid rgba(226, 232, 240, 0.95)',
                boxShadow: '0 8px 28px rgba(15, 23, 42, 0.05)',
                minHeight: 252,
                cursor: 'pointer',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.9) 100%)',
              }}
              styles={{ body: { padding: '28px 28px 22px' } }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
                <div
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: 999,
                    background: '#f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      background: '#fbbf24',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      position: 'relative',
                    }}
                  >
                    <FolderOpenOutlined style={{ fontSize: 22 }} />
                    <StarFilled
                      style={{
                        position: 'absolute',
                        right: 5,
                        bottom: 5,
                        fontSize: 10,
                        color: '#fff',
                      }}
                    />
                  </div>
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <Title level={3} style={{ margin: 0, fontSize: 19, lineHeight: 1.4 }}>
                    {project.name}
                  </Title>
                  <Paragraph
                    type="secondary"
                    style={{ marginTop: 12, minHeight: 66, fontSize: 14, lineHeight: 1.65 }}
                    ellipsis={{ rows: 3 }}
                  >
                    {project.description || '暂无项目描述'}
                  </Paragraph>
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px solid #eef2f7',
                  marginTop: 28,
                  paddingTop: 18,
                  color: '#64748b',
                  fontSize: 13,
                }}
              >
                创建人：{currentUser.account}
              </div>

              {hoveredProjectId === project.id && (
                <div
                  style={{
                    marginTop: 18,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <Button
                    type="primary"
                    icon={<AppstoreOutlined />}
                    style={{ flex: 1, borderRadius: 14, height: 42 }}
                    onClick={event => {
                      event.stopPropagation()
                      handleEnterProject(project.id, 'llm')
                    }}
                  >
                    大模型
                  </Button>
                  <Button
                    icon={<ClusterOutlined />}
                    style={{ flex: 1, borderRadius: 14, height: 42 }}
                    onClick={event => {
                      event.stopPropagation()
                      handleEnterProject(project.id, 'ml')
                    }}
                  >
                    机器学习
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card style={{ borderRadius: 24, border: '1px solid #e2e8f0' }}>
          <Empty description="当前账号暂无可访问项目" style={{ paddingBlock: 72 }} />
        </Card>
      )}
    </div>
  )
}

export default ProjectSpace
