import { useNavigate } from 'react-router-dom'
import { Button, Checkbox, Radio, Tooltip, message } from 'antd'
import { EyeOutlined, RocketOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { MouseEvent } from 'react'
import './index.css'
import React, { useMemo } from 'react'
import { ModelLogo } from './ModelLogo'
import { useTransform } from '@/locales'
import { getModelExperienceRoute } from '@/utils'
import { useSystemConfig } from '@/hooks/use-system-config'

interface ModelItem {
  data_level: string
  id: number
  model_name: string
  model_type: string
  description?: string
  logo?: string
  updated_time?: number
  model_count?: number
  category?: string
  security_policy?: string
  security_policy_out?: string
  ability_count?: number
  can_use?: string
  custom_attribute_values?: {
    attribute_id: number
    attribute_name: string
    value: string
  }[]
}

interface ModelCardProps {
  item: ModelItem
  selectable?: boolean
  selectMode?: 'single' | 'multiple'
  selected?: boolean
  disabled?: boolean
  onSelect?: (item: ModelItem, selected: boolean) => void
  showActions?: boolean
  isSanYuan?: boolean
  disableNavigation?: boolean
  className?: string
}

const ModelTag: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <span
      style={{
        color: 'rgba(38, 36, 76, 0.45)',
      }}
      className="inline-block bg-gray-100 text-xs h-5 px-2 text-center leading-5 rounded-sm mr-2 last:mr-0"
    >
      {children}
    </span>
  )
}

const ModelCard: React.FC<ModelCardProps> = ({
  item,
  selectable = false,
  selectMode = 'single',
  selected = false,
  disabled = false,
  onSelect,
  showActions = false,
  isSanYuan = false,
  disableNavigation = false,
  className = '',
}) => {
  const navigate = useNavigate()
  const { $t } = useTransform()
  const {
    modelTypeOptions,
    securityPolicyOptions,
    securityLevelEnabled,
    modelPermissionOptions,
  } = useSystemConfig(true)

  const ModelTags = useMemo<{ key: string, label: React.ReactNode }[]>(() => {
    const tags = []
    if (!isSanYuan) {
      tags.push({
        key: `perm-${String(item.can_use ?? '')}`,
        label:
          modelPermissionOptions.find((t) => t.value === item.can_use)?.label ?? '--',
      })
    }

    // 模型类型
    if (item.category) {
      item.category.split(',').forEach((m, i) => {
        const label = modelTypeOptions.find((t) => t.value === m)?.label || m
        tags.push({ key: `cat-${m}-${i}`, label })
      })
    }

    // 安全策略（输入/输出）
    const securityInLabel
      = securityPolicyOptions.find((t) => String(t.value) === String(item.security_policy ?? ''))?.label ?? '--'
    const securityOutLabel
      = securityPolicyOptions.find((t) => String(t.value) === String(item.security_policy_out ?? ''))?.label ?? '--'
    tags.push({
      key: `security-policy-in-${String(item.security_policy ?? '')}`,
      label: `${$t('输入')}-${securityInLabel}`,
    })
    tags.push({
      key: `security-policy-out-${String(item.security_policy_out ?? '')}`,
      label: `${$t('输出')}-${securityOutLabel}`,
    })

    // 数据安全等级
    if (securityLevelEnabled && item?.data_level) {
      tags.push({
        key: `security-level-${item.data_level}`,
        label: $t(item.data_level as keyof typeof $t),
      })
    }

    // 属性
    item.custom_attribute_values?.forEach((o) => {
      o.value.split(',').forEach((value, i) => {
        tags.push({
          key: `attr-${o.attribute_id}-${value}-${i}`,
          label: `${o.attribute_name}-${value}`,
        })
      })
    })
    return tags
  }, [
    isSanYuan,
    item,
    modelPermissionOptions,
    modelTypeOptions,
    securityPolicyOptions,
    securityLevelEnabled,
    $t,
  ])

  const handleClick = (e: MouseEvent) => {
    if (!selectable) {
      if (!disableNavigation) {
        navigate(`/model-space/${item.id}`)
      }
      return
    }
    handleSelect(e)
  }

  const handleSelect = (e: MouseEvent) => {
    e.stopPropagation()
    if (selectable && onSelect && !disabled) {
      onSelect(item, !selected)
    }
  }

  const handleViewDetails = (e: MouseEvent) => {
    e.stopPropagation()
    navigate(`/model-space/${item.id}`)
  }

  const handleExperience = (e: MouseEvent) => {
    e.stopPropagation()
    if (item.can_use !== 'usable') {
      message.error($t('用户无该模型使用权限。'))
      return
    }

    const url = getModelExperienceRoute(item.category, item.model_name)
    if (url) {
      navigate(url)
    }
    else {
      console.warn('未找到支持的模型类型:', item.category, item)
    }
  }

  return (
    <div
      style={{
        background:
          'radial-gradient(26% 84% at 4% 4%,rgba(221,220,229,.3) 0%,rgba(245,244,247,0) 94%),#fff',
        position: 'relative',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      className={[
        'model-card flex flex-col justify-between',
        className,
        selected ? 'selected' : '',
        showActions ? 'with-actions' : '',
        disabled ? 'disabled' : '',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
    >
      {selectable && (
        <div className="absolute top-2 right-2 z-10" onClick={handleSelect}>
          {selectMode === 'single' ? (
            <Radio checked={selected} disabled={disabled} />
          ) : (
            <Checkbox checked={selected} disabled={disabled} />
          )}
        </div>
      )}
      <div className="info-content flex-1 flex flex-col justify-between">
        <div className="flex gap-4">
          <ModelLogo name={item.model_name} logo={item.logo} size="medium" />
          <div className="flex flex-col gap-1">
            <p className="text-base mb-0 text-default">{item.model_name}</p>
            <div className="line-clamp-2 leading-6">
              <Tooltip title={ModelTags?.map((o) => o.label).join(',')}>
                {ModelTags?.map((o) => (
                  <ModelTag key={o.key}>{o.label}</ModelTag>
                ))}
              </Tooltip>
            </div>
          </div>
        </div>
        <div
          title={item.description || ''}
          className="text-xs text-label line-clamp-2 max-h-[32px] wrap-break-word"
        >
          {item.description || '--'}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          {/* <span>
            {$t('渠道数')}
            ：
            {item.ability_count ?? '-'}
          </span> */}
          <span>
            {$t('更新时间')}
            ：
            {item.updated_time
              ? dayjs.unix(item.updated_time).format('YYYY-MM-DD')
              : '-'}
          </span>
        </div>
      </div>
      {showActions
      && ['ChatCompletions', 'DeepReasoning', 'Vision_Language', 'Rerank', 'AudioTranscription', 'Realtime', 'AudioSpeech'].some((c) =>
        (item.category || '').split(',').includes(c),
      ) && (
        <div className="action-buttons">
          <Button
            size="small"
            onClick={handleViewDetails}
            icon={<EyeOutlined />}
          >
            {$t('查看详情')}
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={handleExperience}
            icon={<RocketOutlined />}
          >
            {$t('立即体验')}
          </Button>
        </div>
      )}
    </div>
  )
}

export default ModelCard
