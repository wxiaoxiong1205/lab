import ContentSecurity from '../other-settings/components/ContentSecurity'
import Title from '@/components/Title'
import { useTransform } from '@/locales'

export default function SensitiveWords() {
  const { $t } = useTransform()
  return (
    <div className="bg-white min-h-full rounded-lg p-6">
      <Title title={$t('敏感词库')} />
      <ContentSecurity />
    </div>
  )
}
