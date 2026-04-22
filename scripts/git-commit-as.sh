#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${REPO_ROOT}/.git-profiles.local"

usage() {
  cat <<'EOF'
Uso:
  bash scripts/git-commit-as.sh hiago "mensagem do commit"
  bash scripts/git-commit-as.sh joao "mensagem do commit"
EOF
}

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Arquivo ${CONFIG_FILE} nao encontrado."
  echo "Copie .git-profiles.local.example para .git-profiles.local e preencha os dados."
  exit 1
fi

PROFILE_KEY="$(printf '%s' "$1" | tr '[:lower:]-' '[:upper:]_')"
shift

# shellcheck disable=SC1090
source "${CONFIG_FILE}"

NAME_VAR="PROFILE_${PROFILE_KEY}_NAME"
EMAIL_VAR="PROFILE_${PROFILE_KEY}_EMAIL"

PROFILE_NAME="${!NAME_VAR:-}"
PROFILE_EMAIL="${!EMAIL_VAR:-}"

if [[ -z "${PROFILE_NAME}" || -z "${PROFILE_EMAIL}" ]]; then
  echo "Perfil '$PROFILE_KEY' nao configurado corretamente em ${CONFIG_FILE}."
  exit 1
fi

git -C "${REPO_ROOT}" add -A

if git -C "${REPO_ROOT}" diff --cached --quiet; then
  echo "Nao ha alteracoes para commitar."
  exit 0
fi

git -C "${REPO_ROOT}" \
  -c user.name="${PROFILE_NAME}" \
  -c user.email="${PROFILE_EMAIL}" \
  commit -m "$*"

echo "Commit criado como ${PROFILE_NAME} <${PROFILE_EMAIL}>."
echo "Para enviar ao remoto, use seu fluxo normal: git push"
