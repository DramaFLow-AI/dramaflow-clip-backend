/**
 * 将对象或数组中的所有 BigInt 类型值转换为字符串
 *
 * @param data 任意对象、数组或基本类型
 * @returns 转换后的数据，BigInt 类型变成 string
 */
export function convertBigIntToString(data: any): any {
  if (Array.isArray(data)) {
    // 如果是数组，对每一项递归处理
    return data.map(convertBigIntToString);
  } else if (data && typeof data === 'object') {
    // 如果是对象，处理每个字段
    const result: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = data[key];
        result[key] = convertBigIntToString(value);
      }
    }
    return result;
  } else if (typeof data === 'bigint') {
    // BigInt 转为字符串（也可以改成 `Number(value)` 转数字，但注意超大数溢出）
    // return data.toString()
    return Number(data);
  } else {
    // 其他类型原样返回
    return data;
  }
}
