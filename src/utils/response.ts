// 定义一个通用的响应接口（泛型 T 表示 data 的类型）
interface BaseResponse<T = any> {
  code: number; // 状态码：0表示成功，其他为错误
  msg: string; // 描述信息，如 "success", "未登录"
  data: T; // 响应数据，支持泛型
}

// 使用类封装统一响应结构，便于调用和扩展
class ResponseModel<T = any> implements BaseResponse<T> {
  public readonly code: number;
  public readonly msg: string;
  public readonly data: T;

  constructor(code: number, msg: string, data?: T) {
    this.code = code;
    this.msg = msg;
    this.data = data as T;
  }

  // 成功时返回的方法，data 可选
  static success<T>(data?: T): ResponseModel<T> {
    return new ResponseModel<T>(0, 'success', data);
  }

  // 错误时返回的方法
  static error(code: number, msg: unknown): ResponseModel<null> {
    return new ResponseModel<null>(code, String(msg), null);
  }

  // 服务器错误返回的方法
  static serverError(
    code: number = 500,
    msg: string = 'Internal Server Error',
  ): ResponseModel<null> {
    return new ResponseModel<null>(code, msg, null);
  }
}

export default ResponseModel;
