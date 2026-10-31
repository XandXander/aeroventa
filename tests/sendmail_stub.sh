#!/bin/sh
# TEST ONLY: consume mail locally; no external delivery.
if [ -n "$AEROVENTA_TEST_MAIL_FAILURE" ] && [ -f "$AEROVENTA_TEST_MAIL_FAILURE" ]; then
  cat >/dev/null
  exit 75
fi
cat >> /tmp/aeroventa-v43-test-mail.txt
printf '\n---END MOCK EMAIL---\n' >> /tmp/aeroventa-v43-test-mail.txt
exit 0
