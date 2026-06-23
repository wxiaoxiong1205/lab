import { Tag, Tooltip } from 'antd'
import type { FC } from 'react'
import { useSystemConfig } from '@/hooks/use-system-config'

interface SecurityTagProps {
  auditResult?: string
  securityLayer?: number
  className?: string
  riskLevel?: string
  showTooltip?: boolean
}

const SecurityTag: FC<SecurityTagProps> = ({
  auditResult,
  securityLayer,
  className,
  riskLevel,
  showTooltip = true,
}) => {
  const { securityPolicyOptions } = useSystemConfig(true)
  if (auditResult === '无审核') {
    return (
      <Tag color="#bfbfbf" className={className}>
        无审核
      </Tag>
    )
  }
  if (auditResult === '安全') {
    return (
      <Tag color="#52c41a" className={className}>
        安全
      </Tag>
    )
  }
  // if (auditResult === "敏感输入") {
  //   return (
  //     <Tag color="#ff7a45" className={className}>
  //       敏感输入
  //     </Tag>
  //   );
  // }
  // if (auditResult === "敏感输出") {
  //   return (
  //     <Tag color="#ff7a45" className={className}>
  //       敏感输出
  //     </Tag>
  //   );
  // }
  if (auditResult === '敏感输入' || auditResult === '敏感输出') {
    const securityPolicy = securityPolicyOptions.find(
      (m) => m.value === securityLayer,
    )
    const tag = (
      <Tag color="#ff7a45" className={className}>
        {auditResult}
      </Tag>
    )

    if (showTooltip) {
      return (
        <Tooltip
          title={(
            <pre>
              <div>
                安全策略：
                {securityPolicy?.label}
              </div>
              <div>
                敏感级别：
                {riskLevel || '--'}
              </div>
            </pre>
          )}
        >
          {tag}
        </Tooltip>
      )
    }

    return tag
  }
  return '--'
}

export default SecurityTag
