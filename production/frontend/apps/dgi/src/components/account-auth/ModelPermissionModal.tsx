import { Empty, Modal, Tag } from 'antd'
import { useRequest } from 'ahooks'
import { $t } from '@/locales'
import useAuthStore from '@/stores/auth'
import { apiModelList } from '@/services/api'
import { apiService } from '@/services/apiService'

export interface ModelPermissionModalProps {
  open: boolean
  onCancel: () => void
  handleApply?: () => void
}

export default function ModelPermissionModal({
  open,
  onCancel,
  handleApply,
}: ModelPermissionModalProps) {
  const isAdmin = useAuthStore((state) => state.userInfo?.role === 100)

  const { data: visibleModelList } = useRequest(() => {
    return apiModelList({
      page_number: 1,
      page_size: 999,
      view: 'usable',
    }).then((res) => res.data.items.map((item) => item.model_name))
  }, {
    refreshDeps: [open],
  })

  const { data: visibleApiList } = useRequest(() => {
    return apiService.getApiList({
      page_number: 1,
      page_size: 999,
      view: 'usable',
    }).then((res) => res.items.map((item) => item.name))
  }, {
    refreshDeps: [open],
  })

  return (
    <Modal
      title={$t('资源权限')}
      open={open}
      onCancel={onCancel}
      width={640}
      footer={isAdmin ? null : undefined}
      okText={($t('申请使用权限'))}
      onOk={handleApply}
    >
      {isAdmin && (
        <div className="text-sm text-[#f59a23] py-2">
          {$t('当前用户角色为【模型推理管理员】，拥有所有模型和API使用权限')}
        </div>
      )}

      {/* 模型列表 */}
      <div className="text-base font-bold text-[#1289b9] py-2">{$t('账号可用模型')}</div>
      {visibleModelList?.length > 0 && visibleModelList ? (
        <div>
          {visibleModelList?.map((item) => {
            return <Tag className="!mb-2" key={item}>{item}</Tag>
          })}
        </div>
      ) : (
        <Empty description={<span className="text-sm text-[#999]">{$t('您当前没有可用模型')}</span>} />
      )}

      {/* API列表 */}
      <div className="text-base font-bold text-[#1289b9] py-2">{$t('账号可用API')}</div>
      {visibleApiList?.length > 0 && visibleApiList ? (
        <div>
          {visibleApiList?.map((item) => {
            return <Tag className="!mb-2" key={item}>{item}</Tag>
          })}
        </div>
      ) : (
        <Empty description={<span className="text-sm text-[#999]">{$t('您当前没有可用API')}</span>} />
      )}
    </Modal>
  )
}
