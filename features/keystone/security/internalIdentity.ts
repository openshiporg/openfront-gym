import { createHash, createHmac } from 'node:crypto'

/**
 * Dependency-free signer for the loopback-only forwarded client identity.
 * graphqlSecurity re-exports it and verifies it (loopback socket + fresh HMAC).
 */
export function signInternalClientIdentity(source: string, secret: string, now = Date.now()) {
  if (!source || secret.length < 32) return null
  const identity = createHash('sha256').update(source).digest('hex')
  const timestamp = String(Math.floor(now / 1_000))
  const signature = createHmac('sha256', secret).update(`${timestamp}:${identity}`).digest('hex')
  return { identity, timestamp, signature }
}
