import { getContext } from '@keystone-6/core/context'
import config from './index'
import { type Context } from '.keystone/types'
import * as PrismaModule from "@prisma/client";
import { pooledDatabaseUrl } from './database-url'

// One Keystone context (one Prisma pool) per process, across hot reloads and Next's server layers.
export const keystoneContext: Context =
  (globalThis as any).keystoneContext ?? getContext({
    ...config,
    // Apply runtime connection policy at the actual client boundary too.
    db: { ...config.db, url: pooledDatabaseUrl(process.env.DATABASE_URL ?? config.db.url) },
  }, PrismaModule)

// Next evaluates this module in several server layers (RSC, route handlers, instrumentation). Keep one context
// per Node process in every environment so each layer does not open its own Prisma pool.
;(globalThis as any).keystoneContext = keystoneContext