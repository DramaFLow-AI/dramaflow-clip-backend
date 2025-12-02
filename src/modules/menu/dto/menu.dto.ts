import { ApiProperty } from '@nestjs/swagger';

class MetaDto {
  @ApiProperty({ description: '页面标题' })
  title: string;

  @ApiProperty({
    description: '图标',
    required: false,
    nullable: true,
    type: String,
  })
  icon?: string | null;

  @ApiProperty({ description: '是否缓存', default: false })
  noCache: boolean;

  @ApiProperty({ description: '是否显示面包屑', default: true })
  breadcrumb: boolean;

  @ApiProperty({ description: '是否固定标签页', default: false })
  affix: boolean;

  @ApiProperty({ description: '是否隐藏菜单', default: false })
  hidden: boolean;

  @ApiProperty({ description: '是否禁用标签页', default: false })
  noTagsView: boolean;

  @ApiProperty({
    description: '激活菜单',
    required: false,
    nullable: true,
    type: String,
  })
  activeMenu?: string | null;

  @ApiProperty({ description: '是否可以跳转', default: false })
  canTo: boolean;

  @ApiProperty({ description: '权限列表', type: [String], default: [] })
  permissionList: string[];
}

export class MenuItemDto {
  @ApiProperty({ description: '菜单ID' })
  id: number;

  @ApiProperty({ description: '父菜单ID' })
  parentId: number;

  @ApiProperty({ description: '路由路径' })
  path: string;

  @ApiProperty({ description: '组件路径或标识' })
  component: string;

  @ApiProperty({
    description: '重定向地址',
    required: false,
    nullable: true,
    type: String,
  })
  redirect?: string | null;

  @ApiProperty({ description: '路由名称' })
  name: string;

  @ApiProperty({ description: '路由元信息', type: () => MetaDto })
  meta: MetaDto;

  @ApiProperty({ description: '权限', type: [String], default: [] })
  permission: string[];

  @ApiProperty({ description: '子菜单', type: [MenuItemDto], default: [] })
  children: MenuItemDto[];
}
