import { camelCase, isPlainObject, isArray } from 'lodash';

/**
 * 定义字段重命名映射表
 * key 表示原始字段名（如数据库/Prisma默认返回的字段名）
 * value 表示希望转成的新字段名
 */
const keyMapping: Record<string, string> = {
  sys_route_meta: 'meta',
  sys_route_permissions: 'permission',
};

/**
 * 将对象的所有键从 snake_case 转换为 camelCase，
 * 同时对指定字段进行重命名（如 sys_route_meta → meta）
 *
 * @param obj 任意对象或数组
 * @returns 转换后的对象或数组，键名已驼峰化并重命名
 */
export function camelizeAndRenameKeys(obj: any): any {
  // 如果是数组，对每个元素递归处理
  if (isArray(obj)) {
    return obj.map(camelizeAndRenameKeys);
  }
  // 如果是普通对象，对其键值进行转换
  else if (isPlainObject(obj)) {
    return Object.entries(obj).reduce(
      (result, [key, value]) => {
        /**
         * 获取新的键名：
         * - 如果当前 key 存在于重命名映射表中，则使用映射后的名字
         * - 否则使用 lodash.camelCase 转换为 camelCase
         */
        const camelKey = keyMapping[key] ?? camelCase(key);

        // 递归处理 value，确保嵌套对象/数组也被转换
        result[camelKey] = camelizeAndRenameKeys(value);

        return result;
      },
      {} as Record<string, any>,
    ); // 初始化结果对象
  }
  // 如果是基本类型（字符串、数字、null 等），直接返回
  else {
    return obj;
  }
}
