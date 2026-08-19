import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, text, timestamp } from "@keystone-6/core/fields";

export const AuthRateLimitBucket = list({
  access: { operation: { query: denyAll, create: denyAll, update: denyAll, delete: denyAll } },
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/(\skey\s+String)\s+@default\(""\)/, "$1")
        .replace(/(\scount\s+)Int\?(\s+@default\(0\))/, "$1Int$2")
        .replace(/\n}/, '\n  @@unique([key], map: "AuthRateLimitBucket_key")\n}');
    },
  },
  fields: {
    key: text({ validation: { isRequired: true }, access: { read: denyAll, create: denyAll, update: denyAll } }),
    count: integer({ defaultValue: 0, access: { read: denyAll, create: denyAll, update: denyAll } }),
    resetAt: timestamp({ access: { read: denyAll, create: denyAll, update: denyAll } }),
  },
});
