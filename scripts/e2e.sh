#!/usr/bin/env bash
# End-to-end test run: production build + Razorpay test double + Playwright.
# DESTRUCTIVE for the target database — it is reset and re-seeded. Requires a dedicated E2E_DATABASE_URL.
set -euo pipefail

if [[ -z "${E2E_DATABASE_URL:-}" ]]; then
  echo "Set E2E_DATABASE_URL to a throwaway PostgreSQL database (it will be wiped)." >&2
  exit 1
fi

export DATABASE_URL="$E2E_DATABASE_URL" DIRECT_URL="$E2E_DATABASE_URL"
export NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
export APP_URL="http://localhost:3000"
export AUTH_SECRET="${AUTH_SECRET:-e2e-auth-secret-that-is-long-enough-000000}"
export RAZORPAY_KEY_ID="rzp_test_E2EDOUBLE" NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_E2EDOUBLE"
export RAZORPAY_KEY_SECRET="e2e_key_secret" RAZORPAY_WEBHOOK_SECRET="e2e_webhook_secret"
export RAZORPAY_API_BASE="http://127.0.0.1:4010/v1"   # the test double — never set this in production
export RZP_KEY_ID="$RAZORPAY_KEY_ID" RZP_KEY_SECRET="$RAZORPAY_KEY_SECRET" RZP_WEBHOOK_SECRET="$RAZORPAY_WEBHOOK_SECRET"
export CRON_SECRET="e2e_cron_secret" ALLOW_LOCAL_UPLOADS=true
export RATE_LIMIT_REGISTER_PER_HOUR=1000 RATE_LIMIT_LOGIN_PER_IP=1000 RATE_LIMIT_LOGIN_PER_ACCOUNT=1000
unset CLOUDINARY_CLOUD_NAME RESEND_API_KEY || true

for port in 3000 4010; do
  if curl -s -o /dev/null "http://127.0.0.1:$port"; then
    echo "Port $port is already in use — stop the old server first (tests would hit a stale build)." >&2
    exit 1
  fi
done

npx prisma migrate reset --force --skip-seed --skip-generate
NODE_ENV=development npx tsx prisma/seed.ts
[[ "${SKIP_BUILD:-}" == "1" ]] || npx next build

npx tsx tests/e2e/razorpay-double.ts > /tmp/rzp-double.log 2>&1 &
DOUBLE=$!
npx next start -p 3000 > /tmp/next-start.log 2>&1 &
SERVER=$!
trap 'kill $DOUBLE $SERVER 2>/dev/null || true' EXIT

for i in $(seq 1 60); do curl -sf http://localhost:3000/api/health >/dev/null && break; sleep 1; done
mkdir -p screenshots
export E2E_RUN_ID="${E2E_RUN_ID:-$(date +%s)}"
npx playwright test "$@"
