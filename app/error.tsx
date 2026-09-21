'use client'

// Route-level error boundary: αντί για λευκή οθόνη (χωρίς έξοδο μέσα στο
// WebView), ο χρήστης βλέπει μήνυμα και μπορεί να ξαναπροσπαθήσει ή να πάει αρχική.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <p className="text-[34px] mb-2">😕</p>
      <h1 className="text-[18px] font-semibold text-gray-900">Κάτι πήγε στραβά</h1>
      <p className="text-[13px] text-gray-500 mt-2 leading-relaxed">
        Δεν φταις εσύ. Δοκίμασε ξανά — αν συνεχίζει, επικοινώνησε μαζί μας.
      </p>
      {error?.digest && <p className="text-[10px] text-gray-300 mt-2">#{error.digest}</p>}
      <div className="flex gap-2 mt-6 w-full max-w-xs">
        <button onClick={() => reset()} className="flex-1 h-11 rounded-xl bg-gray-900 text-white text-[13px] font-semibold">
          Δοκίμασε ξανά
        </button>
        <a href="/" className="flex-1 h-11 leading-[44px] rounded-xl border border-gray-200 text-gray-700 text-[13px] font-semibold">
          Αρχική
        </a>
      </div>
    </main>
  )
}
