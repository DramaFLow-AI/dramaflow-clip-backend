/**
 * PM2 进程管理配置文件
 * 用于在服务器上管理应用进程
 *
 * 使用方法：
 * 1. 将此文件复制到服务器的项目根目录（打包后的 dist 目录）
 * 2. 运行: pm2 start ecosystem.config.js --only gemini-staging
 *    或:   pm2 start ecosystem.config.js --only gemini-prod
 *
 * 管理命令：
 * - pm2 status                # 查看进程状态
 * - pm2 logs                  # 查看日志
 * - pm2 restart gemini-staging # 重启测试环境
 * - pm2 stop gemini-staging   # 停止测试环境
 * - pm2 delete gemini-staging # 删除进程
 */

module.exports = {
  apps: [
    // 测试服务器配置
    {
      name: 'gemini-staging',
      script: './src/main.js',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'staging',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // 正式服务器配置
    {
      name: 'gemini-prod',
      script: './src/main.js',
      instances: 2, // 生产环境可以开启多实例
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'prod',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
