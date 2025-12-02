import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { isArray, isPlainObject, mapKeys, mapValues, camelCase } from 'lodash';

function keysToCamelCase(obj: any): any {
  if (isArray(obj)) {
    return obj.map(keysToCamelCase);
  } else if (isPlainObject(obj)) {
    return mapKeys(mapValues(obj, keysToCamelCase), (_value, key) =>
      camelCase(key),
    );
  }
  return obj;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        return {
          code: 0,
          msg: 'success',
          data: keysToCamelCase(data),
        };
      }),
    );
  }
}
