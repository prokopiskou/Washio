export function isCashBooking(b: { stripe_payment_status?: string | null }): boolean {
  return b.stripe_payment_status === 'pay_at_venue'
}
