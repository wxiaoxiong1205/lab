import type { ComponentPropsWithoutRef } from 'react'
import { withBasePath } from '@/utils/path'

const svgModules = import.meta.glob('../../assets/svg/*.svg', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const toCamelCase = (value: string) => {
  return value.replace(/[-_](\w)/g, (_, letter: string) => letter.toUpperCase())
}

const svgIcons = Object.fromEntries(
  Object.entries(svgModules).map(([path, url]) => {
    const fileName = path.split('/').pop()?.replace(/\.svg$/, '') ?? ''
    return [toCamelCase(fileName), url]
  }),
)

export type SvgIconName = string

export interface SvgIconProps extends Omit<ComponentPropsWithoutRef<'img'>, 'src'> {
  name: SvgIconName
}

const SvgIcon = ({ name, alt = '', className, ...props }: SvgIconProps) => {
  const src = svgIcons[name]
  if (!src) return null
  const resolvedSrc = withBasePath(src)

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      {...props}
    />
  )
}

export default SvgIcon
