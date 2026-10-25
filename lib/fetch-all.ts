// Το Supabase (PostgREST) επιστρέφει ΤΟ ΠΟΛΥ 1000 γραμμές ανά αίτημα — ένα .limit(10000)
// ΔΕΝ το ξεπερνά. Εδώ: σελίδες των 1000 μέχρι να τελειώσουν (ή μέχρι max).
// Το query πρέπει να έχει σταθερή σειρά (π.χ. .order('id')) για να μη χαθούν/διπλασιαστούν γραμμές.
/* eslint-disable @typescript-eslint/no-explicit-any -- γενικός builder του supabase */
export async function fetchAll<T = any>(make: () => any, opts: { page?: number; max?: number } = {}): Promise<{ data: T[]; error: any }> {
  const page = opts.page ?? 1000
  const max = opts.max ?? 100000
  const out: T[] = []
  for (let from = 0; from < max; from += page) {
    const { data, error } = await make().range(from, from + page - 1)
    if (error) return { data: out, error }
    out.push(...((data || []) as T[]))
    if (!data || data.length < page) break
  }
  return { data: out, error: null }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
