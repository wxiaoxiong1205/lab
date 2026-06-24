import { Empty, Input, Spin } from 'antd'
import type { ApiTestForwardResult } from '@/services/apiTest'
import { CodeView } from '@/components/CodeView'

/** 按 url_index 存储的单次测试结果 */
export type ApiTestResultByIndex = Record<number, { url: string, result: ApiTestForwardResult }>

const labelClass = 'text-[#fa8c16] font-medium text-base'

function formatResultText(res: ApiTestForwardResult): { text: string, language: 'json' | 'text' } {
  if (res.responseType === 'stream') {
    return { text: res.text, language: 'text' }
  }
  return {
    text: JSON.stringify(res.payload, null, 2),
    language: 'json',
  }
}

type Props = {
  /** 按 url_index 串行请求后的结果 */
  resultsByIndex?: ApiTestResultByIndex
  loading?: boolean
}

export default function MultiApiTestResultPanel({ resultsByIndex, loading }: Props) {
  const entries = resultsByIndex
    ? Object.keys(resultsByIndex)
        .map((k) => Number(k))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b)
        .map((index) => ({ index, ...resultsByIndex[index]! }))
    : []

  if (!entries.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无测试结果，点击右下角「测试」发起请求"
      />
    )
  }

  return (
    <div
      className="grid gap-6 grid-cols-1 md:grid-cols-2"
      style={{ alignItems: 'start' }}
    >
      {entries.map(({ index, url, result }) => {
        const label = `API${index + 1}`
        const { text, language } = formatResultText(result)
        return (
          <div key={index} className="flex min-w-0 flex-col gap-2">
            <Spin spinning={!!loading} tip="加载中..." key={index}>
              <div className={labelClass}>{label}</div>
              <Input
                readOnly
                value={url || ''}
                placeholder={`回显${label}的地址`}
                className="bg-[#fafafa]"
              />
              <div className="text-sm text-gray-600">返回内容：</div>
              <div className="rounded border border-gray-200 bg-[#fafafa] overflow-hidden">
                <CodeView
                  customStyle={{
                    height: '400px',
                    overflow: 'auto',
                    margin: 0,
                  }}
                  text={text || '暂无返回内容'}
                  language={language}
                />
              </div>
            </Spin>
          </div>
        )
      })}
    </div>
  )
}
