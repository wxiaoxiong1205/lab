import type { ListItem as WorkerListItem } from '@/components/gpustacks/config/types'
import _ from 'lodash'
import React, { useEffect, useMemo } from 'react'
import styled from 'styled-components'
import type { ModelInstanceListItem } from '../config/types'
import '../style/instance-item.css'
import InstanceItem from './instance-item'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`

interface InstanceItemProps {
  list: ModelInstanceListItem[]
  workerList: WorkerListItem[]
  modelData?: any
  currentExpanded?: string
  handleChildSelect: (val: string, item: ModelInstanceListItem) => void
}

const Instances: React.FC<InstanceItemProps> = ({
  list,
  workerList,
  modelData,
  currentExpanded,
  handleChildSelect,
}) => {
  const [firstLoad, setFirstLoad] = React.useState(true)

  const defaultOpenId = useMemo(() => {
    if (!currentExpanded) {
      return ''
    }
    const current: any = _.find(
      list,
      (item: ModelInstanceListItem) => item.worker_id,
    )
    return current ? current.name : ''
  }, [currentExpanded, list])

  useEffect(() => {
    setFirstLoad(false)
  }, [])

  return (
    <Wrapper>
      {_.map(list, (item: ModelInstanceListItem, index: number) => {
        return (
          <InstanceItem
            key={item.name}
            modelData={modelData}
            workerList={workerList}
            instanceData={item}
            defaultOpenId={firstLoad ? defaultOpenId : ''}
            handleChildSelect={handleChildSelect}
          >
          </InstanceItem>
        )
      })}
    </Wrapper>
  )
}
export default Instances
