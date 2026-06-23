import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useTransform } from '@/locales'

export default function BackTabbar({
  label,
  backText,
  backFunc,
}: { label: string, backText?: string, backFunc: () => void }) {
  const { $t } = useTransform()
  return (
    <div
      className="flex items-center gap-2 mb-2 cursor-pointer"
      onClick={backFunc}
    >
      <Button
        icon={<ArrowLeftOutlined />}
        type="text"
        aria-label={label}
      />
      <span>{backText ?? $t('返回')}</span>
    </div>
  )
}
