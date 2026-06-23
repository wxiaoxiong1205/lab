export enum ApiStatus {
  Published = 1,
  Unpublished = 2,
}

export const ApiStatusMap = {
  [ApiStatus.Published]: '已发布',
  [ApiStatus.Unpublished]: '未发布',
}
