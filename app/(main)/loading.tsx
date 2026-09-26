import { WashioLoader } from '@/components/WashioLoader'

// Άμεσο feedback στο tap: εμφανίζεται ΑΜΕΣΩΣ όσο φορτώνει ο κώδικας της νέας
// οθόνης (πριν: έμενε «παγωμένη» η προηγούμενη οθόνη χωρίς καμία αντίδραση).
export default function Loading() {
  return <WashioLoader fullScreen />
}
