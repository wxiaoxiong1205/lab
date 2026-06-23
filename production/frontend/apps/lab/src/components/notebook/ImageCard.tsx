import { Card, Tag, Tooltip, Typography } from 'antd'
import './ImageCard.css'
import type { GetTagsListTagsData } from '@/types/tags'
import { getImageDisplayParts } from '@/utils/parseImage'

const { Title, Text } = Typography

export const ImageCard = ({
  image,
  onClick,
}: {
  image: {
    name: string
    image_address?: string
    /** 自定义镜像展示用完整镜像地址，优先于 image_address 参与解析 */
    output_image?: string
    describe: string
    created_at: string
    created_by: string
    tags: GetTagsListTagsData[]
  }
  onClick?: () => void
}) => {
  const [namespace, imageName, tag] = getImageDisplayParts(image.output_image ?? image.image_address)

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {namespace && imageName && tag
        ? (
            <div className="mb-3 flex flex-col gap-1">
              <div className="flex items-start">
                <span className="w-[72px] shrink-0 text-gray-500">命名空间：</span>
                <span className="min-w-0 flex-1 break-all font-bold">{namespace}</span>
              </div>
              <div className="flex items-start">
                <span className="w-[72px] shrink-0 text-gray-500">名称：</span>
                <span className="min-w-0 flex-1 break-all font-bold">{imageName}</span>
              </div>
              <div className="flex items-start">
                <span className="w-[72px] shrink-0 text-gray-500">镜像版本：</span>
                <span className="min-w-0 flex-1 break-all font-bold">{tag}</span>
              </div>
            </div>
          )
        : (
            <Tooltip title={image.name} className="image-card-tooltip">
              <Title level={5} className="image-card-text">
                {image.name}
              </Title>
            </Tooltip>
          )}
      <Tooltip title={image.describe || '-'} className="image-card-tooltip">
        <Text type="secondary" className="image-card-describe">
          {image.describe || '-'}
        </Text>
      </Tooltip>
      {image.created_by && (
        <Text className="block mb-1 text-[13px]">
          创建人：
          {' '}
          {image.created_by}
        </Text>
      )}
      <Text className="block mb-1 text-[13px]">
        创建时间:
        {' '}
        {image.created_at}
      </Text>
      <div>
        {image.tags.map((tag) => (
          <Tag key={tag.tag_element_id} color={`${tag.tag_class_name === '框架' ? 'blue' : 'green'}`}>
            {tag.tag_element_name}
          </Tag>
        ))}
      </div>
    </Card>
  )
}
