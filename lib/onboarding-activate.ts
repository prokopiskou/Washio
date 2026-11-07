// Onboarding → πλυντήριο. Δημιουργεί το πρατήριο (ΑΝΕΝΕΡΓΟ, «περιμένει ενεργοποίηση» από admin)
// από τα στοιχεία της αίτησης onboarding και τη μαρκάρει ως ενεργοποιημένη.
// Χρήση: /api/onboarding (αυτόματα με την υποβολή), /api/admin/applications (Onboarding κομπλέ),
// /api/admin/activate-onboarding (χειροκίνητα για παλιές).
import type { SupabaseClient } from '@supabase/supabase-js'

export function slugify(input: string): string {
  const map: Record<string, string> = {
    α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i',
    κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's',
    ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
    ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'y', ώ: 'o', ϊ: 'i', ϋ: 'y', ΐ: 'i', ΰ: 'y',
  }
  const base = input.toLowerCase().split('').map(ch => map[ch] ?? ch).join('')
  const slug = base.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return (slug || 'partner') + '-' + Date.now()
}

type Ob = { id: string; business_name?: string | null; address?: string | null; iban?: string | null; afm?: string | null; doy?: string | null; status?: string | null; notes?: string | null }

/** Δημιουργεί ανενεργό πρατήριο για την αίτηση onboarding (αν δεν έχει ήδη). Επιστρέφει το location id. */
export async function activateOnboarding(admin: SupabaseClient, ob: Ob): Promise<{ ok: true; locationId: string; existed?: boolean } | { ok: false; error: string }> {
  if (ob.status === 'active' && ob.notes && /^[0-9a-f-]{36}$/i.test(ob.notes)) return { ok: true, locationId: ob.notes, existed: true }
  const base = {
    name: String(ob.business_name || 'Νέο πλυντήριο').trim(),
    address: ob.address || '',
    city: '',
    slug: slugify(ob.business_name || 'partner'),
    iban: ob.iban || null,
    is_active: false,          // εμφανίζεται στα «Πλυντήρια», περιμένει το τελικό ⏻ από admin
    commission_rate: 10,
    capacity: 1,
    owner_id: null,
    lat: null,
    lng: null,
  }
  // afm/doy υπάρχουν στο locations (supabase/commission_invoices.sql) — αν λείπουν, χωρίς αυτά.
  let res = await admin.from('locations').insert({ ...base, afm: ob.afm || null, doy: ob.doy || null }).select('id').single()
  if (res.error && /afm|doy/.test(res.error.message)) res = await admin.from('locations').insert(base).select('id').single()
  if (res.error || !res.data) return { ok: false, error: res.error?.message || 'Αποτυχία δημιουργίας πρατηρίου' }
  await admin.from('partner_onboarding').update({ status: 'active', notes: res.data.id }).eq('id', ob.id)
  return { ok: true, locationId: res.data.id }
}
