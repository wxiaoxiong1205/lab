import { useState } from 'react'
import { Segmented } from 'antd'
import SensitiveWordsTable from './SensitiveWordsTable'
import SecuritySettingsForm from './SecuritySettingsForm'
import { $t, useTransform } from '@/locales'

const SEGMENTS = [
  { label: $t('敏感词库'), value: 'sensitive-words' },
  { label: $t('安全设置'), value: 'security-settings' },
]

export default function ContentSecurity() {
  const [tab, setTab] = useState('sensitive-words')
  const { $t } = useTransform()
  return (
    <div className="bg-white rounded-lg p-4">
      {/* <div className="mb-4 flex items-center justify-between">
        <Segmented options={SEGMENTS} value={tab} onChange={setTab} />
      </div> */}
      <div>
        {tab === 'sensitive-words' && (
          <div>
            {/* 敏感词库内容后续补充 */}
            <div className="text-gray-500 mb-4">
              {$t(
                '采用敏感词过滤算法，对敏感词泛化，通过敏感词库对违规问题拦截',
              )}
            </div>
            <SensitiveWordsTable />
          </div>
        )}
        {tab === 'security-settings' && (
          <div>
            {/* 安全设置内容后续补充 */}
            <div className="text-gray-500 mb-4">
              {$t(
                '配置后通过内容安全服务，识别请求内容的违规信息，保障安全与合规性。',
              )}
            </div>
            <SecuritySettingsForm />
          </div>
        )}
      </div>
    </div>
  )
}
