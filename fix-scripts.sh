#!/usr/bin/env bash

# ========================================
# 修复脚本文件（转换换行符和设置权限）
# 在 Linux 服务器上首次部署时运行此脚本
# ========================================

echo "========================================="
echo "正在修复脚本文件..."
echo "========================================="

# 修复 start.sh
if [ -f "start.sh" ]; then
    echo "修复 start.sh ..."
    sed -i 's/\r$//' start.sh 2>/dev/null || dos2unix start.sh 2>/dev/null
    chmod +x start.sh
    echo "✓ start.sh 已修复"
else
    echo "⚠ 未找到 start.sh"
fi

# 修复当前脚本自己
if [ -f "fix-scripts.sh" ]; then
    echo "修复 fix-scripts.sh ..."
    sed -i 's/\r$//' fix-scripts.sh 2>/dev/null || dos2unix fix-scripts.sh 2>/dev/null
    chmod +x fix-scripts.sh
    echo "✓ fix-scripts.sh 已修复"
fi

echo ""
echo "========================================="
echo "修复完成！"
echo "========================================="
echo ""
echo "现在可以使用以下命令启动应用："
echo "  ./start.sh staging  # 启动测试环境"
echo "  ./start.sh prod     # 启动生产环境"
echo ""
