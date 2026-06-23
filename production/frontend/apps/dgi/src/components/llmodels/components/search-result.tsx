import SimpleOverlay from '@/components/simple-overlay'
import { SearchOutlined } from '@ant-design/icons'
import { Button, Empty, Spin } from 'antd'
import _ from 'lodash'
import React, { useMemo } from 'react'
import 'simplebar-react/dist/simplebar.min.css'
import styled from 'styled-components'
import '../style/search-result.module.css'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { modelSourceMap } from '../config'
import SearchInput from './search-input'
import HFModelItem from './hf-model-item'
import FileSkeleton from './file-skeleton'

interface SearchResultProps {
  resultList: any[]
  onSelect?: (item: any) => void
  current?: string
  source?: string
  style?: React.CSSProperties
  loading?: boolean
  networkError?: boolean
  isEvaluating?: boolean
}

const ItemFileWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  gap: 24px;
`

const SpinWrapper = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  bottom: 0;
  display: flex;
  justify-content: center;
`

const SearchResult: React.FC<SearchResultProps> = (props) => {
  const { resultList, onSelect, isEvaluating, source, networkError } = props

  const handleSelect = (e: any, item: any) => {
    e.stopPropagation()
    onSelect?.(item)
  }
  const handleOnEnter = (e: any, item: any) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      onSelect?.(item)
    }
  }

  const renderEmpty = useMemo(() => {
    if (networkError) {
      return (
        <Empty
          imageStyle={{ height: 'auto', marginTop: '20px' }}
          image={(
            <ExclamationCircleOutlined
              style={{
                color: 'var(--ant-color-text-tertiary)',
                fontSize: '66px',
              }}
            />
          )}
          description={
            source === modelSourceMap.huggingface_value ? (
              <div className="flex-column gap-5">
                <span>
                  网络错误
                </span>
                <span>
                  <span>
                    您可以直接访问
                  </span>
                  <Button
                    type="link"
                    size="small"
                    href="https://huggingface.co/"
                    target="_blank"
                  >
                    Hugging Face
                  </Button>
                </span>
              </div>
            ) : null
          }
        />
      )
    }
    return (
      <Empty
        imageStyle={{ height: 'auto', marginTop: '20px' }}
        image={(
          <SearchOutlined
            className="font-size-16"
            style={{ color: 'var(--ant-color-text-tertiary)' }}
          >
          </SearchOutlined>
        )}
        description="暂无搜索结果"
      />
    )
  }, [networkError, source])

  return (
    <SimpleOverlay style={{ height: 'calc(100vh - 224px)' }}>
      <div style={{ ...props.style }} className="search-result-wrap">
        <Spin spinning={props.loading}>
          <div style={{ minHeight: 200 }}>
            {resultList.length ? (
              <ItemFileWrapper>
                {resultList.map((item, index) => (
                  <div
                    key={item.name}
                    onClick={(e) => handleSelect(e, item)}
                    onKeyDown={(e) => handleOnEnter(e, item)}
                  >
                    <HFModelItem
                      source={source}
                      tags={item.tags}
                      key={index}
                      title={item.name}
                      downloads={item.downloads}
                      likes={item.likes}
                      task={item.task}
                      updatedAt={item.updatedAt}
                      evaluateResult={item.evaluateResult}
                      active={item.id === props.current}
                      isEvaluating={isEvaluating}
                    />
                  </div>
                ))}
              </ItemFileWrapper>
            ) : props.loading ? (
              <ItemFileWrapper>
                {_.times(10, (index: number) => {
                  return (
                    <FileSkeleton
                      key={index}
                      counts={3}
                      itemHeight={82}
                    >
                    </FileSkeleton>
                  )
                })}
              </ItemFileWrapper>
            ) : (
              renderEmpty
            )}
          </div>
        </Spin>
      </div>
    </SimpleOverlay>
  )
}

export default SearchResult
