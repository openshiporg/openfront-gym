const STOREFRONT_RETURN_ROOTS = [
  "/account",
  "/join",
  "/schedule",
  "/classes",
  "/instructors",
  "/memberships",
] as const;

function isAllowedRoot(pathname: string) {
  return STOREFRONT_RETURN_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

export function safeStorefrontReturnPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback = "/account",
) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    /%(?:2f|5c)/i.test(value)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://gym.invalid");
    if (
      parsed.origin !== "https://gym.invalid" ||
      !isAllowedRoot(parsed.pathname)
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function bookingReturnPath(classInstanceId: string) {
  const id = classInstanceId.trim();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return "/schedule";
  return `/schedule?book=${encodeURIComponent(id)}`;
}

export function accountSignInPath(returnTo: string) {
  const safeReturnTo = safeStorefrontReturnPath(returnTo);
  return `/account?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export function joinPath(tierId?: string | null, returnTo?: string | null) {
  const params = new URLSearchParams();
  if (tierId && /^[A-Za-z0-9_-]{1,200}$/.test(tierId)) {
    params.set("tier", tierId);
  }
  if (returnTo) {
    params.set("returnTo", safeStorefrontReturnPath(returnTo));
  }
  const query = params.toString();
  return query ? `/join?${query}` : "/join";
}
