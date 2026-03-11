import QRCode from 'qrcode'
import crypto from 'crypto'

const QR_SECRET = process.env.QR_CODE_SECRET || 'default-qr-secret-change-in-production'
const QR_EXPIRY_SECONDS = 30

export interface QRCodeData {
  memberId: string
  timestamp: number
  signature: string
}

export function generateQRSignature(memberId: string, timestamp: number): string {
  const data = `${memberId}:${timestamp}`
  return crypto
    .createHmac('sha256', QR_SECRET)
    .update(data)
    .digest('hex')
    .substring(0, 16)
}

export function createQRCodeData(memberId: string): QRCodeData {
  const timestamp = Date.now()
  const signature = generateQRSignature(memberId, timestamp)
  return { memberId, timestamp, signature }
}

export function encodeQRData(data: QRCodeData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64')
}

export function decodeQRData(encoded: string): QRCodeData | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    return JSON.parse(decoded) as QRCodeData
  } catch {
    return null
  }
}

export function validateQRCode(encoded: string): { valid: boolean; memberId?: string; error?: string } {
  const data = decodeQRData(encoded)
  
  if (!data) {
    return { valid: false, error: 'Invalid QR code format' }
  }

  const now = Date.now()
  const ageSeconds = (now - data.timestamp) / 1000

  if (ageSeconds > QR_EXPIRY_SECONDS) {
    return { valid: false, error: 'QR code expired' }
  }

  const expectedSignature = generateQRSignature(data.memberId, data.timestamp)
  if (data.signature !== expectedSignature) {
    return { valid: false, error: 'Invalid QR code signature' }
  }

  return { valid: true, memberId: data.memberId }
}

export async function generateQRCodeDataURL(memberId: string): Promise<string> {
  const data = createQRCodeData(memberId)
  const encoded = encodeQRData(data)
  
  return QRCode.toDataURL(encoded, {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  })
}

export async function generateQRCodeSVG(memberId: string): Promise<string> {
  const data = createQRCodeData(memberId)
  const encoded = encodeQRData(data)
  
  return QRCode.toString(encoded, {
    type: 'svg',
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
}
