import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildVueRouteTree } from '../../utils/buildVueRouteTree';
import { convertBigIntToString } from '../../utils/convertBigIntToString';

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取菜单列表
   * @param dto
   */
  async findAll() {
    const menus = await this.prisma.sys_routes.findMany();

    // return buildVueRouteTree(
    //   camelizeAndRenameKeys(convertBigIntToString(menus)),
    // );
    return buildVueRouteTree(convertBigIntToString(menus));
  }
}
