import React, { useCallback, useEffect, useState } from 'react'
import type { TableColumnsType } from 'antd'
import { Button, Form, Input, Popconfirm, Table, Tag, message } from 'antd'
import { DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { attributeService } from '../../services/inferenceService'
import AttributeModal from './AttributeModal'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

// 属性数据类型定义
interface Attribute {
  id: string | number
  name: string
  description: string
  inputType: '手动输入' | '下拉选择'
  required: boolean
}

const CreateAttributePage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { projectId } = useParams<{ projectId: string }>()
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

  // 将API数据映射为组件需要的格式
  const mapApiDataToComponentFormat = (apiItems: any[]): Attribute[] => {
    return apiItems.map((item) => ({
      id: item.id,
      name: item.name || '',
      description: item.description || '',
      inputType: item.input_type === '下拉选择' ? '下拉选择' : '手动输入',
      required: item.required_tag === 1,
    }))
  }

  // 获取属性列表
  const fetchAttributes = useCallback(async (params: { page: number, size: number }) => {
    if (!projectId) {
      message.error('项目ID不存在')
      return
    }

    setLoading(true)
    try {
      const currentSearchText = searchText // 使用最新的 searchText
      const hasSearch = currentSearchText.trim().length > 0

      let response
      if (hasSearch) {
        response = await attributeService.list({ page: 1, size: 100, business_type: 'inference_service' })
      }
      else {
        // 无搜索时使用服务端分页
        response = await attributeService.list({ page: params.page, size: params.size, business_type: 'inference_service' })
      }

      // 映射API数据 - response.items 可能是 InferenceService[] 或 ApiAttribute[]
      const apiItems = (response.items || []) as any[]
      setAttributesData(apiItems) // 保存完整的API数据
      let mappedData = mapApiDataToComponentFormat(apiItems)

      // 使用最新的 searchText
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
      message.error('获取属性列表失败')
    }
    finally {
      setLoading(false)
    }
  }, [projectId, searchText])

  // 删除属性
  const handleDelete = async (id: string | number) => {
    if (!projectId) {
      message.error('项目ID不存在')
      return
    }

    try {
      await attributeService.delete(Number(id))
      message.success('删除成功')
      fetchAttributes(searchParams)
    }
    catch (error) {
      console.error('删除属性失败:', error)
      message.error('删除属性失败')
    }
  }

  // 打开新建属性弹窗
  const handleOpenModal = () => {
    setModalVisible(true)
    form.resetFields()
    // 设置默认值：是否必填默认为"是"
    form.setFieldsValue({
      required: true,
      selectMode: 'single', // 默认单选
      options: [], // 默认空选项列表
    })
  }

  // 关闭弹窗
  const handleCloseModal = () => {
    setModalVisible(false)
    form.resetFields()
  }

  // 提交新建属性表单
  const handleSubmit = async (values: any) => {
    if (!projectId) {
      message.error('项目ID不存在')
      return
    }

    try {
      // 映射表单数据到API参数格式
      const apiParams: any = {
        description: values.description || '',
        required_tags: values.required ? 1 : 0,
        name: values.name,
        input_type: values.inputType,
        business_type: 'inference_service',
        group: values.group != null && values.group !== '' ? values.group : undefined,
      }

      // 如果是下拉选择类型，添加选择模式和选项值
      if (values.inputType === '下拉选择') {
        // 将 selectMode 转换为 multi_select：single -> 0, multiple -> 1
        apiParams.multi_select = values.selectMode === 'multiple' ? 1 : 0
        // 将字符串数组转换为对象数组格式：{ option_value: string }[]
        apiParams.options = (values.options || []).map((option: string) => ({
          option_value: option,
        }))
      }

      // 创建属性
      await attributeService.create(apiParams)
      message.success('创建属性成功')
      queryClient.invalidateQueries({ queryKey: ['business-attr-group-list', 'inference_service'] })
      handleCloseModal()
      fetchAttributes(searchParams)
    }
    catch (error) {
      console.error('创建属性失败:', error)
      message.error('创建属性失败')
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

  // 页面加载时获取数据
  useEffect(() => {
    fetchAttributes(searchParams)
  }, [searchParams, fetchAttributes])

  // 搜索文本变化时重新获取数据
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchParams((prev) => ({ ...prev, page: 1 }))
    }, 300)

    return () => clearTimeout(timer)
  }, [searchText])

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
      ),
    },
  ]

  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title="属性"
          onBack={() => navigate(-1)}
          actions={(
            <>
              <Input
                placeholder="请输入属性名称搜索"
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
                新建属性
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />
        <div className="create-form-body">

          {/* 属性表格 */}
          <Table
            columns={columns}
            dataSource={attributes}
            rowKey={(record) => record.id}
            loading={loading}
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
            businessType="inference_service"
          />
        </div>
      </section>
    </div>
  )
}

export default CreateAttributePage
