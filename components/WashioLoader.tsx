// Επαναχρησιμοποιήσιμο loading indicator της εφαρμογής — τρεις κουκκίδες
// στο branding του Washio. Εμφανίζεται ΜΟΝΟ όσο φορτώνει μια οθόνη· μόλις
// έρθουν τα δεδομένα, αντικαθίσταται από το περιεχόμενο.
//
//   <WashioLoader />                    → μόνο οι κουκκίδες (κεντραρισμένες)
//   <WashioLoader label="Φόρτωση χάρτη..." />  → κουκκίδες + κείμενο από κάτω
//   <WashioLoader fullScreen />         → κεντραρισμένο σε όλη την οθόνη

type Props = {
  label?: string
  fullScreen?: boolean
  className?: string
}

export function WashioLoader({ label, fullScreen, className = '' }: Props) {
  const inner = (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="flex items-center gap-2" role="status" aria-label={label || 'Φόρτωση'}>
        <span className="washio-dot" />
        <span className="washio-dot" />
        <span className="washio-dot" />
      </div>
      {label && <p className="text-xs text-gray-400">{label}</p>}
    </div>
  )

  if (fullScreen) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        {inner}
      </main>
    )
  }
  return inner
}

export default WashioLoader
