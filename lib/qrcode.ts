import QRCode from "qrcode"
import crypto from "crypto"

const QR_EXPIRY_SECONDS = 30
const QR_CLOCK_SKEW_SECONDS = 5

function qrSecret() {
  const secret = process.env.QR_CODE_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error("QR_CODE_SECRET must be configured with at least 32 characters.")
  }
  return secret
}

export interface QRCodeData {
  memberId: string
  organizationId: string
  timestamp: number
  signature: string
}

export function generateQRSignature(memberId: string, organizationId: string, timestamp: number): string {
  const data = `${organizationId}:${memberId}:${timestamp}`
  return crypto
    .createHmac("sha256", qrSecret())
    .update(data)
    .digest("hex")
}

export function createQRCodeData(memberId: string, organizationId: string): QRCodeData {
  const timestamp = Date.now()
  const signature = generateQRSignature(memberId, organizationId, timestamp)
  return { memberId, organizationId, timestamp, signature }
}

export function encodeQRData(data: QRCodeData): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url")
}

export function decodeQRData(encoded: string): QRCodeData | null {
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf-8")
    const data = JSON.parse(decoded) as QRCodeData
    if (
      typeof data.memberId !== "string" ||
      !data.memberId ||
      typeof data.organizationId !== "string" ||
      !data.organizationId ||
      !Number.isSafeInteger(data.timestamp) ||
      typeof data.signature !== "string"
    ) return null
    return data
  } catch {
    return null
  }
}

export function validateQRCode(encoded: string): {
  valid: boolean
  memberId?: string
  organizationId?: string
  error?: string
} {
  const data = decodeQRData(encoded)
  if (!data) return { valid: false, error: "Invalid QR code format" }

  const now = Date.now()
  const ageSeconds = (now - data.timestamp) / 1000
  if (ageSeconds > QR_EXPIRY_SECONDS) return { valid: false, error: "QR code expired" }
  if (ageSeconds < -QR_CLOCK_SKEW_SECONDS) return { valid: false, error: "QR code timestamp is invalid" }

  const expectedSignature = generateQRSignature(data.memberId, data.organizationId, data.timestamp)
  const actual = Buffer.from(data.signature, "utf8")
  const expected = Buffer.from(expectedSignature, "utf8")
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return { valid: false, error: "Invalid QR code signature" }
  }

  return { valid: true, memberId: data.memberId, organizationId: data.organizationId }
}

export async function generateQRCodeDataURL(memberId: string, organizationId: string): Promise<string> {
  const data = createQRCodeData(memberId, organizationId)
  return QRCode.toDataURL(encodeQRData(data), {
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "M",
  })
}

export async function generateQRCodeSVG(memberId: string, organizationId: string): Promise<string> {
  const data = createQRCodeData(memberId, organizationId)
  return QRCode.toString(encodeQRData(data), {
    type: "svg",
    width: 300,
    margin: 2,
    errorCorrectionLevel: "M",
  })
}
