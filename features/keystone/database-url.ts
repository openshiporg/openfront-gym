/**
 * Postgres URL with a bounded Prisma pool.
 *
 * Prisma's default pool is cpus*2+1. On a 48-core Railway host that is 97 connections for a single client, and
 * Postgres's default max_connections is 100, so one web container can fill the server with idle connections; then
 * Keystone's access-control and count queries fail with "too many clients". Every Prisma client in a process
 * therefore gets an explicit share: the Keystone web client 5, each extra client 2. Few, recycled backends keep
 * PostgreSQL memory bounded: each backend can retain over 1 GB after the nested access-filter queries.
 *
 * DATABASE_CONNECTION_LIMIT overrides the web pool and DATABASE_CONNECTION_LIMIT_WORKER every extra pool.
 * A connection_limit already present in the URL always wins.
 */
export const POOL_SIZES = { web: 5, worker: 2 } as const

export type PoolRole = keyof typeof POOL_SIZES

const OVERRIDE_ENV: Record<PoolRole, string> = {
  web: 'DATABASE_CONNECTION_LIMIT',
  worker: 'DATABASE_CONNECTION_LIMIT_WORKER',
}

export function pooledDatabaseUrl(url: string, role?: PoolRole): string
export function pooledDatabaseUrl(url: string | undefined, role?: PoolRole): string | undefined
export function pooledDatabaseUrl(url: string | undefined, role: PoolRole = 'web'): string | undefined {
  if (!url || !/^postgres(ql)?:\/\//.test(url)) return url
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  // Keystone's nested matter/ethical-wall filters generate large prepared query trees.
  // Prisma defaults to retaining 100 statements per connection (on BOTH client and DB).
  // A five-role crawl retained >12 GB in 15 idle PostgreSQL backends on a 22 MB DB.
  // Do not retain these one-off dashboard shapes; preserve an explicit operator choice.
  if (!parsed.searchParams.has('statement_cache_size')) parsed.searchParams.set('statement_cache_size', '0')
  // OLTP access filters on tiny tables do not benefit from PostgreSQL LLVM JIT.
  // Its compiled allocation stays resident after these deeply nested queries finish.
  let options = parsed.searchParams.get('options') ?? ''
  if (!/\bjit\s*=/.test(options)) options = `${options} -c jit=off`.trim()
  // A backend that has grown large is closed by the server after 60 s idle instead of
  // holding its memory; the app recycles idle connections first (30 s) so it never
  // reuses one the server has closed.
  if (!/\bidle_session_timeout\s*=/.test(options)) options = `${options} -c idle_session_timeout=60000`.trim()
  parsed.searchParams.set('options', options)
  if (!parsed.searchParams.has('max_idle_connection_lifetime')) parsed.searchParams.set('max_idle_connection_lifetime', '30')
  if (!parsed.searchParams.has('pool_timeout')) parsed.searchParams.set('pool_timeout', '20')
  const override = Number(process.env[OVERRIDE_ENV[role]])
  if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', String(Number.isInteger(override) && override > 0 ? override : POOL_SIZES[role]))
  return parsed.toString()
}

/** Options for an extra `new PrismaClient(...)` outside Keystone's own context. */
export function pooledPrismaOptions(role: PoolRole = 'worker'): { datasourceUrl?: string } {
  const datasourceUrl = pooledDatabaseUrl(process.env.DATABASE_URL, role)
  return datasourceUrl ? { datasourceUrl } : {}
}
