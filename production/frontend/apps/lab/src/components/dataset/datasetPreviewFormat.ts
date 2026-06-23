export const isDpoRoleBasedSample = (sampleData: any) => {
  return !!(
    sampleData
    && typeof sampleData === 'object'
    && !Array.isArray(sampleData)
    && Array.isArray(sampleData.messages)
    && sampleData.chosen
    && typeof sampleData.chosen === 'object'
    && sampleData.rejected
    && typeof sampleData.rejected === 'object'
  )
}

export const isDpoAlpacaSample = (sampleData: any) => {
  return !!(
    sampleData
    && typeof sampleData === 'object'
    && !Array.isArray(sampleData)
    && typeof sampleData.instruction === 'string'
    && typeof sampleData.chosen === 'string'
    && typeof sampleData.rejected === 'string'
  )
}

export const isDpoRoleBasedPreview = (item: any) => {
  return !!(
    Array.isArray(item?.messages)
    && item?.chosen
    && typeof item.chosen === 'object'
    && item?.rejected
    && typeof item.rejected === 'object'
  )
}

export const isDpoAlpacaPreview = (item: any) => {
  return !!(
    typeof item?.instruction === 'string'
    && typeof item?.chosen === 'string'
    && typeof item?.rejected === 'string'
  )
}

export const formatDatasetPreviewItems = (data: any, versionItem: any) => {
  const isImageType = versionItem.dataset_type === 'image-understanding' || versionItem.dataset_type === 'image-generation'
  const firstSampleData = data.items?.[0]?.sample_data
  const isDpoRoleBased = isDpoRoleBasedSample(firstSampleData)
  const isDpoAlpaca = isDpoAlpacaSample(firstSampleData)

  const hasMessagesFormat = data.items && data.items.length > 0
    && (data.items[0].sample_data?.messages || data.items[0].messages)

  if (isDpoRoleBased || isDpoAlpaca) {
    return data.items.map((item: any) => ({
      ...item.sample_data,
      key: item.row_number,
      id: item.row_number,
      row_number: item.row_number,
    }))
  }

  if (isImageType || hasMessagesFormat) {
    return data.items.map((item: any) => ({
      ...item.sample_data,
      key: item.row_number,
      id: item.row_number,
      row_number: item.row_number,
      base_url: data.base_url || '',
    }))
  }

  return data.items.map((item: any) => ({
    ...(Array.isArray(item.sample_data) ? item.sample_data[0] : item.sample_data),
    key: item.row_number,
    id: item.row_number,
    item,
  }))
}

export const getBusinessTestKeys = (previewData: any[]) => {
  const simpleData = previewData[0]?.item?.sample_data
  if (!simpleData) return []

  if (Array.isArray(simpleData)) {
    return Object.keys(simpleData[0] || [])
  }

  return Object.keys(simpleData || [])
}
