import { Controller, Get } from '@nestjs/common';
import { MenuService } from './menu.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MenuItemDto } from './dto/menu.dto';
import { Response } from 'express';
import { ApiResponseDto } from '../../common/decorators/api-response.decorator';

@ApiTags('菜单')
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('menu-list')
  @ApiOperation({ summary: '菜单列表', description: '返回菜单列表分页' })
  @ApiResponseDto(MenuItemDto, true)
  async findAll() {
    try {
      return await this.menuService.findAll();
    } catch (error) {
      console.error('[handleMenuList]', error);
      throw error;
    }
  }
}
