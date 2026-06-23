import { DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import type { TableColumnsType } from 'antd'
import { Button, Empty, Form, Input, Layout, Menu, Popconfirm, Table, Tag, message } from 'antd'
import { Content } from 'antd/es/layout/layout'
import { useCallback, useEffect, useState } from 'react'
import type { MenuProps } from 'antd/lib'
import React from 'react'
import type { AppMenuFilteredResult } from '@/types/inference'
import { attributeService } from '@/services/inferenceService'
import AttributeModal from '@/pages/service/AttributeModal'
import './AttributeSetting.css'

// 属性数据类型定义
interface Attribute {
  id: string | number
  name: string
  description: string
  inputType: '手动输入' | '下拉选择'
  required: boolean
  options?: Array<{ option_value: string }>
  group?: string // 属性分组
}

export default function AttributeSetting({ activeTab }: { activeTab: string }) {
  const queryClient = useQueryClient()
  const [selectedMenu, setSelectedMenu] = useState<string>('')
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [attributesData, setAttributesData] = useState<any[]>([]) // 存储完整的API数据
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [total, setTotal] = useState(0)
  const [searchParams, setSearchParams] = useState({
    page: 1,
    size: 10,
  })
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [menuData, setMenuData] = useState<AppMenuFilteredResult>({ firstLevelMenus: [], dataManagementOptions: [], modelServiceMenu: null })
  const [loadingMenu, setLoadingMenu] = useState(false)

  // 获取菜单数据（接口已过滤：一级菜单 + 数据管理/模型服务下的选项）
  useEffect(() => {
    const fetchMenu = async () => {
      setLoadingMenu(true)
      try {
        const result = await attributeService.getAppMenu()
        setMenuData(result)
      }
      catch (error) {
        console.error('获取菜单数据失败:', error)
        setMenuData({ firstLevelMenus: [], dataManagementOptions: [], modelServiceMenu: null })
      }
      finally {
        setLoadingMenu(false)
      }
    }
    fetchMenu()
  }, [])

  useEffect(() => {
    const hasAny = (menuData.dataManagementOptions.length > 0) || !!(menuData.modelServiceMenu && menuData.modelServiceMenu.options.length > 0)
    if (loadingMenu || !hasAny) return
    const allCodes = [
      ...menuData.dataManagementOptions.map((option) => option.code),
      ...(menuData.modelServiceMenu?.options ?? []).map((option) => option.code),
    ]
    if (!selectedMenu || !allCodes.includes(selectedMenu)) {
      const first = menuData.dataManagementOptions[0]?.code ?? menuData.modelServiceMenu?.options[0]?.code
      if (first) setSelectedMenu(first)
    }
  }, [loadingMenu, menuData.dataManagementOptions, menuData.modelServiceMenu, selectedMenu])

  // 将API数据映射为组件需要的格式
  const mapApiDataToComponentFormat = (apiItems: any[]): Attribute[] => {
    return apiItems.map((item) => ({
      id: item.id,
      name: item.name || '',
      description: item.description || '',
      inputType: item.input_type === '下拉选择' ? '下拉选择' : '手动输入',
      required: item.required_tag === 1,
      options: item.options || [],
      group: item.group || '-', // 如果API没有分组字段，显示 '-'
    }))
  }

  // 获取属性列表
  const fetchAttributes = useCallback(async (params: { page: number, size: number }) => {
    setLoading(true)
    try {
      const currentSearchText = searchText
      const hasSearch = currentSearchText.trim().length > 0

      let response
      if (hasSearch) {
        response = await attributeService.list({ page: params.page, size: 100, business_type: selectedMenu, name: searchText.trim() })
      }
      else {
        response = await attributeService.list({ page: params.page, size: params.size, business_type: selectedMenu })
      }

      const apiItems = (response.items || []) as any[]
      setAttributesData(apiItems)
      let mappedData = mapApiDataToComponentFormat(apiItems)

      if (hasSearch) {
        mappedData = mappedData.filter((item) =>
          item.name.toLowerCase().includes(currentSearchText.toLowerCase()),
        )
      }

      if (hasSearch) {
        const totalCount = mappedData.length
        const startIndex = (params.page - 1) * params.size
        const endIndex = startIndex + params.size
        const paginatedData = mappedData.slice(startIndex, endIndex)

        setAttributes(paginatedData)
        setTotal(totalCount)
      }
      else {
        setAttributes(mappedData)
        setTotal(response.total || mappedData.length)
      }
    }
    catch (error) {
      console.error('获取属性列表失败:', error)
    }
    finally {
      setLoading(false)
    }
  }, [searchText, selectedMenu])

  // 删除属性
  const handleDelete = async (id: string | number) => {
    try {
      await attributeService.delete(Number(id))
      message.success('删除成功')
      const newTotal = Math.max(0, total - 1)
      const maxPage = Math.max(1, Math.ceil(newTotal / searchParams.size))
      const nextPage = Math.min(searchParams.page, maxPage)
      setSearchParams((prev) => ({ ...prev, page: nextPage }))
    }
    catch (error) {
      console.error('删除属性失败:', error)
    }
  }

  // 打开新建属性弹窗
  const handleOpenModal = () => {
    setModalVisible(true)
    form.resetFields()
    form.setFieldsValue({
      required: true,
      selectMode: 'single',
      options: [],
    })
  }

  // 关闭弹窗
  const handleCloseModal = () => {
    setModalVisible(false)
    form.resetFields()
  }

  // 提交新建属性表单
  const handleSubmit = async (values: any) => {
    try {
      const apiParams: any = {
        description: values.description || '',
        required_tags: values.required ? 1 : 0,
        name: values.name,
        input_type: values.inputType,
        business_type: selectedMenu,
        group: values.group || '',
      }

      if (values.inputType === '下拉选择') {
        apiParams.multi_select = values.selectMode === 'multiple' ? 1 : 0
        apiParams.options = (values.options || []).map((option: string) => ({
          option_value: option,
        }))
      }

      await attributeService.create(apiParams)
      message.success('创建属性成功')
      queryClient.invalidateQueries({ queryKey: ['business-attr-group-list'] })
      handleCloseModal()
      fetchAttributes(searchParams)
    }
    catch (error) {
      console.error('创建属性失败:', error)
    }
  }

  // 处理搜索
  const handleSearch = () => {
    setSearchParams((prev) => ({ ...prev, page: 1 }))
  }

  // 处理分页变化
  const handlePageChange = (page: number, size: number) => {
    setSearchParams((prev) => ({ ...prev, page, size }))
  }

  const hasMenuItems = (menuData.dataManagementOptions.length > 0) || !!(menuData.modelServiceMenu && menuData.modelServiceMenu.options.length > 0)
  // 页面加载时获取数据 当菜单为空时不请求属性列表
  useEffect(() => {
    if (activeTab === 'attribute' && hasMenuItems) {
      fetchAttributes(searchParams)
    }
    else if (activeTab !== 'attribute') {
      // 切换到其他标签页时，清空数据
      setAttributes([])
      setTotal(0)
    }
  }, [searchParams, fetchAttributes, activeTab, selectedMenu, hasMenuItems])

  // 搜索文本变化时重新获取数据
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchParams((prev) => ({ ...prev, page: 1 }))
    }, 300)

    return () => clearTimeout(timer)
  }, [searchText])

  // 格式化属性值显示
  const formatAttributeValue = (record: Attribute): string => {
    if (record.inputType === '下拉选择' && record.options && record.options.length > 0) {
      return record.options.map((opt) => opt.option_value).join('、')
    }
    return '-'
  }

  // 表格列配置
  const columns: TableColumnsType<Attribute> = [
    {
      title: '属性名称',
      dataIndex: 'name',
      key: 'name',
      align: 'left',
      width: 150,
    },
    {
      title: '属性描述',
      dataIndex: 'description',
      key: 'description',
      align: 'left',
      width: 200,
      render: (text: string) => {
        if (!text) return '-'
        const chunks = []
        for (let i = 0; i < text.length; i += 20) {
          chunks.push(text.slice(i, i + 20))
        }
        return (
          <div className="whitespace-pre-wrap break-all">
            {chunks.join('\n')}
          </div>
        )
      },
    },
    {
      title: '输入方式',
      dataIndex: 'inputType',
      key: 'inputType',
      align: 'left',
      width: 120,
      render: (inputType: string) => (
        <Tag color={inputType === '手动输入' ? 'blue' : 'green'}>
          {inputType}
        </Tag>
      ),
    },
    {
      title: '属性值',
      key: 'attributeValue',
      align: 'left',
      width: 200,
      render: (_, record: Attribute) => formatAttributeValue(record),
    },
    {
      title: '属性分组',
      dataIndex: 'group',
      key: 'group',
      align: 'left',
      width: 120,
      render: (group: string) => group || '-',
    },
    {
      title: '是否必填',
      dataIndex: 'required',
      key: 'required',
      align: 'left',
      width: 100,
      render: (required: boolean) => (
        <Tag color={required ? 'red' : 'default'}>
          {required ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      align: 'left',
      width: 100,
      render: (_, record: Attribute) => (
        <div className="attribute-setting-actions">
          <Popconfirm
            title="确认删除"
            description={`确定要删除属性 ${record.name} 吗？`}
            onConfirm={() => handleDelete(record.id)}
            okText="确认"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ]

  const menuItems: MenuProps['items'] = React.useMemo(() => {
    const items: MenuProps['items'] = []
    const { firstLevelMenus, dataManagementOptions, modelServiceMenu } = menuData

    if (dataManagementOptions.length > 0) {
      const dataManagementLabel = firstLevelMenus.find((m) => m.code === 'data_management')?.name ?? firstLevelMenus[0]?.name
      items.push({
        key: 'data-management',
        type: 'group',
        label: dataManagementLabel,
        children: dataManagementOptions.map((opt) => ({
          key: opt.code,
          label: opt.name,
        })),
      })
    }

    if (modelServiceMenu && modelServiceMenu.options.length > 0) {
      items.push({
        key: 'model_service',
        type: 'group',
        label: modelServiceMenu.name,
        children: modelServiceMenu.options.map((opt) => ({
          key: opt.code,
          label: opt.name,
        })),
      })
    }

    return items
  }, [menuData])

  // 菜单加载中或加载完成但无任何菜单项时 不渲染右侧列表布局
  if (loadingMenu || !hasMenuItems) {
    return (
      <Layout className="h-full bg-[var(--lab-color-surface-elevated)]">
        <Content className="flex items-center justify-center min-h-full">
          {loadingMenu ? (
            <span className="text-[var(--lab-color-placeholder)]">加载中...</span>
          ) : (
            <Empty description="暂无数据" />
          )}
        </Content>
      </Layout>
    )
  }
  return (
    <div className="flex w-full min-w-0">
      <Menu
        mode="inline"
        selectedKeys={[selectedMenu]}
        items={menuItems}
        onClick={({ key }) => setSelectedMenu(key)}
        className="!w-[220px] shrink-0"
      />
      <div className="min-w-0 flex-1 overflow-x-auto pl-4">
        <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <Input
            placeholder="请输入属性名称"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
            className="w-[240px]"
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenModal}
          >
            添加属性
          </Button>
        </div>

        {/* 属性表格 */}
        <Table
          columns={columns}
          dataSource={attributes}
          rowKey={(record) => String(record.id)}
          loading={loading}
          className="attribute-setting-table"
          pagination={{
            total,
            pageSize: searchParams.size,
            current: searchParams.page,
            onChange: handlePageChange,
            onShowSizeChange: handlePageChange,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          scroll={{ x: 'max-content' }}
        />

        {/* 新建属性弹窗 */}
        <AttributeModal
          visible={modalVisible}
          editingRecord={null}
          attributesData={attributesData}
          form={form}
          onCancel={handleCloseModal}
          onSubmit={handleSubmit}
          businessType={selectedMenu}
        />
      </div>
    </div>
  )
}
