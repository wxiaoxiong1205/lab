import type { ReactNode } from 'react'

export interface OptionItem {
  label: string
  value: string
  icon?: ReactNode
  disabled?: boolean
}
