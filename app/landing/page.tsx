'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [sent, setSent] = useState(false)

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.message) return
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'contact',
        to: 'withinsuccess@gmail.com',
        ...formData,
      }),
    })
    setSent(true)
  }

  return (
    <main className="min-h-screen bg-white text-gray-900 font-sans">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src="/washio_logo.png" alt="Washio" className="h-8 w-auto" />
          <div className="hidden md:flex items-center gap-8">
            <a href="#about" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Για εμάς</a>
            <a href="#how" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Πώς λειτουργεί</a>
            <a href="#partners" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Πρατήρια</a>
            <a href="#contact" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Επικοινωνία</a>
            <Link href="/map" className="bg-gray-900 text-white text-sm px-4 py-2 rounded-xl">
              Κάνε κράτηση
            </Link>
          </div>
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-gray-500">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></> : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
            </svg>
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden px-6 pb-4 flex flex-col gap-4 border-t border-gray-100 pt-4">
            <a href="#about" onClick={() => setMenuOpen(false)} className="text-sm text-gray-600">Για εμάς</a>
            <a href="#how" onClick={() => setMenuOpen(false)} className="text-sm text-gray-600">Πώς λειτουργεί</a>
            <a href="#partners" onClick={() => setMenuOpen(false)} className="text-sm text-gray-600">Πρατήρια</a>
            <a href="#contact" onClick={() => setMenuOpen(false)} className="text-sm text-gray-600">Επικοινωνία</a>
            <Link href="/map" className="bg-gray-900 text-white text-sm px-4 py-2 rounded-xl text-center">
              Κάνε κράτηση
            </Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-12 md:pt-32 md:pb-24 px-6 text-center bg-white">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-4">Το πλύσιμο αυτοκινήτου αλλάζει</p>
          <h1 className="text-3xl md:text-6xl font-semibold tracking-tight text-gray-900 leading-tight mb-6">
            Γρήγορο πλύσιμο.<br />
            <span className="text-gray-400">Έξυπνη εμπειρία.</span>
          </h1>
          <p className="text-base text-gray-500 mb-10 leading-relaxed">
            Βρες κοντινό πλυντήριο, κλείσε θέση, πλύνε.<br />
            Χωρίς αναμονή. Χωρίς ουρές.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/map" className="bg-gray-900 text-white text-sm font-medium px-8 py-4 rounded-2xl">
              Κάνε κράτηση τώρα →
            </Link>
            <a href="#how" className="border border-gray-200 text-gray-600 text-sm font-medium px-8 py-4 rounded-2xl">
              Πώς λειτουργεί
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { value: '60″', label: 'για κράτηση' },
            { value: '0€', label: 'χρέωση εγγραφής' },
            { value: '24/7', label: 'διαθέσιμο' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-3xl md:text-4xl font-semibold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-14 md:py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-4">Για εμάς</p>
              <h2 className="text-3xl font-semibold tracking-tight text-gray-900 mb-6 leading-tight">
                Φτιάξαμε το Washio γιατί μισούσαμε τις ουρές.
              </h2>
              <p className="text-gray-500 leading-relaxed mb-4">
                Κάθε φορά που πήγαινες να πλύνεις το αυτοκίνητό σου, έχανες χρόνο περιμένοντας. Δεν ήξερες αν θα βρεις θέση. Δεν ήξερες πόσο θα κοστίσει. Δεν ήξερες πότε θα τελειώσεις.
              </p>
              <p className="text-gray-500 leading-relaxed">
                Το Washio λύνει αυτό το πρόβλημα. Ανοίγεις την εφαρμογή, βλέπεις διαθέσιμα σημεία κοντά σου, κλείνεις θέση, πηγαίνεις. Τέλος.
              </p>
            </div>
            <div className="bg-gray-50 rounded-3xl p-8 text-center">
              <div className="text-6xl mb-4">⛽</div>
              <p className="text-sm text-gray-500 leading-relaxed">
                Συνεργαζόμαστε με επιλεγμένα πρατήρια και πλυντήρια σε όλη την Αθήνα για να σου προσφέρουμε την καλύτερη εμπειρία.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-14 md:py-24 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-4">Πώς λειτουργεί</p>
            <h2 className="text-3xl font-semibold tracking-tight text-gray-900">Τρία βήματα. Τίποτα άλλο.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Βρες σημείο', desc: 'Δες τα κοντινά πλυντήρια με διαθέσιμες θέσεις σε πραγματικό χρόνο.' },
              { step: '02', title: 'Κλείσε θέση', desc: 'Επίλεξε υπηρεσία, ώρα και πλήρωσε με ασφάλεια μέσα από την εφαρμογή.' },
              { step: '03', title: 'Πλύνε', desc: 'Γρήγορα και έξυπναΧωρίς αναμονή, χωρίς ουρές.' },
            ].map(item => (
              <div key={item.step} className="bg-white rounded-2xl p-6">
                <p className="text-xs font-mono text-gray-300 mb-3">{item.step}</p>
                <p className="text-base font-semibold text-gray-900 mb-2">{item.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* App download */}
      <section id="app" className="py-14 md:py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-4">Η εφαρμογή</p>
              <h2 className="text-3xl font-semibold tracking-tight text-gray-900 mb-6 leading-tight">
                Το Washio στην τσέπη σου.
              </h2>
              <p className="text-gray-500 leading-relaxed mb-8">
                Κλείσε ραντεβού, δες τις κρατήσεις σου και λάβε υπενθυμίσεις — όλα από μία εφαρμογή. Σύντομα διαθέσιμη για iPhone και Android.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {/* App Store — Σύντομα (μη-clickable μέχρι το launch) */}
                <div className="flex items-center gap-3 border border-gray-200 rounded-2xl px-5 py-3 opacity-60 cursor-default select-none">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#0A0A0A"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.1-2.02-3.77-2.04-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.41-.89-1.75.03-3.37 1.02-4.27 2.59-1.82 3.16-.47 7.84 1.31 10.41.87 1.26 1.9 2.67 3.25 2.62 1.3-.05 1.8-.84 3.37-.84 1.57 0 2.02.84 3.4.81 1.4-.02 2.29-1.28 3.15-2.55 1-1.46 1.41-2.88 1.43-2.95-.03-.01-2.74-1.05-2.77-4.17zM14.6 4.42c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-1.08 3.18 1.15.09 2.32-.58 3.03-1.45z"/></svg>
                  <div className="text-left leading-tight">
                    <p className="text-[10px] text-gray-400">Σύντομα στο</p>
                    <p className="text-sm font-semibold text-gray-900">App Store</p>
                  </div>
                </div>
                {/* Google Play — Σύντομα */}
                <div className="flex items-center gap-3 border border-gray-200 rounded-2xl px-5 py-3 opacity-60 cursor-default select-none">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#0A0A0A"><path d="M3 2.5l11 9.5-11 9.5z"/></svg>
                  <div className="text-left leading-tight">
                    <p className="text-[10px] text-gray-400">Σύντομα στο</p>
                    <p className="text-sm font-semibold text-gray-900">Google Play</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-6">
                Μέχρι τότε, κλείσε κράτηση κατευθείαν από τον <Link href="/map" className="text-gray-900 underline">browser</Link>.
              </p>
            </div>

            {/* Phone mockup (CSS, χωρίς εξωτερική εικόνα) */}
            <div className="flex justify-center">
              <div className="relative w-[230px] h-[470px] rounded-[42px] bg-gray-900 p-2.5 shadow-2xl">
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-1.5 bg-gray-700 rounded-full z-10" />
                <div className="w-full h-full rounded-[34px] bg-white overflow-hidden flex flex-col items-center pt-12 px-5">
                  <p className="text-lg font-semibold tracking-tight text-gray-900">washio</p>
                  <p className="text-[11px] text-gray-400 mt-1 mb-8">Πλύσιμο με ένα tap</p>
                  <div className="w-full bg-gray-50 rounded-2xl p-4 mb-3 border border-gray-100">
                    <p className="text-[11px] text-gray-400">Κοντινό σημείο</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">Πρατήριο Γλυφάδας</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">11:30 · €12</p>
                  </div>
                  <div className="w-full h-11 bg-gray-900 rounded-xl flex items-center justify-center">
                    <span className="text-white text-sm font-medium">Βρες πλυντήριο</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Partners CTA */}
      <section id="partners" className="py-14 md:py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-900 rounded-3xl p-10 md:p-16 text-center">
            <p className="text-xs font-medium tracking-widest text-gray-500 uppercase mb-4">Για πρατήρια</p>
            <h2 className="text-3xl font-semibold text-white mb-4 leading-tight">
              Αύξησε τις κρατήσεις σου<br />χωρίς κόστος εγκατάστασης.
            </h2>
            <p className="text-gray-400 mb-8 leading-relaxed max-w-lg mx-auto">
              Μηδέν κόστος εγκατάστασης. Μηδέν μηνιαία συνδρομή. Πληρώνεις μόνο όταν έρχεται πελάτης — 10% προμήθεια ανά κράτηση.
            </p>
            <Link href="/apply" className="inline-block bg-white text-gray-900 text-sm font-medium px-8 py-4 rounded-2xl">
              Γίνε συνεργάτης →
            </Link>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-14 md:py-24 px-6 bg-gray-50">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-4">Επικοινωνία</p>
            <h2 className="text-3xl font-semibold tracking-tight text-gray-900">Στείλε μας μήνυμα.</h2>
          </div>
          {sent ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">✓</div>
              <p className="text-gray-900 font-medium">Το μήνυμά σου εστάλη!</p>
              <p className="text-gray-400 text-sm mt-2">Θα επικοινωνήσουμε σύντομα.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Όνομα"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-gray-400"
              />
              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                className="w-full border border-gray-200 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-gray-400"
              />
              <textarea
                placeholder="Μήνυμα"
                rows={4}
                value={formData.message}
                onChange={e => setFormData(p => ({ ...p, message: e.target.value }))}
                className="w-full border border-gray-200 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-gray-400 resize-none"
              />
              <button
                onClick={handleSubmit}
                disabled={!formData.name || !formData.email || !formData.message}
                className="w-full bg-gray-900 text-white text-sm font-medium py-4 rounded-2xl disabled:opacity-40"
              >
                Αποστολή
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-gray-100">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <img src="/washio_logo.png" alt="Washio" className="h-7 w-auto" />
          <div className="flex gap-6">
            <a href="#about" className="text-xs text-gray-400 hover:text-gray-600">Για εμάς</a>
            <a href="#how" className="text-xs text-gray-400 hover:text-gray-600">Πώς λειτουργεί</a>
            <Link href="/apply" className="text-xs text-gray-400 hover:text-gray-600">Συνεργάτες</Link>
            <a href="#contact" className="text-xs text-gray-400 hover:text-gray-600">Επικοινωνία</a>
          </div>
          <p className="text-xs text-gray-300">© 2026 Washio. All rights reserved.</p>
        </div>
      </footer>

    </main>
  )
}