#!/usr/bin/env bash

# ========================================
# Gemini Nest 服务器启动脚本
# 用法：
#   ./start.sh staging  # 启动测试环境
#   ./start.sh prod     # 启动生产环境
# ========================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 检查参数
ENV=$1

if [ -z "$ENV" ]; then
    log_error "请指定环境参数"
    echo "用法: ./start.sh [staging|prod]"
    echo ""
    echo "示例:"
    echo "  ./start.sh staging  # 启动测试环境"
    echo "  ./start.sh prod     # 启动生产环境"
    exit 1
fi

# 验证环境参数
if [ "$ENV" != "staging" ] && [ "$ENV" != "prod" ]; then
    log_error "无效的环境: '$ENV'"
    echo "支持的环境: staging, prod"
    exit 1
fi

log_info "========================================="
log_info "启动 $ENV 环境"
log_info "========================================="

# 检查配置文件
ENV_FILE=".env.$ENV"
if [ ! -f "$ENV_FILE" ]; then
    log_error "配置文件不存在: $ENV_FILE"
    log_error "请确保配置文件存在于当前目录"
    exit 1
fi
log_info "找到配置文件: $ENV_FILE"

# 检查入口文件
MAIN_FILE="src/main.js"
if [ ! -f "$MAIN_FILE" ]; then
    log_error "入口文件不存在: $MAIN_FILE"
    log_error "请确保在正确的目录（dist 目录）中运行此脚本"
    exit 1
fi
log_info "找到入口文件: $MAIN_FILE"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    log_error "未找到 Node.js"
    log_error "请先安装 Node.js"
    exit 1
fi
NODE_VERSION=$(node -v)
log_info "Node.js 版本: $NODE_VERSION"

# 检查 package.json
if [ ! -f "package.json" ]; then
    log_warn "未找到 package.json"
    log_warn "建议先运行: pnpm install --prod"
fi

# 设置环境变量
export NODE_ENV=$ENV
log_info "已设置 NODE_ENV=$ENV"

# 信号处理
trap 'log_warn "收到退出信号，正在停止应用..."; exit 0' SIGINT SIGTERM

# 启动应用
log_info "========================================="
log_info "正在启动应用..."
log_info "========================================="
echo ""

# 执行 Node 应用
exec node "$MAIN_FILE"
