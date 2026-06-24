import { PageContainer } from '@ant-design/pro-components'
// import { useIntl } from '@umijs/max';
import type { TabsProps } from 'antd'
import { useCallback, useState } from 'react'
import styled from 'styled-components'
import useTabActive from '@/hooks/use-tab-active'
import GPUs from '@/components/gpustacks/components/gpus'
import ModelFiles from '@/components/gpustacks/components/model-files'
import Workers from '@/components/gpustacks/components/workers'
import { $t } from '@/locales'

const Wrapper = styled.div`
  .ant-page-header-heading {
    padding-inline: 8px;
  }
  .ant-tabs-nav .ant-tabs-tab-active,
  .ant-tabs-tab {
    background: white;
  }
`

const Resources = () => {
  const { setTabActive, getTabActive, tabsMap } = useTabActive()
  const [activeKey, setActiveKey] = useState(
    getTabActive(tabsMap.resources) || 'workers',
  )

  //   const intl = useIntl();

  const items: TabsProps['items'] = [
    {
      key: 'workers',
      label: $t('主机'),
      children: <Workers />,
    },
    // {
    //   key: 'gpus',
    //   label: 'GPUs',
    //   children: <GPUs />
    // },
    {
      key: 'model-files',
      label: $t('模型文件'),
      children: <ModelFiles />,
    },
  ]

  const handleChangeTab = useCallback((key: string) => {
    setActiveKey(key)
    setTabActive(tabsMap.resources, key)
  }, [])

  return (
    <Wrapper>
      <PageContainer
        ghost
        header={{
          title: $t('模型部署'),
          style: {
            paddingInline: '4px',
            maxWidth: '100%',
            overflow: 'hidden',
            backgroundColor: 'white',
            padding: '10px',
          },
        }}
        style={{
          maxWidth: '100%',
          overflow: 'auto',
        }}
        tabList={items}
        onTabChange={handleChangeTab}
        tabActiveKey={activeKey}
        tabProps={{
          type: 'card',
          style: {
            maxWidth: '100%',
          },
        }}
        extra={[]}
      >
      </PageContainer>
    </Wrapper>
  )
}

export default Resources
