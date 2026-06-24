import { withApiPath, withBasePath } from '@/utils'

interface ModelLogoProps {
  name?: string
  logo?: string
  size?: 'small' | 'medium' | 'large' | string
  className?: string
  onClick?: () => void
}

export const ModelLogo = ({ name, logo, size = 'medium', className = '', onClick }: ModelLogoProps) => {
  const sizeClass = {
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-20 h-20',
  }
  return (
    <img
      alt={name}
      src={withApiPath(logo) || withBasePath('/DGI-icon.png')}
      className={`${sizeClass[size as keyof typeof sizeClass] || size} object-contain bg-gray-50 ${className}`}
      onClick={onClick}
    />
  )
}
