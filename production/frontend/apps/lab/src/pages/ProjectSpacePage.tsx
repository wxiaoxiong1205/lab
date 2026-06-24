import { useMemo, useState } from 'react'
import { Button, Card, Dropdown, Empty, Input, Modal, Select, Spin, Typography, message } from 'antd'
import { AppstoreOutlined, EllipsisOutlined, PlusOutlined, RobotOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import cn from 'classnames'
import { projectApi } from '@/services/api'
import { getCanUseKubernetesClusters } from '@/services/kubernetesService'
import { useAuthStore } from '@/stores/authStore'
import { useConfigStore } from '@/stores/configStore'
import { useProjectStore } from '@/stores/projectStore'
import SvgIcon from '@/components/common/SvgIcon'
import ProjectFormModal, { type ProjectFormValues } from '@/components/project/ProjectFormModal'
import type { CreateProjectRequest, KubernetesCluster, MenuItem, Project } from '@/types'

const { Paragraph, Text, Title } = Typography
const HOME_MENU_CODE = 'home'
const WORKSPACE_ROOT_STORAGE_KEY = 'lab-project-workspace-root-code'
// const PROJECT_SPACE_STATUS_OPTIONS = [{ label: '全部状态', value: 'all' }]
const findFirstMenuPath = (menuItems: MenuItem[]): string | null => {
  const sortedItems = [...menuItems].sort((a, b) => a.sort - b.sort)
  for (const item of sortedItems) {
    if (item.pathUrl && !item.pathUrl.startsWith('/admin/')) {
      return item.pathUrl
    }
    if (item.children?.length) {
      const childPath = findFirstMenuPath(item.children)
      if (childPath)
        return childPath
    }
  }
  return '/home'
}
const isSystemMenu = (item: MenuItem) => {
  const code = item.code?.toLowerCase?.() ?? ''
  // const name = item.name ?? ''
  return [
    code === 'admin',
    // code.includes('admin'),
    // code.includes('system'),
    // code.includes('platform'),
    // name.includes('系统'),
    // name.includes('平台'),
    // item.pathUrl?.startsWith('/admin/'),
  ].some(Boolean)
}
const ProjectSpacePage = () => {
  const navigate = useNavigate()
  const { userMenus } = useAuthStore()
  const { setCurrentProject } = useProjectStore()
  const { config, providerType } = useConfigStore()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [projectStatus, setProjectStatus] = useState('all')
  const [isProjectModalVisible, setIsProjectModalVisible] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [activeDropdownProjectId, setActiveDropdownProjectId] = useState<number | null>(null)
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => projectApi.list({ page: 1, size: 100 }).then((res) => res.items),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })
  const { data: clusters = [] } = useQuery<KubernetesCluster[]>({
    queryKey: ['kubernetesClusters'],
    queryFn: () => getCanUseKubernetesClusters(),
  })
  const filteredProjects = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword)
      return projects
    return projects.filter((project) => project.name.toLowerCase().includes(normalizedKeyword)
      || project.description?.toLowerCase().includes(normalizedKeyword))
  }, [keyword, projects])
  const workspaceRootMenus = useMemo(() => {
    return userMenus
      .filter((item) => item.code !== HOME_MENU_CODE)
      .filter((item) => !isSystemMenu(item))
  }, [userMenus])
  const handleOpenProject = (project: Project, menuItem: MenuItem) => {
    const targetPath = findFirstMenuPath([menuItem])
    sessionStorage.setItem(WORKSPACE_ROOT_STORAGE_KEY, menuItem.code)
    setCurrentProject(project)
    navigate(`/project/${project.id}${targetPath || '/home'}`, {
      state: {
        workspaceRootCode: menuItem.code,
      },
    })
  }
  const refreshProjectList = async () => {
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-projects'] })
  }
  const createProject = useMutation({
    mutationFn: projectApi.create,
    onSuccess: async () => {
      await refreshProjectList()
      message.success('创建成功')
      setIsProjectModalVisible(false)
    },
    onError: () => {
      message.error('创建项目失败，请重试')
    },
  })
  const getProjectDetail = useMutation({
    mutationFn: projectApi.get,
    onSuccess: (projectDetail) => {
      setEditingProject(projectDetail as Project)
      setIsProjectModalVisible(true)
    },
    onError: () => {
      message.error('获取项目信息失败')
    },
  })
  const updateProject = useMutation({
    mutationFn: (project: Partial<Project> & {
      id: number
    }) => {
      const { id, ...updateData } = project
      return projectApi.update(id, updateData as CreateProjectRequest)
    },
    onSuccess: async () => {
      await refreshProjectList()
      message.success('编辑成功')
      setIsProjectModalVisible(false)
    },
    onError: () => {
      message.error('编辑失败')
    },
  })
  const deleteProject = useMutation({
    mutationFn: projectApi.delete,
    onSuccess: async () => {
      await refreshProjectList()
      message.success('删除成功')
    },
    onError: () => {
      message.error('删除项目失败，请重试')
    },
  })
  const handleEditProject = (project: Project) => {
    getProjectDetail.mutate(project.id)
  }
  const handleCreateProject = () => {
    setEditingProject(null)
    setIsProjectModalVisible(true)
  }
  const handleDeleteProject = (project: Project) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除项目 ${project.name} 吗？删除后将无法恢复。`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteProject.mutateAsync(project.id),
    })
  }
  const handleSubmitProject = (values: ProjectFormValues) => {
    if (editingProject) {
      updateProject.mutate({
        id: editingProject.id,
        ...values,
      })
    }
    else {
      createProject.mutate(values)
    }
  }
  return (
    <div className="p-[20px_24px_0] min-h-[calc(100vh_-_60px)]" style={{ background: 'rgba(248,249,250,1)' }}>
      <div className="w-[1200px] max-w-[100%] m-[0_auto]">
        <div className="mb-[20px] flex h-[40px] items-center justify-between">
          <Title level={4} className="!mb-0 !text-[20px] !font-medium !leading-[28px] !text-[rgba(24,24,25,1)]">
            项目空间
          </Title>
          <div className="flex items-center gap-2.5">
            {/* <Select value={projectStatus} options={PROJECT_SPACE_STATUS_OPTIONS} className="[&_.ant-select-selector]:!h-[40px] [&_.ant-select-selector]:!rounded-[6px] [&_.ant-select-selector]:!border-[rgba(231,232,233,1)] [&_.ant-select-selector]:!bg-white [&_.ant-select-selection-item]:!text-[14px] [&_.ant-select-selection-item]:!leading-[38px] [&_.ant-select-selection-item]:!text-[rgba(31,31,31,1)] w-[114px] h-[40px]" onChange={setProjectStatus} /> */}
            <Input placeholder="搜索" allowClear prefix={<SearchOutlined />} value={keyword} className="!h-[40px] !rounded-[6px] !border-[rgba(231,232,233,1)] !bg-white !text-[14px] !leading-[20px] [&_.ant-input-prefix]:!mr-[8px] [&_.ant-input-prefix]:!text-[18px] [&_.ant-input-prefix]:!text-[rgba(31,31,31,1)] [&_input::placeholder]:!text-[rgba(159,164,172,1)] w-[200px]" onChange={(event) => setKeyword(event.target.value)} />
            <Button type="primary" className="!h-[40px] !w-[88px] !rounded-[6px] !border-none !bg-[rgba(0,71,187,1)] !text-[16px] !font-normal !leading-[22px] !text-white" icon={<PlusOutlined />} onClick={handleCreateProject}>
              新增
            </Button>
          </div>
        </div>

        {isLoading
          ? (
              <div className="flex justify-center pt-[120px]">
                <Spin size="large" />
              </div>
            )
          : filteredProjects.length === 0
            ? (
                <Card>
                  <Empty description="暂无项目" />
                </Card>
              )
            : (
                <div
                  className="grid gap-x-[20px] gap-y-[20px]"
                  style={{
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  }}
                >
                  {filteredProjects.map((project) => (
                    <Card key={project.id} className="group !h-[185px] !w-[386px] !rounded-[6px] !border-none !bg-white !shadow-none !transition-shadow hover:!shadow-[2px_2px_8px_rgba(0,0,0,0.12)] [&_.ant-card-body]:!relative [&_.ant-card-body]:!h-full [&_.ant-card-body]:!p-0">
                      <Text strong className="!absolute !left-[20px] !top-[20px] !block !max-w-[250px] !overflow-hidden !truncate !text-[16px] !font-medium !leading-[24px] !text-[rgba(31,31,31,1)]" title={project.name}>
                        {project.name}
                      </Text>
                      <Paragraph className="!absolute !left-[20px] !top-[48px] !m-0 !w-[246px] !text-[14px] !font-normal !leading-[20px] !text-[rgba(112,118,127,1)]" ellipsis={{ rows: 2, expandable: false }}>
                        {project.description || '暂无项目描述'}
                      </Paragraph>
                      <SvgIcon name="projectSpaceIcon" className="absolute right-[20px] top-[20px] h-[60px] w-[60px]" />
                      <div className="absolute left-[20px] top-[94px] flex h-[17px] items-center gap-[4px] text-[12px] leading-[17px] text-[rgba(112,118,127,1)]">
                        <UserOutlined className="!text-[12px]" />
                        <span>workbench</span>
                      </div>
                      <div className="absolute left-[20px] top-[125px] h-px w-[346px] border-t border-[rgba(233,236,239,0.5)]" />
                      <div className="absolute left-[20px] top-[138px] z-[2] flex h-[36px] gap-[10px]">
                        {/* <div className="flex w-[300px] gap-[10px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100"> */}
                        <div className="flex w-[300px] gap-[10px]">
                          {workspaceRootMenus.slice(0, 2).map((menuItem, index) => (
                            <Button
                              key={menuItem.code}
                              type={index === 0 ? 'primary' : 'default'}
                              icon={index === 0 ? <AppstoreOutlined /> : <RobotOutlined />}
                              className={[
                                '!h-[36px] !w-[145px] !rounded-[6px] !text-[16px] !font-normal !leading-[22px]',
                                index === 0
                                  ? '!border-none !text-white ![background:linear-gradient(90deg,rgba(82,133,247,1)_0%,rgba(0,84,221,1)_100%)]'
                                  : '!border-[rgba(216,217,220,1)] !bg-white !text-[rgba(31,31,31,1)]',
                              ].join(' ')}
                              onClick={() => handleOpenProject(project, menuItem)}
                            >
                              {menuItem.name}
                            </Button>
                          ))}
                        </div>
                        <Dropdown
                          open={activeDropdownProjectId === project.id}
                          placement="bottomLeft"
                          trigger={['click']}
                          onOpenChange={(open) => setActiveDropdownProjectId(open ? project.id : null)}
                          menu={{
                            items: [
                              {
                                key: 'edit',
                                label: `编辑信息`,
                                onClick: () => handleEditProject(project),
                              },
                              {
                                key: 'delete',
                                label: '删除',
                                danger: true,
                                onClick: () => handleDeleteProject(project),
                              },
                            ],
                          }}
                        >
                          <Button type="text" className={cn('!h-[36px] !w-[36px] !rounded-[6px] !border-none !bg-transparent !px-0 !text-[18px] !text-[rgba(39,47,59,1)] hover:![background-color:rgba(244,246,248,1)]', activeDropdownProjectId === project.id && '![background-color:rgba(244,246,248,1)]')} icon={<EllipsisOutlined />} />
                        </Dropdown>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
      </div>
      <ProjectFormModal open={isProjectModalVisible} mode={editingProject ? 'edit' : 'create'} project={editingProject} clusters={clusters} showCluster={config?.PROVIDER_TYPE !== providerType} confirmLoading={createProject.isPending || updateProject.isPending || getProjectDetail.isPending} onCancel={() => setIsProjectModalVisible(false)} onSubmit={handleSubmitProject} afterClose={() => setEditingProject(null)} />
    </div>
  )
}
export default ProjectSpacePage
