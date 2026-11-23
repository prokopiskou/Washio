'use client'

// Admin → Μετρήσεις: ξανακλείνουν μέσα από το Washio; (εβδομάδα 1ης κράτησης)
export type Cohort = { week: string; users: number; r30: number; n30: number; r60: number; n60: number; same: number; any: number }

const pc = (n: number, d: number) => d ? Math.round(100 * n / d) : null
const wk = (ymd: string) => new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(new Date(ymd + 'T12:00:00Z'))
const tone = (v: number | null) => v == null ? 'text-gray-300' : v >= 30 ? 'text-green-700 font-bold' : v >= 20 ? 'text-amber-700 font-semibold' : 'text-red-600 font-semibold'

export type AppFunnel = { opened: number; ios: number; android: number; withUser: number; booked: number } | null

export function RetentionCard({ rows, app }: { rows: Cohort[]; app?: AppFunnel }) {
  if (!rows.length) return null
  const sum = (f: (c: Cohort) => number) => rows.reduce((s, c) => s + f(c), 0)
  const t30 = pc(sum(c => c.r30), sum(c => c.n30)), t60 = pc(sum(c => c.r60), sum(c => c.n60))
  const same = pc(sum(c => c.same), sum(c => c.any))
  const th = 'text-right font-medium px-1.5 py-1 whitespace-nowrap'
  const td = 'text-right px-1.5 py-1.5 whitespace-nowrap'
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-[15px] font-bold text-gray-900">Ξανακλείνουν μέσα από το Washio;</p>
      <p className="text-[12px] text-gray-500 mt-0.5">Μόνο ολοκληρωμένα πλυσίματα (χωρίς no-show / ακυρωμένα / ομάδα). Εβδομάδα 1ου πλυσίματος → % με 2ο ολοκληρωμένο μέσα από την εφαρμογή. Στόχος ≥ 30% στις 60 μέρες · κάτω από 20% = χρέωση μόνο στην 1η κράτηση.</p>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[['30 μέρες', t30], ['60 μέρες', t60], ['Στο ίδιο πλυντήριο', same]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="text-[11px] text-gray-500">{l}</p>
            <p className={`text-[20px] ${l === 'Στο ίδιο πλυντήριο' ? 'text-gray-900 font-bold' : tone(v as number | null)}`}>{v == null ? '—' : `${v}%`}</p>
          </div>
        ))}
      </div>
      {app && (
        <div className="mt-3 rounded-xl border border-gray-100 px-3 py-2.5">
          <p className="text-[12px] font-semibold text-gray-700">Εφαρμογή · 30 μέρες (από 23/11 και μετά)</p>
          <p className="text-[13px] text-gray-900 mt-1">Άνοιξαν <b>{app.opened}</b> <span className="text-gray-400">(iOS {app.ios} · Android {app.android})</span> → με λογαριασμό <b>{app.withUser}</b> ({pc(app.withUser, app.opened) ?? 0}%) → με κράτηση <b>{app.booked}</b> ({pc(app.booked, app.opened) ?? 0}%)</p>
        </div>
      )}
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-[12px]">
          <thead className="text-gray-500"><tr>
            <th className="text-left font-medium px-1.5 py-1">Εβδομάδα</th><th className={th}>Νέοι</th><th className={th}>30 μέρες</th><th className={th}>60 μέρες</th><th className={th}>Ίδιο πλυντ.</th>
          </tr></thead>
          <tbody>
            {rows.map(c => {
              const a = pc(c.r30, c.n30), b = pc(c.r60, c.n60)
              return (
                <tr key={c.week} className="border-t border-gray-100">
                  <td className="px-1.5 py-1.5 whitespace-nowrap">{wk(c.week)}</td>
                  <td className={td}>{c.users}</td>
                  <td className={`${td} ${tone(a)}`}>{a == null ? 'σε εξέλιξη' : `${a}% (${c.r30}/${c.n30})`}</td>
                  <td className={`${td} ${tone(b)}`}>{b == null ? 'σε εξέλιξη' : `${b}% (${c.r60}/${c.n60})`}</td>
                  <td className={td}>{c.any ? `${c.same}/${c.any}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
