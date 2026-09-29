'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Car } from 'lucide-react'

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
    <main className="min-h-screen bg-washio-bg text-washio-navy font-sans">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-washio-border">
        <div className="relative max-w-5xl mx-auto px-6 py-3 md:py-4 min-h-[80px] md:min-h-0 flex items-center justify-between">
          <img src="/washio-logo-h.png" alt="Washio" className="h-12 md:h-12 w-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:static md:translate-x-0 md:translate-y-0" />
          <div className="hidden md:flex items-center gap-8 ml-auto">
            <a href="#about" className="text-sm text-gray-500 hover:text-washio-cyan-dark transition-colors">Για εμάς</a>
            <a href="#how" className="text-sm text-gray-500 hover:text-washio-cyan-dark transition-colors">Πώς λειτουργεί</a>
            <a href="#partners" className="text-sm text-gray-500 hover:text-washio-cyan-dark transition-colors">Πρατήρια</a>
            <a href="#contact" className="text-sm text-gray-500 hover:text-washio-cyan-dark transition-colors">Επικοινωνία</a>
            <Link href="/map" className="text-white text-sm font-semibold px-4 py-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #19A8C7 0%, #078EAD 100%)', boxShadow: '0 10px 24px rgba(25,168,199,0.35)' }}>
              Κάνε κράτηση
            </Link>
          </div>
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden ml-auto relative z-10 text-gray-900">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            <Link href="/map" className="text-white text-sm font-semibold px-4 py-2.5 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, #19A8C7 0%, #078EAD 100%)', boxShadow: '0 10px 24px rgba(25,168,199,0.35)' }}>
              Κάνε κράτηση
            </Link>
          </div>
        )}
      </nav>

      {/* Hero — navy + φωτογραφία αυτοκινήτου (ίδιο vibe με την εφαρμογή) */}
      <section className="relative overflow-hidden pt-28 pb-16 md:pt-40 md:pb-28 px-6" style={{ background: '#09162B' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero-car.webp" alt="" aria-hidden fetchPriority="high" decoding="async"
          className="absolute inset-y-0 right-0 h-full w-auto max-w-none object-cover opacity-90 pointer-events-none select-none" />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, #09162B 0%, rgba(9,22,43,0.94) 40%, rgba(9,22,43,0.45) 70%, rgba(9,22,43,0.15) 100%)' }} />
        <div className="absolute inset-0 md:hidden pointer-events-none" style={{ background: 'rgba(9,22,43,0.45)' }} />
        <div className="relative max-w-5xl mx-auto">
          <div className="max-w-xl text-center md:text-left mx-auto md:mx-0">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-washio-cyan/90 text-white text-[11px] font-bold tracking-[1.4px] uppercase mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-white" /> Το πλύσιμο αυτοκινήτου αλλάζει
            </span>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.08] mb-6">
              Γρήγορο πλύσιμο.<br />
              <span className="text-washio-cyan">Έξυπνη εμπειρία.</span>
            </h1>
            <p className="text-base md:text-lg text-white/70 mb-10 leading-relaxed">
              Βρες κοντινό πλυντήριο, κλείσε θέση, πλύνε.<br />
              Χωρίς αναμονή. Χωρίς ουρές.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <Link href="/map" className="text-white text-sm font-semibold px-8 py-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, #19A8C7 0%, #078EAD 100%)', boxShadow: '0 10px 24px rgba(25,168,199,0.35)' }}>
                Κάνε κράτηση τώρα →
              </Link>
              <a href="#how" className="border border-white/25 bg-white/5 backdrop-blur-sm text-white text-sm font-semibold px-8 py-4 rounded-2xl">
                Πώς λειτουργεί
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-10 md:py-16 px-6 bg-white border-b border-washio-border">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { value: '60″', label: 'για κράτηση' },
            { value: '0€', label: 'χρέωση εγγραφής' },
            { value: '24/7', label: 'διαθέσιμο' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-3xl md:text-4xl font-bold text-washio-cyan-dark">{s.value}</p>
              <p className="text-xs font-medium text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-14 md:py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-center">
            <div>
              <p className="text-xs font-bold tracking-widest text-washio-cyan-dark uppercase mb-4">Για εμάς</p>
              <h2 className="text-3xl font-bold tracking-tight text-washio-navy mb-6 leading-tight">
                Φτιάξαμε το Washio γιατί μισούσαμε τις ουρές.
              </h2>
              <p className="text-gray-500 leading-relaxed mb-4">
                Κάθε φορά που πήγαινες να πλύνεις το αυτοκίνητό σου, έχανες χρόνο περιμένοντας. Δεν ήξερες αν θα βρεις θέση. Δεν ήξερες πόσο θα κοστίσει. Δεν ήξερες πότε θα τελειώσεις.
              </p>
              <p className="text-gray-500 leading-relaxed">
                Το Washio λύνει αυτό το πρόβλημα. Ανοίγεις την εφαρμογή, βλέπεις διαθέσιμα σημεία κοντά σου, κλείνεις θέση, πηγαίνεις. Τέλος.
              </p>
            </div>
            <div className="rounded-3xl p-8 text-center border border-washio-border" style={{ background: 'linear-gradient(145deg, #FFFFFF 40%, #EAF8FB 100%)', boxShadow: '0 10px 30px rgba(16,24,42,0.06)' }}>
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #19A8C7 0%, #078EAD 100%)', boxShadow: '0 8px 20px rgba(25,168,199,0.35)' }}>
                <Car size={30} className="text-white" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                Συνεργαζόμαστε με επιλεγμένα πλυντήρια αυτοκινήτων σε όλη την Αθήνα για να σου προσφέρουμε την καλύτερη εμπειρία.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-14 md:py-24 px-6" style={{ background: 'linear-gradient(180deg, #EAF8FB 0%, #F7FAFC 100%)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <p className="text-xs font-bold tracking-widest text-washio-cyan-dark uppercase mb-4">Πώς λειτουργεί</p>
            <h2 className="text-3xl font-bold tracking-tight text-washio-navy">Τρία βήματα. Τίποτα άλλο.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Βρες σημείο', desc: 'Δες τα κοντινά πλυντήρια με διαθέσιμες θέσεις σε πραγματικό χρόνο.' },
              { step: '02', title: 'Κλείσε θέση', desc: 'Επίλεξε υπηρεσία, ώρα και πλήρωσε με ασφάλεια μέσα από την εφαρμογή.' },
              { step: '03', title: 'Πλύνε', desc: 'Γρήγορα και έξυπνα. Χωρίς αναμονή, χωρίς ουρές.' },
            ].map(item => (
              <div key={item.step} className="bg-white rounded-[22px] p-6 border border-washio-border" style={{ boxShadow: '0 8px 24px rgba(16,24,42,0.06)' }}>
                <span className="inline-flex w-10 h-10 rounded-full bg-washio-cyan-light text-washio-cyan-dark text-[13px] font-bold items-center justify-center mb-4">{item.step}</span>
                <p className="text-base font-bold text-washio-navy mb-2">{item.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* App download */}
      <section id="app" className="py-14 md:py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-center">
            <div>
              <p className="text-xs font-bold tracking-widest text-washio-cyan-dark uppercase mb-4">Η εφαρμογή</p>
              <h2 className="text-3xl font-bold tracking-tight text-washio-navy mb-6 leading-tight">
                Το Washio στην τσέπη σου.
              </h2>
              <p className="text-gray-500 leading-relaxed mb-8">
                Κλείσε ραντεβού, δες τις κρατήσεις σου και λάβε υπενθυμίσεις — όλα από μία εφαρμογή. Διαθέσιμη για iPhone και Android.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {/* App Store — live */}
                <a
                  href="https://apps.apple.com/app/id6785925766"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-white border border-washio-border rounded-2xl px-5 py-3 hover:border-washio-cyan transition-colors" style={{ boxShadow: '0 4px 14px rgba(16,24,42,0.05)' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#10182A"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.1-2.02-3.77-2.04-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.41-.89-1.75.03-3.37 1.02-4.27 2.59-1.82 3.16-.47 7.84 1.31 10.41.87 1.26 1.9 2.67 3.25 2.62 1.3-.05 1.8-.84 3.37-.84 1.57 0 2.02.84 3.4.81 1.4-.02 2.29-1.28 3.15-2.55 1-1.46 1.41-2.88 1.43-2.95-.03-.01-2.74-1.05-2.77-4.17zM14.6 4.42c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-1.08 3.18 1.15.09 2.32-.58 3.03-1.45z"/></svg>
                  <div className="text-left leading-tight">
                    <p className="text-[10px] text-gray-400">Κατέβασέ το στο</p>
                    <p className="text-sm font-semibold text-washio-navy">App Store</p>
                  </div>
                </a>
                {/* Google Play — live */}
                <a
                  href="https://play.google.com/store/apps/details?id=gr.washio.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-white border border-washio-border rounded-2xl px-5 py-3 hover:border-washio-cyan transition-colors" style={{ boxShadow: '0 4px 14px rgba(16,24,42,0.05)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#10182A"><path d="M3 2.5l11 9.5-11 9.5z"/></svg>
                  <div className="text-left leading-tight">
                    <p className="text-[10px] text-gray-400">Κατέβασέ το στο</p>
                    <p className="text-sm font-semibold text-washio-navy">Google Play</p>
                  </div>
                </a>
              </div>
              <p className="text-xs text-gray-400 mt-6">
                Μέχρι τότε, κλείσε κράτηση κατευθείαν από τον <Link href="/map" className="text-washio-cyan-dark font-semibold underline">browser</Link>.
              </p>
            </div>

            {/* Phone mockup με πραγματικό screenshot της εφαρμογής */}
            <div className="flex justify-center">
              <div className="relative w-[240px] rounded-[44px] bg-washio-navy p-2" style={{ boxShadow: '0 30px 60px rgba(16,24,42,0.25), 0 0 0 6px rgba(25,168,199,0.10)' }}>
                <div className="rounded-[36px] overflow-hidden bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mockup_home.webp" alt="Η εφαρμογή Washio" className="block w-full h-auto" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Partners CTA */}
      <section id="partners" className="py-14 md:py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl p-10 md:p-16 text-center" style={{ background: 'linear-gradient(135deg, #16233A 0%, #10182A 60%, #0E4A63 100%)', boxShadow: '0 20px 40px rgba(16,24,42,0.20)' }}>
            <p className="text-xs font-bold tracking-widest text-washio-cyan uppercase mb-4">Για πρατήρια</p>
            <h2 className="text-3xl font-semibold text-white mb-8 leading-tight">
              Αύξησε τις κρατήσεις σου<br />χωρίς κόστος εγκατάστασης.
            </h2>
            <Link href="/apply" className="inline-block text-white text-sm font-semibold px-8 py-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, #19A8C7 0%, #078EAD 100%)', boxShadow: '0 10px 24px rgba(25,168,199,0.35)' }}>
              Γίνε συνεργάτης →
            </Link>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-14 md:py-24 px-6" style={{ background: 'linear-gradient(180deg, #F7FAFC 0%, #EAF8FB 100%)' }}>
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <p className="text-xs font-bold tracking-widest text-washio-cyan-dark uppercase mb-4">Επικοινωνία</p>
            <h2 className="text-3xl font-bold tracking-tight text-washio-navy">Στείλε μας μήνυμα.</h2>
          </div>
          {sent ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-washio-cyan text-white text-2xl flex items-center justify-center">✓</div>
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
                className="w-full bg-white border border-washio-border rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-washio-cyan"
              />
              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                className="w-full bg-white border border-washio-border rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-washio-cyan"
              />
              <textarea
                placeholder="Μήνυμα"
                rows={4}
                value={formData.message}
                onChange={e => setFormData(p => ({ ...p, message: e.target.value }))}
                className="w-full bg-white border border-washio-border rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-washio-cyan resize-none"
              />
              <button
                onClick={handleSubmit}
                disabled={!formData.name || !formData.email || !formData.message}
                className="w-full text-white text-sm font-semibold py-4 rounded-2xl disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #19A8C7 0%, #078EAD 100%)', boxShadow: '0 10px 24px rgba(25,168,199,0.35)' }}
              >
                Αποστολή
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 bg-white border-t border-washio-border">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <img src="/washio-logo-h.png" alt="Washio" className="h-10 w-auto" />
          <div className="flex gap-6">
            <a href="#about" className="text-xs text-gray-500 hover:text-washio-cyan-dark">Για εμάς</a>
            <a href="#how" className="text-xs text-gray-500 hover:text-washio-cyan-dark">Πώς λειτουργεί</a>
            <Link href="/apply" className="text-xs text-gray-500 hover:text-washio-cyan-dark">Συνεργάτες</Link>
            <a href="#contact" className="text-xs text-gray-500 hover:text-washio-cyan-dark">Επικοινωνία</a>
          </div>
          <p className="text-xs text-gray-300">© 2026 Washio. All rights reserved.</p>
        </div>
      </footer>

    </main>
  )
}