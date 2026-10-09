#!/bin/sh
# TEST ONLY: consume mail locally; no external delivery.
cat >> /tmp/aeroventa-v43-test-mail.txt
printf '\n---END MOCK EMAIL---\n' >> /tmp/aeroventa-v43-test-mail.txt
exit 0
