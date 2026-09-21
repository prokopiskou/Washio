// Αναγνώριση ελληνικής τράπεζας από IBAN.
// Ελληνικό IBAN: GR + 2 ψηφία ελέγχου + 3 ψηφία κωδικού τράπεζας + ...
// Πηγή κωδικών: HEBIC (Ελληνική Ένωση Τραπεζών).

const BANKS: Record<string, string> = {
  '010': 'Τράπεζα της Ελλάδος',
  '011': 'Εθνική Τράπεζα',
  '014': 'Alpha Bank',
  '016': 'CrediaBank (πρώην Attica Bank)',
  '017': 'Τράπεζα Πειραιώς',
  '026': 'Eurobank',
  '034': 'Optima Bank',
  '057': 'Viva.com (Vivabank)',
  '069': 'Συν. Τράπεζα Χανίων',
  '075': 'Τράπεζα Ηπείρου',
  '084': 'Citibank Europe',
  '089': 'Συν. Τράπεζα Καρδίτσας',
  '091': 'Συν. Τράπεζα Θεσσαλίας',
  '111': 'Deutsche Bank',
  '128': 'Snappi',
}

// Καθάρισε IBAN (κενά/παύλες, κεφαλαία).
export function normalizeIban(iban?: string | null): string {
  return String(iban || '').replace(/[\s-]/g, '').toUpperCase()
}

// Επιστρέφει το όνομα τράπεζας από το IBAN, ή null αν δεν αναγνωρίζεται.
export function bankFromIban(iban?: string | null): string | null {
  const v = normalizeIban(iban)
  if (!v.startsWith('GR') || v.length < 7) return null
  const code = v.slice(4, 7) // 3 ψηφία κωδικού τράπεζας
  return BANKS[code] || null
}
