# Agent rules

NEVER build outbox, texting/email notification machinery, cron, worker services, or setInterval/setTimeout loops in `instrumentation.ts` into this app. Time-based state is computed on read, advanced idempotently on the request that touches it, or advanced by a staff button. External events go only through Openfront Commerce webhooks. Reports are Export buttons; invites are copyable links.

There is no `instrumentation.ts`. The former class-reminder email loop was removed (2026-11-11); booking and membership confirmations are sent on the request that creates them.
