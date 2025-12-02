import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { writeFileSync } from 'fs';
import * as yaml from 'yaml';

export const setupSwagger = (app: INestApplication) => {
  const config = new DocumentBuilder()
    .setTitle('Gemini Api 接口文档')
    .setDescription('基于 NestJS 实现的聊天与语音生成 API 服务')
    .setVersion('1.0.0')
    .addServer('/api')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // 启动时生成 swagger.json
  writeFileSync('./swagger.json', JSON.stringify(document, null, 2));
  // 启动时生成 swagger.yaml
  writeFileSync('./swagger.yaml', yaml.stringify(document));

  // ✨ Scalar API 文档（现代化 UI，推荐）
  app.use(
    '/docs',
    apiReference({
      spec: {
        content: document,
      },
      theme: 'purple', // 主题：purple, bluePlanet, deepSpace, saturn, kepler
      layout: 'modern', // 布局：modern, classic
      darkMode: true, // 默认暗色模式
      searchHotKey: 'k', // Ctrl/Cmd + K 快速搜索
      metaData: {
        title: 'Gemini API 文档 - Scalar',
        description: 'Gemini 聊天与语音生成 API',
        favicon: '/favicon.ico',
      },
    }),
  );

  // 原有的 Swagger UI（备用）
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'Gemini API - Swagger UI',
    customCss: '.swagger-ui .topbar { display: none }', // 隐藏顶部栏
  });
};
