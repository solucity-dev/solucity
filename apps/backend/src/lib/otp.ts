export function generateOtp(length = 6): string {
  const digits = '0123456789'
  let out = ''
  for (let i = 0; i < length; i++) out += digits[Math.floor(Math.random() * 10)]
  return out
}
