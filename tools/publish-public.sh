#!/usr/bin/env bash
# Publish the current commit to the public openslop2 repo as ONE new commit on its main branch.
# Only today's files go out; this repo's history never does (the new commit's only parent is the public repo's last commit).
#
#   tools/publish-public.sh                 # message = subject of the current commit
#   tools/publish-public.sh "Release 0.6"   # custom message
#
# PUBLIC_REPO overrides the target (default https://github.com/fp101fs/openslop2.git).
set -euo pipefail
REPO="${PUBLIC_REPO:-https://github.com/fp101fs/openslop2.git}"
cd "$(git rev-parse --show-toplevel)"

[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first." >&2; exit 1; }
git remote get-url public >/dev/null 2>&1 || git remote add public "$REPO"

tree=$(git rev-parse 'HEAD^{tree}')
parent=()
if git fetch -q public main 2>/dev/null; then
  if [ "$(git rev-parse 'FETCH_HEAD^{tree}')" = "$tree" ]; then echo "Public repo is already up to date."; exit 0; fi
  parent=(-p FETCH_HEAD)
fi

msg="${1:-$(git log -1 --format=%s)}"
commit=$(git commit-tree "$tree" ${parent[@]+"${parent[@]}"} -m "$msg")
git push public "$commit:refs/heads/main"
echo "Published $(git rev-parse --short "$commit") to $REPO"
