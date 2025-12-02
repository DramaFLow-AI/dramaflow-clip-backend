import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { ResponseDto } from '../dto/response.dto';

/**
 * 通用响应装饰器，用于 Swagger 文档生成
 * 支持对象、数组、原始类型（string/number/boolean）
 *
 * @template TModel 响应数据类型，可以是 DTO 类，也可以是 String/Number/Boolean
 * @param model 响应数据类型
 * @param isArray 是否为数组类型，默认为 false
 * @param dataDescription data 字段在 Swagger 中的描述，可自定义
 * @param dataExample data 字段在 Swagger 中的示例值，可自定义
 */
export const ApiResponseDto = <TModel extends Type<any>>(
  model: TModel,
  isArray = false,
  dataDescription?: string,
  dataExample?: any,
) => {
  const primitiveTypes = [String, Number, Boolean] as const;
  const isPrimitive = primitiveTypes.includes(model as any);

  const dataSchema = isPrimitive
    ? {
        type: (model as any).name.toLowerCase(),
        description: dataDescription || '返回数据',
        example: dataExample,
      }
    : isArray
      ? {
          type: 'array',
          items: { $ref: getSchemaPath(model) },
          description: dataDescription || '返回数据',
          example: dataExample,
        }
      : {
          $ref: getSchemaPath(model),
          description: dataDescription || '返回数据',
          example: dataExample,
        };

  return applyDecorators(
    ApiExtraModels(ResponseDto, ...(isPrimitive ? [] : [model])),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(ResponseDto) },
          {
            properties: {
              data: dataSchema,
            },
          },
        ],
      },
    }),
  );
};
