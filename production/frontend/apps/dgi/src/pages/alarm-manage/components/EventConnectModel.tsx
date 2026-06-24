import { Alert, Descriptions, Divider, Drawer, Space, Typography } from 'antd'

const { Text } = Typography

export default function EventConnectModel({ open, onCancel, data }: { open: boolean, onCancel: () => void, data: any }) {
  return (
    <Drawer
      open={open}
      onClose={onCancel}
      title="日志详情"
      width={800}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 模型基本信息 */}
        <div className="flex items-center gap-2">
          <Text strong>模型名称：</Text>
          <span className="text-gray-500">{data?.model_name || '-'}</span>
        </div>

        {/* 失败渠道信息 */}
        {data?.failed_channels && data.failed_channels.length > 0 && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {data.failed_channels.map((item: any, index: number) => (
              <Space direction="vertical" size="small" style={{ width: '100%' }} key={index}>
                <div>
                  <Text strong>
                    {item.channel_name || '-'}
                    :
                  </Text>
                  <span className="text-gray-500">
                    {' '}
                    {item.address || '-'}
                  </span>
                </div>

                {item?.err_msg && (
                  <>
                    <Alert
                      description={item.err_msg}
                      type="error"
                      style={{ fontSize: '12px' }}
                    />
                    <Divider style={{ margin: '8px 0' }} />
                  </>
                )}
              </Space>
            ))}
          </Space>
        )}

        {/* 空状态 */}
        {(!data?.failed_channels || data.failed_channels.length === 0) && (
          <Alert
            message="暂无失败渠道信息"
            type="info"
            showIcon
          />
        )}
      </Space>
    </Drawer>
  )
}
