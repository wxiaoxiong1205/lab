import { Tabs, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router-dom'
import { useProjectStore } from '@/stores/projectStore'
import BusinessTestingDatasetTab from '@/components/dataset/BusinessTestingDatasetTab'
import '../DirectoryManagement.css'

const { Title, Text } = Typography

export default function BusinessTest() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const currentProject = useProjectStore((state) => state.currentProject)
  const [searchParams, setSearchParams] = useSearchParams({ key: 'test' })
  const activeKey = searchParams.get('key')

  // 优先使用URL中的projectId，如果没有则使用store中的
  const numericProjectId = projectId
    ? parseInt(projectId, 10)
    : currentProject?.id

  if (!numericProjectId) {
    return <div>{t('common.selectProject') || '请选择项目'}</div>
  }

  return (
    <div className="directory-management-page">
      <div className="directory-management-header">
        <Title level={4} className="directory-management-title">
          {t('sidebar.BusinessTestDatasets', '业务测试数据管理')}
        </Title>
      </div>
      <div className="directory-management-description">
        <Text type="secondary">
          管理业务测试数据集，适用于模型效果评估场景。
        </Text>
      </div>

      <Tabs
        className="directory-management-tabs"
        activeKey={activeKey}
        onChange={(key) => {
          setSearchParams({ key })
        }}
        items={[
          {
            key: 'test',
            label: '业务测试数据集',
            children: <BusinessTestingDatasetTab projectId={numericProjectId} />,
          },
        ]}
      />
    </div>
  )
}
