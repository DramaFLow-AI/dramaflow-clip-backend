import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

// 输入的 txt 文件路径
const inputPath = path.resolve('./input.txt');
// 输出的 js 文件路径
const outputPath = path.resolve('./output.js');

// 读取 txt 内容
const txtContent = readFileSync(inputPath, 'utf-8');

// 转换成 JS 安全字符串（转义引号和换行）
const jsString = txtContent
  .replace(/\\/g, '\\\\') // 转义反斜杠
  .replace(/`/g, '\\`') // 转义反引号
  .replace(/\$/g, '\\$') // 转义模板变量
  .replace(/\r?\n/g, '\\n'); // 转义换行

// 生成最终 JS 文件内容
const jsFileContent = `export const text = \`${jsString}\`;\n`;

// 写入到新的文件
writeFileSync(outputPath, jsFileContent, 'utf-8');

console.log(`✅ 转换完成：${outputPath}`);
