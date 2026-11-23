#!/usr/bin/env bash
# WSL2 后端自动核验（方案 B）
#
# 只用 docker info 的四项断言判定后端类型，绝不调用任何 Windows WSL 命令行工具，
# 因此不受本机安全策略对该工具的拦截影响。
#
# 断言：
#   1. KernelVersion 含 microsoft-standard-WSL2
#   2. OSType 等于 linux
#   3. Name 含 docker-desktop
#   4. DefaultRuntime 含 runc
#
# 用法：
#   bash scripts/check-wsl2.sh
#   DOCKER_BIN="/c/Program Files/Docker/Docker/resources/bin/docker.exe" bash scripts/check-wsl2.sh
#
# 失败时输出固定提示并以退出码 1 结束，可直接作为 CI / E2E 前置门禁。

set -uo pipefail

HINT='WSL2 engine 未启用，请在 Docker Desktop → Settings → General 勾选'

fail() {
  printf '[wsl2] FAIL: %s\n' "$1" >&2
  printf '%s\n' "$HINT" >&2
  exit 1
}

# 解析 docker：显式 DOCKER_BIN > PATH > Windows 标准安装路径 > Linux/macOS 常规路径
if [ -n "${DOCKER_BIN:-}" ] && [ -x "$DOCKER_BIN" ]; then
  DOCKER="$DOCKER_BIN"
elif command -v docker >/dev/null 2>&1; then
  DOCKER="$(command -v docker)"
elif [ -x '/c/Program Files/Docker/Docker/resources/bin/docker.exe' ]; then
  DOCKER='/c/Program Files/Docker/Docker/resources/bin/docker.exe'
elif [ -x '/c/ProgramData/DockerDesktop/version-bin/docker.exe' ]; then
  DOCKER='/c/ProgramData/DockerDesktop/version-bin/docker.exe'
else
  fail '未找到 Docker 可执行文件，请确认 Docker Desktop 已安装运行或设置 DOCKER_BIN'
fi

info() {
  "$DOCKER" info --format "$1" 2>/dev/null
}

KERNEL="$(info '{{.KernelVersion}}')"
[ -n "$KERNEL" ] || fail 'docker info 无响应，请确认 Docker Desktop 正在运行'
OS_TYPE="$(info '{{.OSType}}')"
NAME="$(info '{{.Name}}')"
RUNTIME="$(info '{{.DefaultRuntime}}')"

printf '%s' "$KERNEL" | grep -qi 'microsoft-standard-WSL2' \
  || fail "断言 1 未通过：KernelVersion=${KERNEL:-<空>} 不含 microsoft-standard-WSL2"
[ "$OS_TYPE" = 'linux' ] \
  || fail "断言 2 未通过：OSType=${OS_TYPE:-<空>} 不等于 linux"
printf '%s' "$NAME" | grep -q 'docker-desktop' \
  || fail "断言 3 未通过：Name=${NAME:-<空>} 不含 docker-desktop"
printf '%s' "$RUNTIME" | grep -q 'runc' \
  || fail "断言 4 未通过：DefaultRuntime=${RUNTIME:-<空>} 不含 runc"

printf '[wsl2] PASS: 四断言全部通过 (KernelVersion=%s, OSType=%s, Name=%s, DefaultRuntime=%s)\n' \
  "$KERNEL" "$OS_TYPE" "$NAME" "$RUNTIME"
