// Class reminder emails, sent from inside the production server process so no separate worker is needed.
// Each reminder is claimed once per booking (OperationalNotice unique key), so replicas can run side by side.
const INTERVAL_MS = 5 * 60_000

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return
  const globalState = globalThis as unknown as { classReminderLoop?: boolean }
  if (globalState.classReminderLoop) return
  globalState.classReminderLoop = true

  let running = false
  const pass = async () => {
    if (running) return
    running = true
    try {
      const [{ keystoneContext }, { sendDueClassReminders }] = await Promise.all([
        import('./features/keystone/context'),
        import('./features/keystone/lib/order-confirmation'),
      ])
      await sendDueClassReminders((keystoneContext.sudo() as any).prisma)
    } catch {
      console.error('[class-reminders] pass failed; retrying on the next interval')
    } finally {
      running = false
    }
  }
  setInterval(() => { void pass() }, INTERVAL_MS).unref?.()
  setTimeout(() => { void pass() }, 30_000).unref?.()
}
