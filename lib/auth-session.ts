'use client'

import type { Session, SupabaseClient } from '@supabase/supabase-js'

// «Ανθεκτικό» getSession για σελίδες που απαιτούν σύνδεση (admin, dashboard).
// Στο κινητό, όταν η καρτέλα ξυπνάει από το παρασκήνιο, το access token έχει λήξει και
// γίνεται ανανέωση. Αν το δίκτυο/η βάση αργεί, το getSession επιστρέφει προσωρινά null
// ΜΕ error — πριν, αυτό το διαβάζαμε ως «αποσυνδέθηκε» και πετούσαμε τον χρήστη έξω.
// Τώρα: σε σφάλμα ξαναδοκιμάζουμε (έως ~6″). Μόνο «null χωρίς σφάλμα» = πραγματικά εκτός.
export async function getSessionResilient(supabase: SupabaseClient): Promise<Session | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase.auth.getSession()
    if (data.session) return data.session
    if (!error) return null
    await new Promise(r => setTimeout(r, 600 * (attempt + 1)))
  }
  return null
}
