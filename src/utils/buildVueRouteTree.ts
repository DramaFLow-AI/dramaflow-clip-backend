export type RouteNode = {
  id: bigint;
  parentId: bigint | null;
  path: string;
  component: string | null;
  redirect: string | null;
  name: string;
  meta: {
    title: string | null;
    icon: string | null;
    noCache: boolean;
    breadcrumb: boolean;
    affix: boolean;
    hidden: boolean;
    noTagsView: boolean;
    activeMenu: string | null;
    canTo: boolean;
    permissionList: string[]; // ✅ 新增字段
  };
  permission: [];
  children: RouteNode[];
};

/**
 * 将扁平路由数组构建为 Vue 可用的嵌套树形结构，并在 meta 中附加 permissionList 权限列表
 *
 * @param routes Prisma 查询后的扁平路由数组（已包含 permissions 字段，并且字段为 camelCase 格式）
 * @returns 嵌套结构的 Vue 路由数组
 */
export function buildVueRouteTree(routes: any[]): RouteNode[] {
  const map = new Map<bigint, RouteNode>();
  const tree: RouteNode[] = [];

  routes.forEach((route) => {
    // 提取权限值数组（string[]）
    const permissionList: string[] = (route.permissions ?? []).map(
      (p: any) => p.value,
    );

    map.set(route.id, {
      id: route.id,
      parentId: route.parentId,
      path: route.path,
      component: route.component,
      redirect: route.redirect,
      name: route.name,
      meta: {
        title: route.title,
        icon: route.icon || null,
        noCache: route.noCache === true,
        breadcrumb: route.breadcrumb !== false, // 默认为 true
        affix: route.affix === true,
        hidden: route.hidden === true,
        noTagsView: route.noTagsView === true,
        activeMenu: route.activeMenu || null,
        canTo: route.canTo === true,
        permissionList,
      },
      permission: route.permission ?? [],
      children: [],
    });
  });

  routes.forEach((route) => {
    const node = map.get(route.id)!;
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else if (!node.parentId) {
      tree.push(node);
    }
  });

  return tree;
}
