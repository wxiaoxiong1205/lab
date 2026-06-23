/**
 * 分页工具函数
 */

/**
 * 计算删除数据后应该跳转的页码
 * 当删除后当前页没有数据时，自动跳转到上一页
 *
 * @param currentPage - 当前页码
 * @param currentPageSize - 每页大小
 * @param currentTotal - 删除前的总数
 * @param deleteCount - 删除的数量，默认为1
 * @returns 应该跳转的目标页码
 */
export function calculatePageAfterDelete(
  currentPage: number,
  currentPageSize: number,
  currentTotal: number,
  deleteCount: number = 1,
): number {
  // 计算删除后的总数
  const newTotal = Math.max(0, currentTotal - deleteCount)

  // 计算删除后的最大页码（至少为1）
  const maxPage = Math.ceil(newTotal / currentPageSize) || 1

  // 如果当前页码大于删除后的最大页码，则跳转到最大页码
  return currentPage > maxPage ? maxPage : currentPage
}

export interface PaginationState {
  current: number
  pageSize: number
  total: number
}

export interface PaginatedListResponse<T> {
  items?: T[]
  total?: number
}

interface HandlePaginatedResponseOptions<T> {
  page: number
  size: number
  response?: PaginatedListResponse<T>
  setList: (items: T[]) => void
  setPagination: (pagination: PaginationState) => void
  refetch: (page: number, size: number) => Promise<void>
}

interface RefreshAfterDeleteOptions {
  pagination: PaginationState
  fetchList: (page: number, size: number) => Promise<void>
  deleteCount?: number
}

async function handlePaginatedResponse<T>({
  page,
  size,
  response,
  setList,
  setPagination,
  refetch,
}: HandlePaginatedResponseOptions<T>): Promise<void> {
  const items = response?.items ?? []
  const total = response?.total ?? 0
  const maxPage = Math.ceil(total / size) || 1

  if (page > maxPage && total > 0) {
    await refetch(maxPage, size)
    return
  }

  setList(items)
  setPagination({
    current: Math.min(page, maxPage),
    pageSize: size,
    total,
  })
}

async function refreshAfterDelete({
  pagination,
  fetchList,
  deleteCount = 1,
}: RefreshAfterDeleteOptions): Promise<void> {
  const targetPage = calculatePageAfterDelete(
    pagination.current,
    pagination.pageSize,
    pagination.total,
    deleteCount,
  )

  await fetchList(targetPage, pagination.pageSize)
}

export const paginationUtils = {
  calculatePageAfterDelete,
  handlePaginatedResponse,
  refreshAfterDelete,
}
