type PrismaOperation = (...args: any[]) => unknown;
const guardedClientCache = new WeakMap<object, object>();

/** Keystone 6.5.1 may resolve Prisma failures as GraphQLError values. */
export function throwOnKeystonePrismaError<T>(result: T, operation = "Prisma operation"): T {
  if (result instanceof Error) throw result;
  if (result === null || typeof result !== "object") return result;
  if ("errors" in result && Array.isArray((result as { errors?: unknown }).errors)) {
    throw new Error(`${operation} returned a GraphQL error result`);
  }
  return result;
}

function validatePrismaResult(path: string, result: unknown): unknown {
  throwOnKeystonePrismaError(result, path);
  const operation = path.slice(path.lastIndexOf(".") + 1);

  if (operation === "count") {
    if (!Number.isSafeInteger(result) || (result as number) < 0) throw new Error(`${path} returned a malformed count`);
  } else if (["createMany", "updateMany", "deleteMany"].includes(operation)) {
    const count = (result as { count?: unknown } | null)?.count;
    if (!Number.isSafeInteger(count) || (count as number) < 0) throw new Error(`${path} returned a malformed affected-row count`);
  }

  return result;
}

/**
 * Wrap a transaction client so every awaited Prisma operation rejects on
 * Keystone's returned Error values before the surrounding transaction commits.
 */
export function guardKeystonePrismaResults<T extends object>(client: T): T {
  const wrap = <Value extends object>(value: Value, path: string): Value => {
    const cached = guardedClientCache.get(value);
    if (cached) return cached as Value;

    const proxy = new Proxy(value, {
      get(target, property, receiver) {
        const member = Reflect.get(target, property, receiver) as unknown;
        const name = typeof property === "string" ? property : String(property);
        const memberPath = path ? `${path}.${name}` : name;

        if (typeof member === "function") {
          const operation = member as PrismaOperation;
          return (...args: unknown[]) => {
            let guardedArgs = args;
            if (memberPath === "$transaction" && typeof args[0] === "function") {
              const callback = args[0] as (transaction: any) => unknown;
              guardedArgs = [(transaction: any) => callback(guardKeystonePrismaResults(transaction)), ...args.slice(1)];
            }
            return Promise.resolve(Reflect.apply(operation, target, guardedArgs))
              .then(result => validatePrismaResult(memberPath, result));
          };
        }
        if (member && typeof member === "object" && !(member instanceof Date) && !Array.isArray(member)) {
          return wrap(member as object, memberPath);
        }
        return member;
      },
    });
    guardedClientCache.set(value, proxy);
    return proxy;
  };

  return wrap(client, "") as T;
}

export function withKeystonePrismaTransaction<T>(
  prisma: any,
  callback: (transaction: any) => Promise<T>,
  options?: Record<string, unknown>,
): Promise<T> {
  const guardedPrisma = guardKeystonePrismaResults(prisma);
  return guardedPrisma.$transaction(callback, options);
}

export function requirePrismaAffectedCount(result: unknown, expected: number, operation: string): number {
  throwOnKeystonePrismaError(result, operation);
  const count = (result as { count?: unknown } | null)?.count;
  if (!Number.isSafeInteger(count) || count !== expected) {
    throw new Error(`${operation} affected ${String(count)} rows; expected ${expected}`);
  }
  return count as number;
}
