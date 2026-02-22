#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIN_NODE_MAJOR=22
ALIAS_LINE="alias openclaw='node ${ROOT_DIR}/dist/index.js'"

log() {
  printf '%s\n' "[openclaw-setup] $*"
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    log "Node.js is required but not found. Install Node ${MIN_NODE_MAJOR}+ first."
    exit 1
  fi

  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "${major}" -lt "${MIN_NODE_MAJOR}" ]]; then
    log "Node.js ${MIN_NODE_MAJOR}+ required, found $(node -v)."
    exit 1
  fi
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return 0
  fi

  log "pnpm not found; trying Corepack."
  if ! command -v corepack >/dev/null 2>&1; then
    log "Corepack is unavailable. Install pnpm manually: npm i -g pnpm"
    exit 1
  fi

  corepack enable
  corepack prepare pnpm@latest --activate

  if ! command -v pnpm >/dev/null 2>&1; then
    log "pnpm install via Corepack failed. Install manually: npm i -g pnpm"
    exit 1
  fi
}

ensure_dist() {
  if [[ -f "${ROOT_DIR}/dist/index.js" ]]; then
    return 0
  fi

  log "dist/index.js missing. Building once on this host."
  (cd "${ROOT_DIR}" && pnpm ui:build && pnpm build)
}

install_runtime_deps() {
  log "Installing runtime dependencies."
  (cd "${ROOT_DIR}" && pnpm install --prod)
}

ensure_alias_in_file() {
  local file="$1"
  [[ -f "${file}" ]] || touch "${file}"

  if rg -F "${ALIAS_LINE}" "${file}" >/dev/null 2>&1; then
    return 0
  fi

  {
    printf '\n# OpenClaw local runtime alias\n'
    printf '%s\n' "${ALIAS_LINE}"
  } >>"${file}"
}

ensure_shell_aliases() {
  ensure_alias_in_file "$HOME/.bashrc"
  ensure_alias_in_file "$HOME/.zshrc"

  log "Alias configured for bash/zsh: openclaw -> node ${ROOT_DIR}/dist/index.js"
  log "Run: source ~/.bashrc  (or source ~/.zshrc)"
}

main() {
  ensure_node
  ensure_pnpm
  install_runtime_deps
  ensure_dist
  ensure_shell_aliases
  log "Setup complete."
}

main "$@"
