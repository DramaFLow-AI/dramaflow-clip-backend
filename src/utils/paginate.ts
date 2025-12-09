import { Prisma } from '@prisma/client';

/**
 * 分页返回结构体，仿照 MyBatis PageHelper 风格
 */
export interface PaginationResult<T> {
  endRow: number; // 当前页最后一条数据的索引（从 1 开始）
  firstPage: number; // 第一页页码（通常为 1）
  hasNextPage: boolean; // 是否有下一页
  hasPreviousPage: boolean; // 是否有上一页
  isFirstPage: boolean; // 是否是第一页
  isLastPage: boolean; // 是否是最后一页
  lastPage: number; // 最后一页页码
  list: T[]; // 当前页数据列表
  navigateFirstPage: number; // 页码导航的第一个页码
  navigateLastPage: number; // 页码导航的最后一个页码
  navigatePages: number; // 页码导航长度，比如 5 表示显示 5 个连续页码
  navigatePageNums: number[]; // 页码导航数组，比如 [1,2,3,4,5]
  nextPage: number; // 下一页页码
  pageNum: number; // 当前页码
  pageSize: number; // 每页条数
  pages: number; // 总页数
  prePage: number; // 上一页页码
  size: number; // 当前页实际条数
  startRow: number; // 当前页第一条数据的索引（从 1 开始）
  total: number; // 总数据条数
}

/**
 * 分页参数结构
 */
interface PageOptions {
  pageNum: number; // 当前页码（从 1 开始）
  pageSize: number; // 每页条数
}

/**
 * 通用 Prisma 分页函数（支持结果类型映射）
 *
 * @template TModel - 数据库原始记录类型（Prisma 模型 findMany 返回的单条类型）
 * @template TResult - 返回给业务层的最终类型（例如经过转换、重命名后的类型）
 *
 * @param model - Prisma 模型对象，例如 `prisma.user`
 * @param args - Prisma 查询参数，例如 `{ where: { status: 1 }, orderBy: { id: 'desc' } }`
 * @param options - 分页参数，包含当前页码和每页条数
 * @param mapFn - （可选）数据映射函数，用于将数据库记录映射为最终业务类型
 *
 * @returns 返回一个包含分页信息和数据列表的对象，数据列表类型为 `TResult[]`
 *
 * @example
 * ```ts
 * // 数据库类型
 * type UserModel = Prisma.UserGetPayload<{}>;
 * // 最终返回类型
 * interface UserDTO { id: number; name: string }
 *
 * const result = await paginate<UserModel, UserDTO>(
 *   prisma.user,
 *   { where: { status: 1 }, orderBy: { id: 'desc' } },
 *   { pageNum: 1, pageSize: 10 },
 *   row => ({ id: row.id, name: row.username }) // 转换为 dto
 * );
 *
 * console.log(result.list); // UserDTO[]
 * ```
 */
export async function paginate<TModel, TResult>(
  model: {
    findMany: (args: any) => Promise<TModel[]>;
    count: (args: any) => Promise<number>;
  },
  args: Prisma.Enumerable<any>,
  options: PageOptions,
  mapFn?: (row: TModel) => TResult,
): Promise<PaginationResult<TResult>> {
  const { pageNum = 1, pageSize = 10 } = options;
  const skip = (pageNum - 1) * pageSize; // 跳过的记录数
  const take = pageSize; // 每页数量

  // 同时查询列表数据和总数
  const [list, total] = await Promise.all([
    model.findMany({ ...args, skip, take }),
    model.count({ where: args.where }),
  ]);

  // 如果提供了 mapFn，则对每条记录进行映射
  const mappedList = mapFn ? list.map(mapFn) : (list as unknown as TResult[]);

  const pages = Math.ceil(total / pageSize); // 总页数
  const isFirstPage = pageNum === 1;
  const isLastPage = pageNum === pages;

  const navigatePages = 5; // 分页导航显示长度
  const half = Math.floor(navigatePages / 2);

  // 计算导航起止页码
  let startNum = Math.max(1, pageNum - half);
  let endNum = Math.min(pages, pageNum + half);

  // 如果导航长度不足，补齐
  if (endNum - startNum < navigatePages - 1) {
    if (startNum === 1) {
      endNum = Math.min(startNum + navigatePages - 1, pages);
    } else if (endNum === pages) {
      startNum = Math.max(pages - navigatePages + 1, 1);
    }
  }

  // 页码数组
  const navigatePageNums = Array.from(
    { length: endNum - startNum + 1 },
    (_, i) => startNum + i,
  );

  return {
    endRow: skip + mappedList.length,
    firstPage: 1,
    hasNextPage: pageNum < pages,
    hasPreviousPage: pageNum > 1,
    isFirstPage,
    isLastPage,
    lastPage: pages,
    list: mappedList,
    navigateFirstPage: 1,
    navigateLastPage: pages,
    navigatePages,
    navigatePageNums,
    nextPage: pageNum < pages ? pageNum + 1 : pages,
    pageNum,
    pageSize,
    pages,
    prePage: pageNum > 1 ? pageNum - 1 : 1,
    size: mappedList.length,
    startRow: skip + 1,
    total,
  };
}
