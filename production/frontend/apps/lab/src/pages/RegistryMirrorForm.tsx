import { useEffect, useState } from 'react'
import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AutoComplete, Button, Card, Form, Input, Pagination, Select, Space, Spin, message } from 'antd'
import { ExclamationCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import type { GetNamespaceEnumParams, RegistryMirrorImage } from '../services/RegistryMirrorService'
import { registryMirrorService } from '../services/RegistryMirrorService'
import { registryService } from '../services/registryService'

const { Option } = Select
/**
 * 镜像创建/编辑页面
 */
const RegistryMirrorForm = () => {
  const navigate = useNavigate()
  const { id } = useParams<{
    id: string
  }>()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingImage, setEditingImage] = useState<RegistryMirrorImage | null>(null)
  // 级联选择状态
  const [selectedRegistryId, setSelectedRegistryId] = useState<number | null>(null)
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [namespaceSearchValue, setNamespaceSearchValue] = useState('')
  const [imageSearchValue, setImageSearchValue] = useState('')
  const [searchParams, setSearchParams] = useState<GetNamespaceEnumParams>({
    repository_id: 0, // 初始值设为0，实际使用时会被正确值替换
    search_type: 1,
    namespaces: '',
    image_name: '',
    page: 1,
    size: 20,
  })
  // 数据状态
  const [namespaces, setNamespaces] = useState<any[]>([])
  const [images, setImages] = useState<any[]>([])
  const [filteredNamespaces, setFilteredNamespaces] = useState<any[]>([])
  const [filteredImages, setFilteredImages] = useState<any[]>([])
  // 分页状态
  const [namespacePagination, setNamespacePagination] = useState({
    current: 1,
    pageSize: 100,
    total: 0,
  })
  const [imagePagination, setImagePagination] = useState({
    current: 1,
    pageSize: 100,
    total: 0,
  })
  // 搜索状态
  const [namespaceSearchLoading, setNamespaceSearchLoading] = useState(false)
  const [imageSearchLoading, setImageSearchLoading] = useState(false)
  // 加载状态
  const [namespaceLoading, setNamespaceLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  // 错误状态
  const [namespaceError, setNamespaceError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  // 编辑模式状态
  const [isEditingMode, setIsEditingMode] = useState(false)
  const isEditMode = !!id
  // 获取仓库列表
  const { data: registryList, isLoading: registryListLoading } = useQuery({
    queryKey: ['registryList'],
    queryFn: () => registryService.getRegistryConfigs(),
  })
  const { data: registryTypeEnum, isLoading: registryTypeEnumLoading } = useQuery({
    queryKey: ['registryTypeNotebookEnum'],
    queryFn: () => registryMirrorService.getRegistryTypeEnum(),
  })
  // 加载编辑数据
  useEffect(() => {
    if (id) {
      loadImage(parseInt(id))
    }
  }, [id])
  const loadImage = async (imageId: number) => {
    try {
      setLoading(true)
      setIsEditingMode(true)
      const image = await registryMirrorService.getRegistryImage(imageId)
      setEditingImage(image)
      // 设置级联选择状态
      setSelectedRegistryId(image.repository_id)
      setSelectedNamespace(image.namespace)
      setSelectedImage(image.image)
      // 设置搜索框值
      setNamespaceSearchValue(image.namespace)
      setImageSearchValue(image.image)
      // 设置表单值
      form.setFieldsValue({
        image: image.image,
        describe: image.describe,
        type: image.type,
        registry_id: image.repository_id,
        namespace: image.namespace,
      })
      // 先加载命名空间数据
      await loadNamespaces(image.repository_id)
      // 然后加载镜像数据（如果命名空间存在）
      if (image.namespace) {
        await loadImages(image.repository_id, image.namespace)
      }
    }
    catch (error) {
      // message.error("加载镜像信息失败");
      console.error('Load image error:', error)
    }
    finally {
      setLoading(false)
    }
  }
  // 加载命名空间列表
  const loadNamespaces = async (registryId: number, page: number = 1, searchValue: string = '') => {
    try {
      setNamespaceLoading(true)
      setNamespaceError(null)
      const params = {
        repository_id: registryId,
        search_type: 1,
        namespaces: searchValue,
        image_name: '',
        page,
        size: namespacePagination.pageSize,
      }
      setSearchParams(params)
      const result = await registryMirrorService.getNamespaceEnum(params)
      // 处理返回的数据，确保有正确的结构
      const namespaceData = result.items || result || []
      const total = result.total || namespaceData.length
      // 更新分页状态
      setNamespacePagination((prev) => ({
        ...prev,
        current: page,
        total,
      }))
      if (searchValue) {
        // 搜索模式：替换过滤数据
        setFilteredNamespaces(namespaceData)
      }
      else {
        // 正常模式：更新全部数据
        setNamespaces(namespaceData)
        setFilteredNamespaces(namespaceData)
      }
    }
    catch (error) {
      const errorMessage = (error).response?.data?.detail || '加载命名空间失败'
      setNamespaceError(errorMessage)
      // console.error("Load namespaces error:", error);
    }
    finally {
      setNamespaceLoading(false)
    }
  }
  // 加载镜像列表
  const loadImages = async (registryId: number, namespace: string, page: number = 1, searchValue: string = '') => {
    try {
      setImageLoading(true)
      setImageError(null)
      const params = {
        repository_id: registryId,
        search_type: 2,
        namespaces: namespace,
        image_name: searchValue,
        page,
        size: imagePagination.pageSize,
      }
      setSearchParams(params)
      const result = await registryMirrorService.getNamespaceEnum(params)
      // 处理返回的数据，确保有正确的结构
      const imageData = result.items || result || []
      const total = result.total || imageData.length
      // 更新分页状态
      setImagePagination((prev) => ({
        ...prev,
        current: page,
        total,
      }))
      if (searchValue) {
        // 搜索模式：替换过滤数据
        setFilteredImages(imageData)
      }
      else {
        // 正常模式：更新全部数据
        setImages(imageData)
        setFilteredImages(imageData)
      }
    }
    catch (error) {
      const errorMessage = (error).response?.data?.detail || '加载镜像列表失败'
      setImageError(errorMessage)
      // console.error("Load images error:", error);
    }
    finally {
      setImageLoading(false)
    }
  }
  // 处理仓库选择
  const handleRegistryChange = async (registryId: number) => {
    setSelectedRegistryId(registryId)
    setSelectedNamespace(null)
    setSelectedImage(null)
    setNamespaceSearchValue('')
    setImageSearchValue('')
    setNamespaces([])
    setImages([])
    setFilteredNamespaces([])
    setFilteredImages([])
    // 重置分页状态
    setNamespacePagination({
      current: 1,
      pageSize: 100,
      total: 0,
    })
    setImagePagination({
      current: 1,
      pageSize: 100,
      total: 0,
    })
    // 重置加载状态
    setNamespaceLoading(false)
    setImageLoading(false)
    setNamespaceSearchLoading(false)
    setImageSearchLoading(false)
    // 重置错误状态
    setNamespaceError(null)
    setImageError(null)
    // 清空相关表单字段
    form.setFieldsValue({
      namespace: undefined,
      image: undefined,
    })
    // 自动加载命名空间
    await loadNamespaces(registryId)
  }
  // 处理命名空间选择
  const handleNamespaceSelect = async (namespace: string) => {
    setSelectedNamespace(namespace)
    setSelectedImage(null)
    setImageSearchValue('')
    setImages([])
    setFilteredImages([])
    // 重置镜像分页状态
    setImagePagination({
      current: 1,
      pageSize: 100,
      total: 0,
    })
    // 重置镜像加载状态
    setImageLoading(false)
    setImageSearchLoading(false)
    // 重置镜像错误状态
    setImageError(null)
    // 清空镜像字段
    form.setFieldsValue({
      image: undefined,
    })
    if (selectedRegistryId) {
      // 加载镜像列表
      await loadImages(selectedRegistryId, namespace)
    }
  }
  // API搜索命名空间
  const searchNamespaces = async (searchValue: string, page: number = 1) => {
    if (!selectedRegistryId || !searchValue.trim()) {
      // 如果搜索值为空，加载第一页数据
      await loadNamespaces(selectedRegistryId, 1, '')
      return
    }
    try {
      setNamespaceSearchLoading(true)
      setNamespaceError(null)
      await loadNamespaces(selectedRegistryId, page, searchValue)
    }
    catch (error) {
      const errorMessage = (error).response?.data?.detail || '搜索命名空间失败'
      setNamespaceError(errorMessage)
      // console.error("Search namespaces error:", error);
    }
    finally {
      setNamespaceSearchLoading(false)
    }
  }
  // API搜索镜像
  const searchImages = async (searchValue: string, page: number = 1) => {
    if (!selectedRegistryId || !selectedNamespace)
      return
    if (!searchValue.trim()) {
      // 如果搜索值为空，加载第一页数据
      await loadImages(selectedRegistryId, selectedNamespace, 1, '')
      return
    }
    try {
      setImageSearchLoading(true)
      setImageError(null)
      await loadImages(selectedRegistryId, selectedNamespace, page, searchValue)
    }
    catch (error) {
      const errorMessage = (error).response?.data?.detail || '搜索镜像失败'
      setImageError(errorMessage)
      // console.error("Search images error:", error);
    }
    finally {
      setImageSearchLoading(false)
    }
  }
  // 处理命名空间搜索
  const handleNamespaceSearch = (value: string) => {
    setNamespaceSearchValue(value)
    // 重置分页到第一页
    setNamespacePagination((prev) => ({
      ...prev,
      current: 1,
    }))
    // 如果为空，显示所有命名空间
    if (!value.trim()) {
      setFilteredNamespaces(namespaces)
    }
  }
  // 处理镜像搜索
  const handleImageSearch = (value: string) => {
    setImageSearchValue(value)
    // 重置分页到第一页
    setImagePagination((prev) => ({
      ...prev,
      current: 1,
    }))
    // 如果为空，显示所有镜像
    if (!value.trim()) {
      setFilteredImages(images)
    }
  }
  // 处理命名空间搜索框回车
  const handleNamespaceSearchPressEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchNamespaces(namespaceSearchValue)
    }
  }
  // 处理镜像搜索框回车
  const handleImageSearchPressEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchImages(imageSearchValue)
    }
  }
  // 重置命名空间
  const resetNamespace = () => {
    setSelectedNamespace(null)
    setNamespaceSearchValue('')
    setImages([])
    setFilteredImages([])
    setImageSearchValue('')
    // 重置分页状态
    setNamespacePagination({
      current: 1,
      pageSize: 100,
      total: 0,
    })
    setImagePagination({
      current: 1,
      pageSize: 100,
      total: 0,
    })
    // 重置镜像加载状态
    setImageLoading(false)
    setImageSearchLoading(false)
    // 清空镜像字段
    form.setFieldsValue({
      namespace: undefined,
      image: undefined,
    })
  }
  // 重置镜像
  const resetImage = () => {
    setSelectedImage(null)
    setImageSearchValue('')
    setFilteredImages(images) // 恢复显示所有镜像
    // 重置镜像分页到第一页
    setImagePagination((prev) => ({
      ...prev,
      current: 1,
    }))
    // 清空镜像字段
    form.setFieldsValue({
      image: undefined,
    })
  }
  // 重试加载命名空间
  const retryLoadNamespaces = () => {
    if (selectedRegistryId) {
      loadNamespaces(selectedRegistryId)
    }
  }
  // 重试加载镜像
  const retryLoadImages = () => {
    if (selectedRegistryId && selectedNamespace) {
      loadImages(selectedRegistryId, selectedNamespace)
    }
  }
  // 处理命名空间分页变化
  const handleNamespacePageChange = (page: number, pageSize?: number) => {
    const newPageSize = pageSize || namespacePagination.pageSize
    setNamespacePagination((prev) => ({
      ...prev,
      current: page,
      pageSize: newPageSize,
    }))
    if (namespaceSearchValue.trim()) {
      // 搜索模式
      searchNamespaces(namespaceSearchValue, page)
    }
    else {
      // 正常模式
      loadNamespaces(selectedRegistryId, page, '')
    }
  }
  // 处理镜像分页变化
  const handleImagePageChange = (page: number, pageSize?: number) => {
    const newPageSize = pageSize || imagePagination.pageSize
    setImagePagination((prev) => ({
      ...prev,
      current: page,
      pageSize: newPageSize,
    }))
    if (imageSearchValue.trim()) {
      // 搜索模式
      searchImages(imageSearchValue, page)
    }
    else {
      // 正常模式
      loadImages(selectedRegistryId, selectedNamespace, page, '')
    }
  }
  // 保存镜像
  const handleSave = async (values: Record<string, string | boolean | number>) => {
    try {
      setSubmitting(true)
      const requestData = {
        image: values.image as string,
        type: values.type as number,
        describe: values.describe as string,
        repository_id: values.registry_id as number,
        namespace: selectedNamespace as string,
      }
      if (isEditMode && editingImage) {
        await registryMirrorService.updateRegistryMirrorConfig(editingImage.id, requestData)
        message.success('更新镜像成功')
      }
      else {
        await registryMirrorService.createRegistryMirrorConfig(requestData)
        message.success('创建镜像成功')
      }
      navigate(-1)
    }
    catch (error) {
      const errorMessage = (error).response?.data?.detail || '保存失败'
      // message.error(errorMessage);
    }
    finally {
      setSubmitting(false)
    }
  }
  // 取消并返回
  const handleCancel = () => {
    navigate(-1)
  }
  return (
    <div className="p-6">
      <Spin spinning={loading}>
        <Space direction="vertical" size="large" className="w-full">
          <Card>
            <Form
              className="max-w-[800px]"
              form={form}
              layout="vertical"
              onFinish={handleSave}
              initialValues={{
                type: 0,
              }}
            >

              <Form.Item name="registry_id" label="镜像仓库" rules={[{ required: true, message: '请选择镜像仓库' }]}>
                <Select placeholder="请选择镜像仓库" onChange={handleRegistryChange} loading={registryListLoading} showSearch optionFilterProp="children" filterOption={(input, option) => String(option?.children || '').toLowerCase().includes(input.toLowerCase())}>
                  {registryList?.items.map((registry) => (
                    <Option key={registry.id} value={registry.id}>
                      {registry.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="namespace"
                label="命名空间"
                rules={[{ required: true, message: '请选择命名空间' }]}
                help={!selectedRegistryId
                  ? '请先选择镜像仓库'
                  : namespaceError
                    ? (
                        <div className="text-[var(--lab-color-danger)]">
                          <ExclamationCircleOutlined className="mr-1" />
                          {namespaceError}
                          <Button type="link" size="small" onClick={retryLoadNamespaces} className="p-0 ml-2">
                            重试
                          </Button>
                        </div>
                      )
                    : namespaceLoading
                      ? '正在加载命名空间列表...'
                      : '选择仓库后会自动加载命名空间列表，也可以输入关键词进行搜索'}
              >
                <AutoComplete
                  className="w-[100%]"
                  placeholder={!selectedRegistryId ? '请先选择镜像仓库' : '请选择或搜索命名空间'}
                  value={namespaceSearchValue}
                  onChange={handleNamespaceSearch}
                  onSelect={handleNamespaceSelect}
                  options={filteredNamespaces.map((item) => ({
                    value: item.name || item,
                    label: item.name || item,
                  }))}
                  filterOption={false} // 禁用本地过滤，使用API搜索
                  disabled={!selectedRegistryId || (namespaceLoading && !isEditingMode)} // 未选择仓库或正在加载时置灰（编辑模式除外）
                >
                  <Input.Search
                    enterButton={(
                      <SearchOutlined style={{
                        color: namespaceSearchValue.trim() ? '#1890ff' : '#d9d9d9',
                      }}
                      />
                    )}
                    onSearch={(value) => searchNamespaces(value)}
                    onPressEnter={handleNamespaceSearchPressEnter}
                    loading={namespaceSearchLoading || namespaceLoading}
                    disabled={!selectedRegistryId || (namespaceLoading && !isEditingMode)} // 未选择仓库或正在加载时置灰（编辑模式除外）
                    suffix={selectedNamespace && (<ReloadOutlined onClick={resetNamespace} className="text-[var(--lab-color-brand-primary)] cursor-pointer ml-2" title="重置命名空间" />)}
                  />
                </AutoComplete>

                {/* 命名空间分页组件 */}
                {selectedRegistryId && namespacePagination.total > namespacePagination.pageSize && (
                  <div className="mt-2 text-center">
                    <Spin spinning={namespaceLoading || namespaceSearchLoading} size="small">
                      <Pagination current={namespacePagination.current} pageSize={namespacePagination.pageSize} total={namespacePagination.total} showSizeChanger showQuickJumper showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条命名空间`} pageSizeOptions={['10', '20', '50', '100']} onChange={handleNamespacePageChange} onShowSizeChange={handleNamespacePageChange} size="small" disabled={namespaceLoading || namespaceSearchLoading} />
                    </Spin>
                  </div>
                )}
              </Form.Item>

              <Form.Item
                name="image"
                label="镜像名称"
                rules={[
                  { required: true, message: '请选择镜像名称' },
                ]}
                help={!selectedNamespace
                  ? '请先选择命名空间'
                  : imageError
                    ? (
                        <div className="text-[var(--lab-color-danger)]">
                          <ExclamationCircleOutlined className="mr-1" />
                          {imageError}
                          <Button type="link" size="small" onClick={retryLoadImages} className="p-0 ml-2">
                            重试
                          </Button>
                        </div>
                      )
                    : imageLoading
                      ? '正在加载镜像列表...'
                      : '选择命名空间后会自动加载镜像列表，也可以输入关键词进行搜索'}
              >
                <AutoComplete
                  className="w-[100%]"
                  placeholder={!selectedNamespace ? '请先选择命名空间' : '请选择或搜索镜像名称'}
                  value={imageSearchValue}
                  onChange={handleImageSearch}
                  onSelect={(value) => {
                    setSelectedImage(value)
                    form.setFieldsValue({ image: value })
                  }}
                  options={filteredImages.map((item) => ({
                    value: item.image || item,
                    label: item.image || item,
                  }))}
                  filterOption={false} // 禁用本地过滤，使用API搜索
                  disabled={!selectedNamespace || (imageLoading && !isEditingMode)} // 未选择命名空间或正在加载时置灰（编辑模式除外）
                >
                  <Input.Search
                    enterButton={(
                      <SearchOutlined style={{
                        color: imageSearchValue.trim() ? '#1890ff' : '#d9d9d9',
                      }}
                      />
                    )}
                    onSearch={(value) => searchImages(value)}
                    onPressEnter={handleImageSearchPressEnter}
                    loading={imageSearchLoading || imageLoading}
                    disabled={!selectedNamespace || (imageLoading && !isEditingMode)} // 需要先选择命名空间或正在加载（编辑模式除外）
                    suffix={selectedImage && (<ReloadOutlined onClick={resetImage} className="text-[var(--lab-color-brand-primary)] cursor-pointer ml-2" title="重置镜像" />)}
                  />
                </AutoComplete>

                {/* 镜像分页组件 */}
                {selectedNamespace && imagePagination.total > imagePagination.pageSize && (
                  <div className="mt-2 text-center">
                    <Spin spinning={imageLoading || imageSearchLoading} size="small">
                      <Pagination current={imagePagination.current} pageSize={imagePagination.pageSize} total={imagePagination.total} showSizeChanger showQuickJumper showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条镜像`} pageSizeOptions={['10', '20', '50', '100']} onChange={handleImagePageChange} onShowSizeChange={handleImagePageChange} size="small" disabled={imageLoading || imageSearchLoading} />
                    </Spin>
                  </div>
                )}
              </Form.Item>

              <Form.Item
                name="describe"
                label="镜像描述"
                rules={[
                  { required: true, message: '请输入镜像描述' },
                ]}
              >
                <Input placeholder="请输入镜像描述" />
              </Form.Item>

              <Form.Item name="type" label="镜像分类" rules={[{ required: true, message: '请选择镜像分类' }]}>
                <Select
                  placeholder="请选择镜像分类"
                  options={registryTypeEnum?.map((item) => ({
                    label: item.label,
                    value: item.value,
                  }))}
                  loading={registryTypeEnumLoading}
                />
              </Form.Item>

              <div
                className="ml-[200px] fixed bottom-[0] left-[0] right-[0] p-[16px] z-[100]"
                style={{
                  backgroundColor: 'white',
                }}
              >
                <Space className="ml-1">
                  <Button type="default" onClick={handleCancel}>取消</Button>
                  <Button type="primary" htmlType="submit" loading={submitting}>
                    {isEditMode ? '更新' : '创建'}
                  </Button>
                </Space>
              </div>
            </Form>
          </Card>
        </Space>
      </Spin>
    </div>
  )
}
export default RegistryMirrorForm
