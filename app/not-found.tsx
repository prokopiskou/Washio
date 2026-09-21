export default function NotFound() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[18px] font-semibold text-gray-900">Η σελίδα δεν βρέθηκε</h1>
      <p className="text-[13px] text-gray-500 mt-2">Ο σύνδεσμος μπορεί να είναι παλιός ή λάθος.</p>
      <a href="/" className="mt-6 h-11 px-6 leading-[44px] rounded-xl bg-gray-900 text-white text-[13px] font-semibold">
        Πίσω στην αρχική
      </a>
    </main>
  )
}
