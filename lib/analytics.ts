// Ενοποιημένο tracking → Meta Pixel + GA4 με μία κλήση.
// Τα IDs έρχονται από env (public). Αν λείπουν, οι κλήσεις είναι no-op — τίποτα δεν σπάει.

type Params = Record<string, unknown>

// Meta standard event → GA4 recommended event
const GA_MAP: Record<string, string> = {
  ViewContent: 'view_item',
  Search: 'search',
  AddToCart: 'add_to_cart',
  CompleteRegistration: 'sign_up',
  InitiateCheckout: 'begin_checkout',
  AddPaymentInfo: 'add_payment_info',
  Purchase: 'purchase',
}

/**
 * Πυροδοτεί ένα event και στα δύο (Meta Pixel + GA4).
 * @param event Meta standard event name (π.χ. 'ViewContent', 'Purchase')
 * @param params custom_data (value, currency, content_ids, content_name, ...)
 * @param opts.eventId για de-duplication με το CAPI (server-side) — π.χ. booking_ref
 */
export function track(event: string, params: Params = {}, opts: { eventId?: string } = {}): void {
  if (typeof window === 'undefined') return
  try {
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq
    if (fbq) fbq('track', event, params, opts.eventId ? { eventID: opts.eventId } : undefined)
  } catch { /* ignore */ }
  try {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
    if (gtag) gtag('event', GA_MAP[event] || event, params)
  } catch { /* ignore */ }
}
