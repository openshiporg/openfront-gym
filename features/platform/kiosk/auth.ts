import { type NextRequest } from "next/server";
import {
  isKioskConfigured,
  isKioskSessionValueValid,
  isKioskTokenValid,
  KIOSK_SESSION_COOKIE,
} from "../../kiosk/auth";

export {
  createKioskSessionValue,
  getKioskOrganizationId,
  isKioskConfigured,
  isKioskSessionValueValid,
  isKioskTokenValid,
  kioskSessionCookieOptions,
  KIOSK_SESSION_COOKIE,
  KIOSK_SESSION_MAX_AGE_SECONDS,
} from "../../kiosk/auth";

const KIOSK_TOKEN_HEADER = "x-kiosk-token";

export function isKioskRequestAuthorized(request: NextRequest) {
  if (!isKioskConfigured()) return false;
  const suppliedToken = request.headers.get(KIOSK_TOKEN_HEADER);
  if (isKioskTokenValid(suppliedToken)) return true;
  return isKioskSessionValueValid(request.cookies.get(KIOSK_SESSION_COOKIE)?.value);
}
