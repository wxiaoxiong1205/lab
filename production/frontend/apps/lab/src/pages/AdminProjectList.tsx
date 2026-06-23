import { useState } from 'react'
import type {
  TablePaginationConfig } from 'antd'
import {
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { projectApi } from '../services/api'
import { type SSHConfig, getCanUseKubernetesClusters, getSSHConfig } from '../services/kubernetesService'
import type { CreateProjectRequest, KubernetesCluster, Project } from '../types'
import useI18n from '../hooks/useI18n'
import SSHConfigModal from '../components/SSHConfigModal'
import { useProjectStore } from '../stores/projectStore'
import { useConfigStore } from '@/stores/configStore'
import NamespaceEditModal from '@/components/NamespaceEditModal'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import { DEFAULT_PAGE_SIZE_OPTIONS, defaultShowTotal } from '@/utils/tablePagination'
import TableToolbar from '@/components/common/TableToolbar'
import ProjectFormModal, { type ProjectFormValues } from '@/components/project/ProjectFormModal'
import './AdminProjectList.css'

const { Title } = Typography

const AdminProjectList = () => {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [isSSHConfigVisible, setIsSSHConfigVisible] = useState(false)
  const [sshConfig, setSshConfig] = useState<SSHConfig | null>(null)
  const [isLoadingSSHConfig, setIsLoadingSSHConfig] = useState(false)
  const [sshProjectId, setSshProjectId] = useState<number | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()
  const { currentProject: globalCurrentProject, setCurrentProject: setGlobalCurrentProject } = useProjectStore()
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [isNamespaceEditModalVisible, setIsNamespaceEditModalVisible] = useState(false)
  const [currentProjectId, setCurrentProjectId] = useState<number>()

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await projectApi.list({
        page: pagination.current,
        size: pagination.pageSize,
      })
      setPagination((prev) => ({ ...prev, total: res.total }))
      return res.items
    },
  })

  const { config, providerType } = useConfigStore()

  const { data: clusters = [] } = useQuery<KubernetesCluster[]>({
    queryKey: ['kubernetesClusters'],
    queryFn: () => getCanUseKubernetesClusters(),
  })

  // 公共的刷新项目列表逻辑
  const refreshProjectList = async () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    queryClient.invalidateQueries({ queryKey: ['admin-projects'] })
    await queryClient.refetchQueries({ queryKey: ['projects'] })
    await queryClient.refetchQueries({ queryKey: ['admin-projects'] })
  }

  const createProject = useMutation({
    mutationFn: projectApi.create,
    onSuccess: async () => {
      await refreshProjectList()
      message.success(t('project.createSuccess'))
      setIsModalVisible(false)
    },
    onError: () => {
      // message.error(t("project.createFailed") || "创建项目失败，请重试");
    },
  })

  const updateProject = useMutation({
    mutationFn: (project: Partial<Project> & { id: number }) => {
      const { id, ...updateData } = project
      return projectApi.update(id, updateData as CreateProjectRequest)
    },
    onSuccess: async () => {
      await refreshProjectList()
      message.success(t('project.updateSuccess'))
      setIsModalVisible(false)
    },
    onError: () => {
      // message.error(t("project.updateFailed") || "更新项目失败，请重试");
    },
  })

  const getProjectDetail = useMutation({
    mutationFn: projectApi.get,
    onSuccess: (projectDetail) => {
      // 项目详情可能包含 is_project_admin 字段
      setCurrentProject(projectDetail as Project)
      setIsModalVisible(true)
    },
    onError: () => {
      message.error(t('project.getDetailError'))
    },
  })

  const deleteProject = useMutation({
    mutationFn: projectApi.delete,
    onSuccess: async () => {
      await refreshProjectList()

      // 等待项目列表刷新完成后，获取所有项目列表进行检查
      // 使用与 ProjectLayout 相同的查询参数，确保获取完整的项目列表
      const updatedProjects = await queryClient.fetchQuery<Project[]>({
        queryKey: ['projects'],
        queryFn: async () => {
          const res = await projectApi.list({
            page: 1,
            size: 100,
          })
          return res.items
        },
      })

      // 检查当前项目是否还在列表中
      if (globalCurrentProject) {
        const isCurrentProjectStillExists = updatedProjects.some(
          (p) => p.id === globalCurrentProject.id,
        )

        // 如果当前项目不在列表中（被删除了），则选择列表中的第一条项目
        if (!isCurrentProjectStillExists && updatedProjects.length > 0) {
          const firstProject = updatedProjects[0]
          setGlobalCurrentProject(firstProject)
          // 如果当前不在admin路由，则导航到第一个项目的首页
          if (!location.pathname.includes('/project/admin/')) {
            navigate(`/project/${firstProject.id}/home`, { replace: true })
          }
        }
      }

      message.success(t('project.deleteSuccess'))
    },
    onError: () => {
      message.error(t('project.deleteFailed') || '删除项目失败，请重试')
    },
  })

  const handleAddNew = () => {
    setIsEditMode(false)
    setCurrentProject(null)
    setIsModalVisible(true)
  }

  const handleMemberManagement = () => navigate(`/project/admin/members`)
  const handleProjectMemberManagement = (projectId: number) =>
    navigate(`/project/admin/members?projectId=${projectId}`)
  const handleEdit = (project: Project) => {
    setIsEditMode(true)
    getProjectDetail.mutate(project.id)
  }
  const handleDelete = (id: number) => deleteProject.mutate(id)

  const handleCreateOrUpdate = (values: ProjectFormValues) => {
    if (isEditMode && currentProject) {
      updateProject.mutate({
        id: currentProject.id,
        ...values,
      })
    }
    else {
      createProject.mutate(values)
    }
  }

  const handleSSHConfig = async (id: number) => {
    setIsSSHConfigVisible(true)
    setIsLoadingSSHConfig(true)
    setSshProjectId(id)
    try {
      const sshConfig = await getSSHConfig(id)
      setSshConfig(sshConfig)
    }
    finally {
      setIsLoadingSSHConfig(false)
    }
  }

  const handleNamespaceEdit = (projectId: number) => {
    setIsNamespaceEditModalVisible(true)
    setCurrentProjectId(projectId)
  }

  const columns = [
    {
      title: t('project.name'),
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 140,
    },
    {
      title: t('project.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      maxWidth: 240,
    },
    {
      title: t('project.ProjectKubernetes'),
      dataIndex: 'kubernetes_name',
      hidden: config?.PROVIDER_TYPE === providerType,
      key: 'kubernetes_name',
    },
    {
      title: t('dataset.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_: any, record: Project) => {
        const actions: TableActionItem[] = [
          {
            key: 'edit',
            label: t('common.edit'),
            icon: <EditOutlined />,
            onClick: () => handleEdit(record),
          },
          {
            key: 'delete',
            label: t('common.delete'),
            icon: <DeleteOutlined />,
            danger: true,
            loading: deleteProject.isPending,
            confirm: {
              title: t('project.deleteConfirm'),
              description: t('project.deleteWarning'),
              onConfirm: () => handleDelete(record.id),
              okText: t('common.confirm'),
              cancelText: t('common.cancel'),
            },
          },
          // {
          //   key: 'ssh',
          //   label: 'SSH配置',
          //   visible: config?.PROVIDER_TYPE !== providerType,
          //   onClick: () => handleSSHConfig(record.id),
          // },
          { key: 'member', label: '成员管理', onClick: () => handleProjectMemberManagement(record.id) },
          { key: 'namespace', label: '镜像命名空间配置', onClick: () => handleNamespaceEdit(record.id) },
        ]
        return (
          <Space size={24} className="admin-project-actions">
            <TableActionColumn actions={actions} maxVisible={2} />
          </Space>
        )
      },
    },
  ]

  return (
    <div className="admin-project-list-container lab-list-page-shell">
      <Title level={4} className="mb-4">{t('project.management')}</Title>
      <TableToolbar
        toolbarActions={[
          {
            key: 'create',
            label: t('project.create'),
            type: 'primary',
            onClick: handleAddNew,
          },
          {
            key: 'member',
            label: t('project.member'),
            type: 'primary',
            onClick: handleMemberManagement,
          },
        ]}
      />

      <Table
        columns={columns}
        dataSource={projects}
        scroll={{ x: 'max-content' }}
        rowKey="id"
        loading={isLoading}
        pagination={{
          ...pagination,
          showTotal: defaultShowTotal,
          showSizeChanger: true,
          pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
        }}
        onChange={(pagination) => setPagination(pagination)}
      />

      <ProjectFormModal
        open={isModalVisible}
        mode={isEditMode ? 'edit' : 'create'}
        project={currentProject}
        clusters={clusters}
        showCluster={config?.PROVIDER_TYPE !== providerType}
        confirmLoading={createProject.isPending || updateProject.isPending || getProjectDetail.isPending}
        onCancel={() => setIsModalVisible(false)}
        onSubmit={handleCreateOrUpdate}
        afterClose={() => setCurrentProject(null)}
      />

      <SSHConfigModal
        visible={isSSHConfigVisible}
        onClose={() => setIsSSHConfigVisible(false)}
        sshConfig={sshConfig}
        isLoading={isLoadingSSHConfig}
        sshProjectId={sshProjectId}
      />

      <NamespaceEditModal
        projectId={currentProjectId}
        open={isNamespaceEditModalVisible}
        onCancel={() => setIsNamespaceEditModalVisible(false)}
      />
    </div>
  )
}

export default AdminProjectList
