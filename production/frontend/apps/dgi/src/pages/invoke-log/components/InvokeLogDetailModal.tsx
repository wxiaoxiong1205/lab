import type {
  CollapseProps,
  DescriptionsProps } from 'antd'
import {
  Button,
  Collapse,
  Descriptions,
  Divider,
  Drawer,
  Modal,
  Segmented,
  Tag,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import copy from 'copy-to-clipboard'
import { CopyOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'

import SecurityTag from './SecurityTag'
import { useTransform } from '@/locales'
import { useSystemConfig } from '@/hooks/use-system-config'
import { apiInvokeLogDetail } from '@/services/api'

interface InvokeLogItem {
  answer: string
  channelId: number
  createdTime: number
  elapsedTime: number
  inputTokens: number
  modelName: string
  outputTokens: number
  question: string
  requestBody: string
  responseBody: string
  tokenId: number
  tokenName: string
  totalTokens: number
  userid: number
  username: string
  search_time: string
  isStream: boolean
  securityLayer?: number
  auditResult?: string
  auditInputTime?: number
  auditInputContent?: string
  usedQuota?: number
  riskLevel?: string
}

type InvokeLogDescriptionItem =
  NonNullable<DescriptionsProps['items']>[number] & {
    hidden?: boolean
  }

interface InvokeLogDetailModalProps {
  open: boolean
  onCancel: () => void
  params: {
    log_id: string
    start_timestamp: string
    end_timestamp: string
    hasLargeFields?: boolean
  }
  type: 'model' | 'api'
}

export default function InvokeLogDetailModal({
  open,
  onCancel,
  params,
  type = 'model',
}: InvokeLogDetailModalProps) {
  const { $t } = useTransform()
  const { amountSymbol, quotaPerUnit } = useSystemConfig(true)

  const { data: logData, loading } = useRequest(
    () =>
      apiInvokeLogDetail({
        ...params,
        hasLargeFields: params.hasLargeFields ?? true,
      }).then((res) => res.data),
    {
      ready: !!open,
      refreshDeps: [
        params?.log_id,
        params?.start_timestamp,
        params?.end_timestamp,
        open,
      ],
    },
  )

  const QAContent = () => {
    const [model, setModel] = useState('qa')
    const isQaModel = model === 'qa'

    const TextContent = ({
      content,
      think,
    }: {
      content: string
      think?: string
    }) => {
      const items: CollapseProps['items'] = [
        {
          key: '1',
          label: $t('深度思考'),
          children: (
            <p className="border-l-[2px] border-l-[#e5e5e5] pl-[13px] text-[#8b8b8b]">
              {think}
            </p>
          ),
        },
      ]
      return (
        <div className="bg-[#f9fafb] w-full h-[calc(50vh-260px)] overflow-y-auto my-4 p-2 whitespace-break-spaces">
          {think && <Collapse items={items} ghost defaultActiveKey={['1']} />}
          <p>
            {' '}
            {content}
          </p>
        </div>
      )
    }

    const JSONContent = ({ content }: { content: string }) => {
      const onCopy = () => {
        copy(content)
        message.success('复制成功！')
      }
      return (
        <div className="relative">
          <div className="absolute right-2 top-2 text-white">
            <Button size="small" icon={<CopyOutlined />} onClick={onCopy} />
          </div>

          <pre className="bg-[#000] text-white w-full my-4 p-2 h-[calc(50vh-260px)] overflow-y-auto">
            {content}
          </pre>
        </div>
      )
    }
    const answerContent = logData?.answer ?? ''

    // 答案可能是字符串可能是对象
    let responseJson = logData?.responseBody || ''
    if (logData?.isStream === false) {
      if (typeof responseJson === 'string') {
        try {
          responseJson = JSON.stringify(JSON.parse(responseJson), null, 2)
        }
        catch (error) {
          console.error(error)
        }
      }
      else if (typeof responseJson === 'object') {
        responseJson = JSON.stringify(responseJson, null, 2)
      }
    }

    const thinkReg = /<think>(.*?)<\/think>/
    return (
      <div className="w-full max-h-[calc(100vh-360px)] overflow-hidden">
        <Segmented<string>
          options={[
            {
              label: $t('问答'),
              value: 'qa',
            },
            {
              label: $t('JSON'),
              value: 'json',
            },
          ]}
          onChange={(value) => {
            setModel(value)
          }}
        />
        <div className="mt-4 w-full">
          <Tag color="blue">{$t('问题')}</Tag>
          {isQaModel ? (
            <TextContent
              content={
                Array.isArray(logData?.question)
                  ? logData?.question[0].text
                  : logData?.question
              }
            />
          ) : (
            <JSONContent
              content={JSON.stringify(logData?.requestBody || {}, null, 2)}
            />
          )}
        </div>
        <div>
          <Tag color="green">{$t('答案')}</Tag>
          {isQaModel ? (
            <TextContent
              think={thinkReg.exec(answerContent)?.[1] ?? ''}
              content={answerContent.replace(thinkReg, '')}
            />
          ) : (
            <JSONContent content={responseJson} />
          )}
        </div>
      </div>
    )
  }

  const items: InvokeLogDescriptionItem[] = [
    {
      key: type === 'model' ? 'modelName' : 'apiName',
      label: type === 'model' ? $t('模型名称') : $t('API名称'),
      children: type === 'model' ? logData?.modelName : logData?.apiName,
      span: type === 'model' ? 2 : 3,
    },
    {
      key: 'tokenName',
      label: $t('密钥名称'),
      children: logData?.tokenName || '--',
    },
    {
      key: 'totalTokens',
      label: $t('总 Token'),
      hidden: type === 'api',
      children: logData?.totalTokens,
    },
    {
      key: 'inputTokens',
      label: $t('输入 Token'),
      hidden: type === 'api',
      children: logData?.inputTokens,
    },
    {
      key: 'outputTokens',
      label: $t('输出 Token'),
      hidden: type === 'api',
      children: logData?.outputTokens,
    },
    {
      key: 'elapsedTime',
      label: $t('耗时(S)'),
      children: logData?.elapsedTime ? logData?.elapsedTime / 1000 : '--',
      span: 1,
    },
    {
      key: 'duration',
      label: $t('语音时长(S)'),
      // hidden: logData?.channelName !== 'realtime',
      children: logData?.duration ? logData?.duration / 1000 : '--',
      span: 1,
    },
    {
      key: 'usedQuota',
      label: $t('花费'),
      children: logData?.usedQuota
        ? `${amountSymbol}${logData?.usedQuota}`
        : '--',
      span: 2,
    },
    {
      key: 'auditResult',
      label: $t('审核标签'),
      span: 1,
      hidden: type === 'api',
      children: (
        <SecurityTag
          auditResult={logData?.auditResult}
          securityLayer={logData?.blockLayer}
          riskLevel={logData?.riskLevel}
        />
      ),
    },
    {
      key: 'riskLevel',
      label: $t('敏感级别'),
      span: 1,
      hidden: type === 'api',
      children: logData?.riskLevel || '--',
    },
    {
      key: 'elapsedTime',
      label: $t('审核耗时(s)'),
      hidden: type === 'api',
      children: logData?.elapsedTime
        ? logData.elapsedTime.toFixed(2)
        : '--',
      span: 2,
    },
    {
      key: 'auditInputContent',
      label: $t('审核内容'),
      hidden: type === 'api',
      children: logData?.auditInputContent,
      span: 3,
    },
    // {
    //   key: "10",
    //   label: "问答信息",
    //   span: 3,
    //   children: <QAContent />,
    // },
  ]

  return (
    <Drawer
      title={$t('日志详情')}
      open={open}
      onClose={onCancel}
      width={800}
      footer={null}
    >
      {loading ? (
        <div className="flex justify-center items-center h-32">
          <span>{$t('加载中...')}</span>
        </div>
      ) : (
        <>
          <Descriptions items={items.filter((item) => !item.hidden)} />
          <Divider />
          <QAContent />
        </>
      )}
    </Drawer>
  )
}
