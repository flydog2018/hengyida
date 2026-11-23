/**
 * 统一 API 客户端：统一 baseURL、Schema 版本头、{code,data,message} 解包与错误映射。
 * 业务组件只调用本客户端，不直接使用 axios。
 */
import axios, { type AxiosInstance } from 'axios';
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  SCHEMA_VERSION_HEADER,
  CURRENT_SCHEMA_VERSION,
  type SchemaEnvelope,
} from '@hengyida/shared';

const baseURL = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_BASE_URL ?? '/api';

const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 10000,
  headers: { [SCHEMA_VERSION_HEADER]: CURRENT_SCHEMA_VERSION },
});

/** 业务异常（携带错误码） */
export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message || ERROR_MESSAGES[code] || '请求失败');
    this.name = 'ApiError';
  }
}

/** 统一解包响应：code!==0 抛 ApiError */
async function unwrap<T>(promise: Promise<{ data: { code: number; data: T; message: string } }>): Promise<T> {
  const { data: resp } = await promise;
  if (resp.code !== ERROR_CODES.OK) {
    throw new ApiError(resp.code, resp.message);
  }
  return resp.data;
}

export const api = {
  /** 获取表单配置（按 Schema 渲染） */
  getFormSchema: (formId: string) =>
    unwrap<SchemaEnvelope>(http.get(`/forms/${formId}/schema`)),

  /** 列出应用 */
  listApps: <T>() => unwrap<T[]>(http.get('/apps')),

  /** 列出数据（筛选/排序/分页） */
  listRecords: <T>(formId: string, params?: Record<string, unknown>) =>
    unwrap<T>(http.get(`/forms/${formId}/records`, { params })),

  /** 填报（服务端权威计算后落库） */
  createRecord: <T>(formId: string, values: Record<string, unknown>) =>
    unwrap<T>(http.post(`/forms/${formId}/records`, { values })),
};

export default http;
