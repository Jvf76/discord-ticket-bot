#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${REPO_ROOT}/.git-profiles.local"

usage() {
  cat <<'EOF'
Uso:
  bash scripts/git-push-as.sh hiago
  bash scripts/git-push-as.sh joao
  bash scripts/git-push-as.sh hiago origin main
EOF
}

if [[ $# -lt 1 ]]; then
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

SSH_KEY_VAR="PROFILE_${PROFILE_KEY}_SSH_KEY"
PROFILE_SSH_KEY="${!SSH_KEY_VAR:-}"

if [[ -z "${PROFILE_SSH_KEY}" ]]; then
  echo "Chave SSH do perfil '$PROFILE_KEY' nao configurada em ${CONFIG_FILE}."
  exit 1
fi

if [[ ! -f "${PROFILE_SSH_KEY}" ]]; then
  echo "Chave SSH nao encontrada em ${PROFILE_SSH_KEY}."
  exit 1
fi

REMOTE="${1:-origin}"
BRANCH="${2:-$(git -C "${REPO_ROOT}" branch --show-current)}"

if [[ -z "${BRANCH}" ]]; then
  echo "Nao foi possivel identificar a branch atual."
  exit 1
fi

GIT_SSH_COMMAND="ssh -i ${PROFILE_SSH_KEY} -o IdentitiesOnly=yes" \
  git -C "${REPO_ROOT}" push "${REMOTE}" "${BRANCH}"

echo "Push enviado com a chave ${PROFILE_SSH_KEY} para ${REMOTE}/${BRANCH}."
