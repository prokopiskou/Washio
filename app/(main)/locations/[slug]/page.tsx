'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Star, MapPin, Clock, Check, ChevronLeft, ChevronRight } from 'lucide-react'

const location = {
  id: 1,
  name: 'Avin Γλυφάδα',
  address: 'Λεωφ. Βουλιαγμένης 20, Γλυφάδα',
  rating: 4.8,
  reviews: 124,
  distance: '0.4 km',
}

const services = [
  { id: 1, name: 'Μέσα', desc: 'Καθάρισμα εσωτερικού', price: 10, duration: 30 },
  { id: 2, name: 'Έξω', desc: 'Πλύσιμο εξωτερικού', price: 6, duration: 15 },
  { id: 3, name: 'Μέσα-Έξω', desc: 'Πλήρης περιποίηση', price: 15, duration: 45 },
]

const slots = [
  { id: 1, time: '09:00', available: true },
  { id: 2, time: '09:30', available: true },
  { id: 3, time: '10:00', available: false },
  { id: 4, time: '10:30', available: true },
  { id: 5, time: '11:00', available: true },
  { id: 6, time: '11:30', available: false },
  { id: 7, time: '12:00', available: true },
  { id: 8, time: '12:30', available: true },
  { id: 9, time: '13:00', available: true },
  { id: 10, time: '13:30', available: false },
  { id: 11, time: '14:00', available: true },
  { id: 12, time: '14:30', available: true },
]

const DAYS = ['Κυ', 'Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα']
const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος']
const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

function getDatesForMonth(year: number, month: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dates = []
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    if (date >= today) dates.push(date)
  }
  return dates
}

export default function LocationPage() {
  const router = useRouter()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedService, setSelectedService] = useState<number | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)

  const dates = getDatesForMonth(viewYear, viewMonth)
  const service = services.find(s => s.id === selectedService)
  const canBook = selectedService && selectedSlot

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const prevMonth = () => {
    const now = new Date()
    if (viewMonth === now.getMonth() && viewYear === now.getFullYear()) return
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  const isToday = (d: Date) => d.toDateString() === today.toDateString()
  const isSelected = (d: Date) => d.toDateString() === selectedDate.toDateString()
  const isPast = viewMonth === today.getMonth() && viewYear === today.getFullYear()

  return (
    <main className="min-h-screen bg-white max-w-md mx-auto pb-32">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <button
          onClick={() => router.back()}
          className="text-gray-400 p-2 -ml-2"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm font-medium text-gray-900">{location.name}</span>
      </div>

      {/* Cover */}
      <div className="w-full h-28 bg-gray-100 flex items-center justify-center text-4xl">
        ⛽
      </div>

      {/* Info */}
      <section className="px-5 py-3 border-b border-gray-100">
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-sm font-semibold text-gray-900">{location.name}</h1>
          <div className="flex items-center gap-1">
            <Star size={11} className="text-amber-400 fill-amber-400" />
            <span className="text-xs font-medium text-gray-700">{location.rating}</span>
            <span className="text-xs text-gray-400">({location.reviews})</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <MapPin size={10} />
          <span>{location.address}</span>
          <span className="mx-1">·</span>
          <span>{location.distance}</span>
        </div>
      </section>

      {/* Services */}
      <section className="px-5 py-4 border-b border-gray-100">
        <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">
          Υπηρεσία
        </p>
        <div className="flex flex-col gap-2">
          {services.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedService(s.id)}
              className={`flex items-center justify-between px-4 py-4 rounded-xl border text-left transition-all min-h-[64px] ${
                selectedService === s.id
                  ? 'border-gray-900 bg-gray-900'
                  : 'border-gray-100 bg-white'
              }`}
            >
              <div>
                <p className={`text-sm font-medium ${selectedService === s.id ? 'text-white' : 'text-gray-900'}`}>
                  {s.name}
                </p>
                <p className="text-xs mt-0.5 text-gray-400">{s.desc}</p>
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                  <Clock size={10} />
                  {s.duration} λεπτά
                </div>
              </div>
              <div className="text-right shrink-0 ml-4">
                <p className={`text-sm font-semibold ${selectedService === s.id ? 'text-white' : 'text-gray-900'}`}>
                  €{s.price}
                </p>
                {selectedService === s.id && (
                  <Check size={14} className="text-white mt-1 ml-auto" />
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Date picker */}
      <section className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium tracking-widest text-gray-400 uppercase">
            Ημερομηνία
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              disabled={isPast}
              className={`p-2 rounded-lg ${isPast ? 'text-gray-200' : 'text-gray-400'}`}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium text-gray-700 min-w-[80px] text-center">
              {MONTHS[viewMonth]}
            </span>
            <button onClick={nextMonth} className="p-2 rounded-lg text-gray-400">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {dates.map((d, i) => (
            <button
              key={i}
              onClick={() => { setSelectedDate(d); setSelectedSlot(null) }}
              className={`flex flex-col items-center min-w-[48px] py-3 px-1 rounded-xl border transition-all shrink-0 ${
                isSelected(d) ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-100'
              }`}
            >
              <span className="text-xs text-gray-400">{DAYS[d.getDay()]}</span>
              <span className={`text-xs font-semibold mt-0.5 ${isSelected(d) ? 'text-white' : 'text-gray-900'}`}>
                {d.getDate()}
              </span>
              {isToday(d) && (
                <span className={`w-1 h-1 rounded-full mt-1 ${isSelected(d) ? 'bg-gray-500' : 'bg-blue-500'}`} />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Time slots */}
      <section className="px-5 py-4">
        <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">
          Ώρα · {selectedDate.getDate()} {MONTHS_SHORT[selectedDate.getMonth()]}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {slots.map(slot => (
            <button
              key={slot.id}
              disabled={!slot.available}
              onClick={() => setSelectedSlot(slot.id)}
              className={`py-3.5 rounded-xl text-xs font-medium border transition-all ${
                !slot.available
                  ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed'
                  : selectedSlot === slot.id
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-700 bg-white'
              }`}
            >
              {slot.time}
            </button>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 py-4 bg-white border-t border-gray-100">
        {canBook ? (
          <button
            onClick={() => router.push(`/booking?location=1&service=${selectedService}&slot=${selectedSlot}&date=${selectedDate.toISOString().split('T')[0]}`)}
            className="w-full bg-gray-900 text-white text-sm font-medium py-4 rounded-xl"
          >
            Κράτηση — €{service?.price} · {selectedDate.getDate()} {MONTHS_SHORT[selectedDate.getMonth()]}
          </button>
        ) : (
          <div className="w-full bg-gray-100 text-gray-400 text-sm font-medium py-4 rounded-xl flex items-center justify-center">
            Επίλεξε υπηρεσία, ημερομηνία και ώρα
          </div>
        )}
      </div>

    </main>
  )
}