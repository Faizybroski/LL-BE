import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'

const ISSUER = 'Logical Links'

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32
}

function buildTotp(email: string, base32Secret: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  })
}

export async function buildProvisioningQrCode(email: string, base32Secret: string): Promise<{
  otpauthUrl: string
  qrCodeDataUrl: string
}> {
  const otpauthUrl = buildTotp(email, base32Secret).toString()
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)
  return { otpauthUrl, qrCodeDataUrl }
}

// Allows a ±1 step (30s) window to tolerate clock drift between server and authenticator app.
export function verifyTotpCode(email: string, base32Secret: string, code: string): boolean {
  const delta = buildTotp(email, base32Secret).validate({ token: code, window: 1 })
  return delta !== null
}
