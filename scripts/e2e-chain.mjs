#!/usr/bin/env node
/**
 * 主链路端到端验证：搭建表单 → 发布 → 自动建表 → 填报 → 渲染。
 *
 * 前置条件：MySQL 8 容器 healthy、已执行 pnpm run migrate、后端已启动在 BASE_URL。
 * 默认从仓库根目录 .env 读取连接参数与 API 地址；DB_HOST=127.0.0.1 为宿主机调试。
 * 入口先自动核验 WSL2 后端（docker info 四断言）；非 Windows CI 可用 E2E_SKIP_WSL2_CHECK=1 跳过。
 *
 * 用法：node scripts/e2e-chain.mjs
 * 输出：每步的 HTTP 状态与关键字段摘要；全部断言通过时退出码 0。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { assertWsl2Engine } from './check-wsl2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) values[key] = value;
  }
  return values;
}

const env = { ...loadDotEnv(path.join(ROOT, '.env')), ...process.env };
const BASE_URL = process.env.E2E_BASE_URL || env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const ADMIN_USERNAME = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'admin123';
const suffix = Date.now().toString(36);
let APP_ID = `app_e2e_${suffix}`;
const FORM_ID = `form_e2e_${suffix}`;
// MySQLDialect.tableName 会去掉 form_ 前缀，避免 t_form_form_xxx
const TABLE_NAME = `t_form_${FORM_ID.replace(/^form_/, '')}`;

/** 统一请求：返回解包后的 data，并校验 code=0 */
async function api(method, urlPath, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${urlPath} 返回非 JSON: ${text.slice(0, 200)}`);
  }
  if (!response.ok || payload.code !== 0) {
    throw new Error(`${method} ${urlPath} 失败: HTTP ${response.status} code=${payload.code} message=${payload.message}`);
  }
  return payload.data;
}

function assert(condition, message) {
  if (!condition) throw new Error(`断言失败: ${message}`);
}

/** 报价单 Schema：含公式字段与显示条件 */
function buildSchema() {
  const fields = [
    { id: 'f_name', widget: 'text', label: '客户名称', binding: { column: 'f_name', dataType: 'varchar' }, props: {}, required: true },
    { id: 'f_price', widget: 'number', label: '单价', binding: { column: 'f_price', dataType: 'decimal' }, props: {}, defaultValue: 0 },
    { id: 'f_qty', widget: 'number', label: '数量', binding: { column: 'f_qty', dataType: 'int' }, props: {}, defaultValue: 0 },
    { id: 'f_amount', widget: 'formula', label: '金额', binding: { column: 'f_amount', dataType: 'decimal' }, props: {}, formula: { expr: 'f_price * f_qty', deps: ['f_price', 'f_qty'], precision: 2 } },
    { id: 'f_remark', widget: 'text', label: '备注', binding: { column: 'f_remark', dataType: 'varchar' }, props: {}, visibleWhen: { expr: 'f_amount > 1000', deps: ['f_amount'] } },
  ];
  return {
    schemaVersion: '1.0.0',
    kind: 'form',
    id: FORM_ID,
    fields,
    layout: {
      pc: fields.map((field) => ({ fieldId: field.id, span: 12 })),
      h5: fields.map((field) => ({ fieldId: field.id, span: 24 })),
    },
    listView: { columns: ['f_name', 'f_amount'], filters: [], sort: [], pageSize: 20 },
  };
}

async function main() {
  // ⓪ 前置断言：自动核验 Docker Desktop 的 WSL2 后端（四断言，不调用 WSL 命令行工具）。
  // 仅在非 Windows CI 等确无 docker-desktop 的环境用 E2E_SKIP_WSL2_CHECK=1 显式跳过。
  if (process.env.E2E_SKIP_WSL2_CHECK === '1') {
    console.log('[E2E] ⓪ WSL2 核验已通过 E2E_SKIP_WSL2_CHECK=1 显式跳过');
  } else {
    assertWsl2Engine();
  }
  console.log(`[E2E] BASE_URL=${BASE_URL} APP_ID=${APP_ID} FORM_ID=${FORM_ID}`);

  // ① 登录
  const login = await api('POST', '/v1/auth/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  const token = login.token;
  assert(token, '登录未返回 token');
  console.log(`[E2E] ① 登录成功: user=${login.user.username} role=${login.user.role}`);

  // ② 搭建：创建应用 + 表单 + 保存 Schema
  const app = await api('POST', '/v1/apps', { name: `E2E 应用 ${suffix}`, description: '联调自动创建' }, token);
  // 应用 id 由服务端生成（app_<uuid>），以返回值为准
  assert(typeof app.id === 'string' && app.id.startsWith('app_'), `应用 id 异常: ${app.id}`);
  APP_ID = app.id;
  console.log(`[E2E] ② 应用创建成功: ${APP_ID}`);

  const form = await api('POST', `/v1/apps/${APP_ID}/forms`, { appId: APP_ID, formId: FORM_ID, name: 'E2E 报价单' }, token);
  assert(form.id === FORM_ID, `表单 id 不符: ${form.id}`);
  console.log(`[E2E] ② 表单草稿创建成功: ${form.id} fields=${form.fields.length}`);

  const schema = buildSchema();
  const saved = await api('PUT', `/v1/forms/${FORM_ID}/schema`, { schema }, token);
  assert(saved.fields.length === 5, '草稿 Schema 字段数不符');
  console.log(`[E2E] ② 搭建完成: 字段 ${saved.fields.map((f) => f.id).join(',')}`);

  // ③ 发布：触发幂等 DDL
  const published = await api('POST', `/v1/forms/${FORM_ID}/publish`, {}, token);
  assert(published.tableName === TABLE_NAME, `发布表名不符: ${published.tableName}`);
  assert(published.version >= 1, `发布版本号异常: ${published.version}`);
  console.log(`[E2E] ③ 发布成功: version=${published.version} table=${published.tableName}`);
  console.log(`[E2E] ③ DDL: ${published.ddl.replace(/\n/g, ' ').slice(0, 220)}...`);

  // ④ 核验数据库真实建表
  const dbConfig = {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'hengyida',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'hengyida',
  };
  const conn = await mysql.createConnection(dbConfig);
  let columns = [];
  try {
    const [tableRows] = await conn.query(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
      [dbConfig.database, TABLE_NAME],
    );
    assert(tableRows.length === 1, `数据库中未找到物理表 ${TABLE_NAME}`);
    const [columnRows] = await conn.query(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',
      [dbConfig.database, TABLE_NAME],
    );
    columns = columnRows.map((row) => row.COLUMN_NAME);
    assert(['id', 'f_name', 'f_price', 'f_qty', 'f_amount', 'f_remark', 'created_at', 'updated_at'].every((c) => columns.includes(c)), `物理表字段缺失: ${columns.join(',')}`);
    console.log(`[E2E] ④ 数据库核验通过: ${TABLE_NAME} 列=[${columns.join(', ')}]`);
  } finally {
    await conn.end();
  }

  // ⑤ 填报：客户端伪造公式值，服务端应权威重算
  const record = await api('POST', `/v1/data/${FORM_ID}`, {
    values: { f_name: '唐山测试客户', f_price: 12.5, f_qty: 4, f_amount: 999999, f_remark: '隐藏字段不应落库' },
  }, token);
  assert(Number(record.values.f_amount) === 50, `公式值未被服务端重算: ${record.values.f_amount}`);
  assert(record.values.f_remark === undefined, '隐藏字段未被剔除');
  console.log(`[E2E] ⑤ 填报成功: id=${record.id} f_amount=${record.values.f_amount}（客户端伪值 999999 已覆盖）`);
  console.log(`[E2E] ⑤ 隐藏字段 f_remark=${record.values.f_remark}`);

  // ⑥ 渲染：读回发布 Schema + 列表数据，验证 id → column 映射闭环
  const renderSchema = await api('GET', `/v1/forms/${FORM_ID}/schema?published=1`, undefined, token);
  assert(renderSchema.fields.length === 5, '渲染 Schema 字段数不符');
  const list = await api('GET', `/v1/data/${FORM_ID}?page=1&pageSize=20`, undefined, token);
  assert(list.total >= 1, '列表查询未返回记录');
  const row = list.rows.find((item) => item.id === record.id);
  assert(row, '列表中找不到刚提交的记录');
  const renderValues = {};
  for (const field of renderSchema.fields) {
    renderValues[field.id] = row.values[field.binding.column];
  }
  assert(Number(renderValues.f_amount) === 50, '渲染契约不一致');
  console.log(`[E2E] ⑥ 渲染成功: total=${list.total} f_name=${renderValues.f_name} f_amount=${renderValues.f_amount}`);
  console.log('[E2E] ALL PASS: 搭建→发布→自动建表→填报→渲染 全链路通过');
}

main().catch((error) => {
  console.error(`[E2E] FAILED: ${error.stack}`);
  process.exitCode = 1;
});
