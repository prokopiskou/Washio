// Κεντρική λίστα admin emails — single source of truth.
// Χρησιμοποιείται και από το UI (app/admin) και από τα API routes για authorization.
export const ADMIN_EMAILS = ['withinsuccess@gmail.com', 'giwrgos2070@gmail.com']

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase())
}
