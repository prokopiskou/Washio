'use client'

import type { ComponentType, SVGProps } from 'react'
import {
  Sparkles, Lightbulb, Gauge, Smartphone, CircleDot, TreePine, Snowflake, Layers,
  PawPrint, BatteryCharging, Sun, BriefcaseMedical, ThermometerSnowflake, SprayCan,
} from 'lucide-react'
import { norm } from '@/lib/catalog-i18n'

// Εικονίδια & κατηγορία για τα πρόσθετα του checkout (στα χρώματα της εφαρμογής).
// Όσα δεν υπάρχουν στο lucide (τιμόνι, υαλοκαθαριστήρας, λάδι) είναι δικά μας SVG, ίδιο στυλ.

type IconT = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>

const svg = (children: React.ReactNode): IconT => function Custom({ size = 18, strokeWidth = 2, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" {...rest}>{children}</svg>
  )
}

const SteeringWheel = svg(<>
  <circle cx="12" cy="12" r="9" />
  <circle cx="12" cy="12" r="2.2" />
  <path d="M12 14.2V21M9.9 11.4 3.4 9.8M14.1 11.4l6.5-1.6" />
</>)
const Wiper = svg(<>
  <path d="M4 17.5a8 8 0 0 1 16 0" />
  <path d="M12 17.5 7.2 9" />
  <path d="M5.4 10.6 9 7.4" />
  <circle cx="12" cy="17.5" r="1.2" />
</>)
const OilCan = svg(<>
  <path d="M3 10h11v7H5a2 2 0 0 1-2-2v-5Z" />
  <path d="m14 12 7-3v2l-7 4" />
  <path d="M6 10V7h4v3" />
  <path d="M20.5 15.2c0 .8-.5 1.4-1 1.4s-1-.6-1-1.4.6-1.4 1-2c.4.6 1 1.2 1 2Z" />
</>)

export type AddonCategory = 'service' | 'product'

const META: Record<string, { cat: AddonCategory; Icon: IconT }> = {
  // Πρόσθετες υπηρεσίες
  'κέρωμα': { cat: 'service', Icon: Sparkles },
  'γυάλισμα φανάρια': { cat: 'service', Icon: Lightbulb },
  'γυάλισμα φαναριών': { cat: 'service', Icon: Lightbulb },
  'αλλαγή λαδιών': { cat: 'service', Icon: OilCan },
  'αλλαγή υαλοκαθαριστήρων': { cat: 'service', Icon: Wiper },
  'γυαλιστικό του ταμπλό': { cat: 'service', Icon: Gauge },
  'γυαλιστικό ταμπλό': { cat: 'service', Icon: Gauge },
  'γυάλισμα ελαστικών': { cat: 'service', Icon: CircleDot },
  // Προϊόντα & εξαρτήματα
  'βάση κινητού': { cat: 'product', Icon: Smartphone },
  'δερμάτινο κάλυμμα τιμονιού': { cat: 'product', Icon: SteeringWheel },
  'τάσια': { cat: 'product', Icon: CircleDot },
  'αρωματικό εσωτερικού': { cat: 'product', Icon: TreePine },
  'χιονοκουβέρτες': { cat: 'product', Icon: Snowflake },
  'πατάκια': { cat: 'product', Icon: Layers },
  'κάλυμμα καθίσματος για κατοικιδίου': { cat: 'product', Icon: PawPrint },
  'καλώδια μπαταρίας': { cat: 'product', Icon: BatteryCharging },
  'ηλιοπροστασία': { cat: 'product', Icon: Sun },
  'κιτ φαρμακείου': { cat: 'product', Icon: BriefcaseMedical },
  'ψυκτικά υγρά': { cat: 'product', Icon: ThermometerSnowflake },
}

// Φωτογραφία ανά πρόσθετο (public/addons/<slug>.webp, 160×160). Όσα λείπουν → εικονίδιο.
const IMG: Record<string, string> = {
  'κέρωμα': 'wax',
  'γυάλισμα φανάρια': 'headlights',
  'γυάλισμα φαναριών': 'headlights',
  'αλλαγή λαδιών': 'oil-change',
  'αλλαγή υαλοκαθαριστήρων': 'wipers',
  'γυαλιστικό του ταμπλό': 'dashboard',
  'γυαλιστικό ταμπλό': 'dashboard',
  'βάση κινητού': 'phone-holder',
  'δερμάτινο κάλυμμα τιμονιού': 'steering-cover',
  'τάσια': 'hubcaps',
  // 'αρωματικό εσωτερικού': 'air-freshener', — καρτέλα, έρχεται
  'χιονοκουβέρτες': 'snow-socks',
  'πατάκια': 'floor-mats',
  'κάλυμμα καθίσματος για κατοικιδίου': 'pet-seat-cover',
  'καλώδια μπαταρίας': 'jumper-cables',
  'ηλιοπροστασία': 'sunshade',
  'κιτ φαρμακείου': 'first-aid',
  'ψυκτικά υγρά': 'coolant',
}

/** Άγνωστο (custom) πρόσθετο → «Πρόσθετες υπηρεσίες» με γενικό εικονίδιο. */
export function addonMeta(name: string): { cat: AddonCategory; Icon: IconT; img?: string } {
  const k = norm(name || '')
  const m = META[k] || { cat: 'service' as const, Icon: SprayCan }
  return IMG[k] ? { ...m, img: `/addons/${IMG[k]}.webp` } : m
}

export function AddonIcon({ name, selected }: { name: string; selected?: boolean }) {
  const { Icon, img } = addonMeta(name)
  if (img) {
    return (
      <span
        className={`relative w-12 h-12 shrink-0 rounded-[12px] overflow-hidden bg-washio-cyan-light transition-shadow ${
          selected ? 'ring-2 ring-washio-cyan ring-offset-1' : 'ring-1 ring-washio-border/70'
        }`}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" width={48} height={48} loading="lazy" decoding="async" className="w-full h-full object-cover" />
      </span>
    )
  }
  return (
    <span
      className={`w-9 h-9 shrink-0 rounded-[11px] flex items-center justify-center transition-colors ${
        selected ? 'bg-washio-cyan text-white' : 'bg-washio-cyan-light text-washio-cyan-dark'
      }`}
      aria-hidden
    >
      <Icon size={18} strokeWidth={2} />
    </span>
  )
}
