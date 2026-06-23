import { type UIEvent, useEffect, useState } from 'react'
import { Form, Input, Modal, Select } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiUsersList } from '@/services/api'
import type { KubernetesCluster, Project, User } from '@/types'
import useI18n from '@/hooks/useI18n'
import { useConfigStore } from '@/stores/configStore'

export interface ProjectFormValues {
  name: string
  description?: string
  kubernetes_id?: number
  admin_user_ids?: number[]
}

interface ProjectFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  project?: Project | null
  clusters: KubernetesCluster[]
  showCluster: boolean
  confirmLoading?: boolean
  onCancel: () => void
  onSubmit: (values: ProjectFormValues) => void
  afterClose?: () => void
}

const ProjectFormModal = ({
  open,
  mode,
  project,
  clusters,
  showCluster,
  confirmLoading,
  onCancel,
  onSubmit,
  afterClose,
}: ProjectFormModalProps) => {
  const { t } = useI18n()
  const { config, providerType } = useConfigStore()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ProjectFormValues>()
  const [userPage, setUserPage] = useState(1)
  const [userSearch, setUserSearch] = useState('')
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [hasMoreUsers, setHasMoreUsers] = useState(true)
  const isBelleProvider = config?.PROVIDER_TYPE === providerType

  const { data: usersPageData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users-list', userPage, userSearch],
    queryFn: () =>
      apiUsersList({
        page: userPage,
        size: 50,
        username: userSearch?.trim() || undefined,
        scope: 'create_project',
      }),
    enabled: open && !isBelleProvider,
    staleTime: 0,
    gcTime: 0,
  })

  const initUserState = () => {
    setUserPage(1)
    setUserSearch('')
    setAllUsers([])
    setHasMoreUsers(true)
  }

  useEffect(() => {
    if (!open) return

    if (mode === 'edit' && project) {
      form.setFieldsValue({
        name: project.name,
        description: project.description,
        kubernetes_id: project.kubernetes_id,
        admin_user_ids: project.admin_user_ids,
      })
    }
    else {
      form.resetFields()
    }
  }, [form, mode, open, project])

  useEffect(() => {
    if (!usersPageData || !open) return
    const newUsers = usersPageData.items || usersPageData.rows || []
    const total = usersPageData.total || 0
    setAllUsers((prev) => {
      const updatedUsers = userPage === 1 ? newUsers : [...prev, ...newUsers]
      setHasMoreUsers(updatedUsers.length < total)
      return updatedUsers
    })
  }, [open, userPage, usersPageData])

  const handleUserSearch = (value: string) => {
    setUserSearch(value)
    setUserPage(1)
    setAllUsers([])
    setHasMoreUsers(true)
  }

  const handleUserPopupScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    if (!isLoadingUsers && hasMoreUsers && target.scrollTop + target.offsetHeight >= target.scrollHeight - 10) {
      setUserPage((prev) => prev + 1)
    }
  }

  const handleAfterClose = () => {
    queryClient.removeQueries({ queryKey: ['users-list'] })
    initUserState()
    form.resetFields()
    afterClose?.()
  }

  const isProjectAdminSelectDisabled = mode === 'edit'
    && project?.is_platform_admin !== true
    && project?.is_tenant_admin !== true

  return (
    <Modal
      title={mode === 'edit' ? t('project.edit') : t('project.create')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      confirmLoading={confirmLoading}
      afterClose={handleAfterClose}
    >
      <Form form={form} onFinish={onSubmit} layout="vertical">
        <Form.Item
          name="name"
          label={t('project.name')}
          rules={[{ required: true, message: t('project.nameRequired') }]}
        >
          <Input maxLength={50} />
        </Form.Item>
        {!isBelleProvider && (
          <Form.Item
            name="admin_user_ids"
            label="项目管理员"
            rules={[{ required: true, message: '请选择项目管理员' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择要添加的用户，支持多选"
              showSearch
              loading={isLoadingUsers}
              onSearch={handleUserSearch}
              onPopupScroll={handleUserPopupScroll}
              filterOption={false}
              disabled={isProjectAdminSelectDisabled}
              listHeight={200}
            >
              {allUsers.map((user) => (
                <Select.Option key={user.userId} value={user.userId}>
                  {user.username}
                </Select.Option>
              ))}
              {hasMoreUsers && (
                <Select.Option disabled key="loading">
                  {isLoadingUsers ? '加载中...' : '滚动加载更多'}
                </Select.Option>
              )}
            </Select>
          </Form.Item>
        )}
        {showCluster && (
          <Form.Item
            name="kubernetes_id"
            label={t('project.cluster')}
            rules={[{ required: true, message: t('project.clusterRequired') }]}
          >
            <Select
              placeholder={t('project.selectCluster')}
              disabled={mode === 'edit'}
            >
              {clusters.map((cluster) => (
                <Select.Option key={cluster.id} value={Number(cluster.id)}>
                  {cluster.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}
        <Form.Item name="description" label={t('project.description')}>
          <Input.TextArea maxLength={1000} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default ProjectFormModal
