/**
 * 稳定 ID 生成工具（架构文档 7.2 命名规范）。
 * 字段 f_xxx / 表单 form_xxx / 应用 app_xxx：前缀表达语义，短随机后缀避免碰撞。
 * ID 一经生成跨环境保持不变，是「配置与数据分离」的锚点。
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SUFFIX_LENGTH = 10;

/**
 * 生成短随机后缀。
 * 优先使用浏览器密码学安全随机源；非安全上下文下降级为 Math.random（仅用于本地 ID 占位）。
 */
function randomSuffix(): string {
  let output = '';
  const cryptoRef = globalThis.crypto;

  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = new Uint8Array(SUFFIX_LENGTH);
    cryptoRef.getRandomValues(bytes);
    for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
      output += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return output;
  }

  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    output += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return output;
}

/** 生成字段稳定 ID，形如 f_x7k2p9q1m3 */
export function genFieldId(): string {
  return `f_${randomSuffix()}`;
}

/** 生成表单稳定 ID，形如 form_x7k2p9q1m3 */
export function genFormId(): string {
  return `form_${randomSuffix()}`;
}

/** 生成应用稳定 ID，形如 app_x7k2p9q1m3 */
export function genAppId(): string {
  return `app_${randomSuffix()}`;
}
