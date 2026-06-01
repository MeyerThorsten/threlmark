#!/usr/bin/env bash
#
# Publish the Threlmark marketing site (site/**) to threlmark.com on all-inkl
# over FTP(S) with curl. Repeatable: `npm run deploy:marketing`.
#
# Credentials come from .deploy.env (gitignored — copy .deploy.env.example).
# Never hard-code or commit them. Each all-inkl domain has its OWN FTP account
# (chrooted to that domain), so use threlmark.com's FTP login here — another
# domain's credentials will not reach it.
#
# Flags:
#   --dry-run   list what would upload, transfer nothing
#
set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "unknown flag: $a" >&2; exit 2 ;;
  esac
done

[ -f .deploy.env ] || { echo "✗ missing .deploy.env (copy .deploy.env.example and fill it in)" >&2; exit 1; }
set -a; . ./.deploy.env; set +a
: "${FTP_HOST:?set FTP_HOST in .deploy.env}"
: "${FTP_USER:?set FTP_USER in .deploy.env}"
: "${FTP_PASS:?set FTP_PASS in .deploy.env}"
FTP_PATH="${FTP_PATH:-/}"
case "$FTP_PATH" in */) ;; *) FTP_PATH="$FTP_PATH/" ;; esac

# TLS on the CONTROL channel only (login/password encrypted), data channel in
# clear. all-inkl's ProFTPD rejects TLS-session reuse on the *data* channel, so
# full FTPS aborts transfers after the first with a 426. The uploaded files are
# the PUBLIC marketing site, so clear-text data is fine; the password stays
# protected by control-channel TLS. --disable-epsv forces classic PASV.
# --ftp-create-dirs creates remote subfolders (e.g. articles/). All files go in
# ONE session to avoid the server's rapid-login throttle.
CURL_BASE=(curl -fsS --ftp-ssl-control --disable-epsv --ftp-create-dirs
  --retry 2 --retry-delay 2 --connect-timeout 20 --user "$FTP_USER:$FTP_PASS")

# Every regular file under site/, structure preserved, junk excluded.
mapfile -t files < <(cd site && find . -type f ! -name '.DS_Store' | sed 's|^\./||' | sort)
[ "${#files[@]}" -gt 0 ] || { echo "✗ no files under site/ to deploy" >&2; exit 1; }

echo "→ ${#files[@]} files → ${FTP_HOST}${FTP_PATH} (FTPS, control-channel TLS)"
if [ "$DRY_RUN" = 1 ]; then
  for f in "${files[@]}"; do echo "  [dry-run] $f"; done
  exit 0
fi

upload_args=()
for f in "${files[@]}"; do
  upload_args+=(-T "site/$f" "ftp://${FTP_HOST}${FTP_PATH}${f}")
done
"${CURL_BASE[@]}" "${upload_args[@]}"
for f in "${files[@]}"; do echo "  ✓ $f"; done

echo "✓ deployed ${#files[@]} file(s) to threlmark.com"
