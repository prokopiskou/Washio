import { redirect } from 'next/navigation'

// Η παλιά σελίδα παρουσίασης της εφαρμογής (με δείγματα-πλυντήρια) καταργήθηκε:
// όποιος ανοίγει την εφαρμογή πάει ΚΑΤΕΥΘΕΙΑΝ στον χάρτη με τα πραγματικά πλυντήρια
// (−3€ banner, εγγραφή μόνο στο «Συνέχεια»). Κρατάμε το route για παλιά links/builds.
export default function WelcomePage() {
  redirect('/map')
}
