// Κατηγορία τιμολόγησης ανά μάρκα/μοντέλο — αποφασίζει η Washio (όχι ο πελάτης / ο πλύντης).
// Κανόνας: SUV, crossover, MPV (πολυμορφικά/7θέσια) → «SUV». Βαν/pickup → «SUV» προς το παρόν
// (μεγαλύτερη κατηγορία δεν υπάρχει ακόμα). Όλα τα υπόλοιπα (hatchback, sedan, station wagon, coupé, cabrio) → «ΙΧ».
// Νέο/οριακό μοντέλο → πρόσθεσέ το εδώ (μία γραμμή). Άγνωστο μοντέλο → ο πελάτης κρατά την επιλογή του χάρτη.
export type SizeClass = 'ΙΧ' | 'SUV'
export type VehicleClass = SizeClass | 'Μοτοσικλέτα'

// [μάρκα, μοντέλα ΙΧ, μοντέλα SUV/MPV]
const DATA: [string, string[], string[]][] = [
  ['Abarth', ['500', '595', '695', '124 Spider'], ['600e']],
  ['Alfa Romeo', ['Giulietta', 'Giulia', 'MiTo', '159', '147', 'Brera'], ['Stelvio', 'Tonale', 'Junior']],
  ['Audi', ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'TT', 'R8', 'e-tron GT', 'RS3', 'RS4', 'RS6', 'S3'], ['Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q6 e-tron', 'Q7', 'Q8', 'Q8 e-tron', 'e-tron', 'SQ5']],
  ['BMW', ['Σειρά 1', 'Σειρά 2', 'Σειρά 3', 'Σειρά 4', 'Σειρά 5', 'Σειρά 6', 'Σειρά 7', 'Σειρά 8', 'i3', 'i4', 'i5', 'i7', 'Z4', 'M2', 'M3', 'M4', 'M5'], ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'XM', 'iX', 'iX1', 'iX2', 'iX3', 'Σειρά 2 Active Tourer', 'Σειρά 2 Gran Tourer']],
  ['BYD', ['Dolphin', 'Dolphin Surf', 'Seal'], ['Atto 2', 'Atto 3', 'Seal U', 'Sealion 7', 'Tang', 'Han']],
  ['Chevrolet', ['Spark', 'Aveo', 'Cruze', 'Matiz', 'Kalos', 'Camaro'], ['Captiva', 'Trax', 'Orlando']],
  ['Citroën', ['C1', 'C3', 'C4', 'C4 X', 'C5', 'DS3', 'ë-C3', 'Saxo', 'Xsara', 'AMI'], ['C3 Aircross', 'C4 Picasso', 'C4 SpaceTourer', 'C5 Aircross', 'C5 X', 'Berlingo', 'C3 Picasso', 'Xsara Picasso', 'Grand C4 Picasso', 'SpaceTourer', 'Jumpy', 'Jumper']],
  ['Cupra', ['Born', 'Leon'], ['Formentor', 'Ateca', 'Tavascan', 'Terramar']],
  ['Dacia', ['Sandero', 'Sandero Stepway', 'Logan', 'Spring'], ['Duster', 'Jogger', 'Bigster', 'Lodgy', 'Dokker']],
  ['Daihatsu', ['Terios', 'Sirion', 'Cuore'], []],
  ['DS', ['DS 3', 'DS 4', 'DS 5', 'DS 9'], ['DS 3 Crossback', 'DS 7']],
  ['Fiat', ['500', '500e', 'Panda', 'Punto', 'Grande Punto', 'Tipo', 'Bravo', 'Seicento', 'Uno', 'Stilo', 'Linea', '124 Spider'], ['500X', '500L', '600', 'Panda Cross', 'Qubo', 'Doblò', 'Multipla', 'Fiorino', 'Ducato', 'Fullback', 'Freemont', 'Sedici']],
  ['Ford', ['Fiesta', 'Focus', 'Ka', 'Ka+', 'Mondeo', 'Fusion', 'Mustang'], ['Puma', 'Kuga', 'EcoSport', 'Explorer', 'Mustang Mach-E', 'Edge', 'C-Max', 'S-Max', 'Galaxy', 'B-Max', 'Tourneo Connect', 'Tourneo Courier', 'Transit', 'Transit Custom', 'Ranger']],
  ['Honda', ['Jazz', 'Civic', 'Accord', 'Insight', 'e'], ['HR-V', 'CR-V', 'ZR-V', 'e:Ny1', 'FR-V']],
  ['Hyundai', ['i10', 'i20', 'i30', 'Accent', 'Elantra', 'Getz', 'Ioniq', 'Ioniq 6', 'Atos'], ['Kona', 'Bayon', 'Tucson', 'Santa Fe', 'Ioniq 5', 'ix20', 'ix35', 'Inster', 'H-1']],
  ['Jaguar', ['XE', 'XF', 'XJ', 'F-Type'], ['E-Pace', 'F-Pace', 'I-Pace']],
  ['Jeep', [], ['Renegade', 'Compass', 'Avenger', 'Cherokee', 'Grand Cherokee', 'Wrangler']],
  ['Kia', ['Picanto', 'Rio', 'Ceed', 'ProCeed', 'Stinger', 'EV4'], ['Stonic', 'XCeed', 'Niro', 'Sportage', 'Sorento', 'EV3', 'EV6', 'EV9', 'Soul', 'Carens', 'Venga']],
  ['Lancia', ['Ypsilon', 'Delta', 'Musa'], []],
  ['Land Rover', [], ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Range Rover Velar', 'Freelander']],
  ['Lexus', ['CT', 'IS', 'ES', 'LS', 'RC', 'LC'], ['LBX', 'UX', 'NX', 'RX', 'RZ', 'LM']],
  ['Mazda', ['2', '3', '6', 'MX-5', 'MX-30'], ['CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-80', '5']],
  ['Mercedes-Benz', ['A-Class', 'B-Class', 'C-Class', 'CLA', 'CLS', 'E-Class', 'S-Class', 'SL', 'SLK', 'AMG GT', 'EQE', 'EQS'], ['GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'G-Class', 'EQA', 'EQB', 'EQC', 'EQE SUV', 'EQS SUV', 'ML', 'GL', 'V-Class', 'Vito', 'Citan', 'Sprinter', 'X-Class']],
  ['MG', ['MG4', 'MG3', 'MG5', 'Cyberster'], ['ZS', 'HS', 'MG Marvel R', 'EHS']],
  ['MINI', ['Cooper', 'One', 'Clubman', 'Cabrio', 'Aceman'], ['Countryman', 'Paceman']],
  ['Mitsubishi', ['Space Star', 'Colt', 'Lancer'], ['ASX', 'Eclipse Cross', 'Outlander', 'Pajero', 'L200']],
  ['Nissan', ['Micra', 'Note', 'Leaf', 'Almera', 'Pulsar', '370Z'], ['Juke', 'Qashqai', 'X-Trail', 'Ariya', 'Pathfinder', 'Navara', 'Townstar', 'Primastar', 'Evalia']],
  ['Opel', ['Corsa', 'Astra', 'Insignia', 'Adam', 'Agila', 'Vectra', 'Karl', 'Tigra'], ['Mokka', 'Crossland', 'Grandland', 'Frontera', 'Meriva', 'Zafira', 'Combo', 'Vivaro', 'Antara']],
  ['Peugeot', ['107', '108', '206', '207', '208', '306', '307', '308', '407', '508', 'iOn'], ['2008', '3008', '5008', '408', 'Rifter', 'Partner', 'Traveller', 'Expert', '4007', '807', '1007']],
  ['Polestar', ['2'], ['3', '4']],
  ['Porsche', ['911', '718 Boxster', '718 Cayman', 'Panamera', 'Taycan'], ['Cayenne', 'Macan']],
  ['Renault', ['Clio', 'Twingo', 'Mégane', 'Zoe', 'Talisman', 'Laguna', 'R5', 'Fluence'], ['Captur', 'Arkana', 'Austral', 'Kadjar', 'Koleos', 'Rafale', 'Symbioz', 'Mégane E-Tech', 'Scenic', 'Grand Scenic', 'Espace', 'Kangoo', 'Trafic', 'Master', 'R4']],
  ['Seat', ['Ibiza', 'Leon', 'Mii', 'Toledo', 'Cordoba'], ['Arona', 'Ateca', 'Tarraco', 'Altea', 'Alhambra']],
  ['Škoda', ['Fabia', 'Octavia', 'Scala', 'Superb', 'Citigo', 'Rapid'], ['Kamiq', 'Karoq', 'Kodiaq', 'Elroq', 'Enyaq', 'Yeti', 'Roomster']],
  ['Smart', ['ForTwo', 'ForFour'], ['#1', '#3']],
  ['SsangYong', [], ['Tivoli', 'Korando', 'Rexton', 'Torres']],
  ['Subaru', ['Impreza', 'BRZ', 'Legacy'], ['XV', 'Crosstrek', 'Forester', 'Outback', 'Solterra']],
  ['Suzuki', ['Swift', 'Ignis', 'Celerio', 'Alto', 'Baleno', 'Splash'], ['Vitara', 'S-Cross', 'Jimny', 'Grand Vitara', 'Across', 'SX4']],
  ['Tesla', ['Model 3', 'Model S'], ['Model Y', 'Model X']],
  ['Toyota', ['Aygo', 'Aygo X', 'Yaris', 'Corolla', 'Auris', 'Prius', 'Avensis', 'GR86', 'Supra', 'Camry', 'iQ'], ['Yaris Cross', 'C-HR', 'RAV4', 'bZ4X', 'Land Cruiser', 'Highlander', 'Corolla Cross', 'Hilux', 'Proace', 'Proace City', 'Verso', 'Corolla Verso']],
  ['Volkswagen', ['Polo', 'Golf', 'Up', 'Passat', 'Arteon', 'Jetta', 'Scirocco', 'Beetle', 'ID.3', 'Lupo', 'Fox', 'Bora'], ['T-Cross', 'T-Roc', 'Taigo', 'Tiguan', 'Touareg', 'ID.4', 'ID.5', 'ID.7', 'ID. Buzz', 'Touran', 'Sharan', 'Caddy', 'Transporter', 'Multivan', 'Amarok', 'Golf Plus', 'Golf Sportsvan']],
  ['Volvo', ['V40', 'S60', 'V60', 'S90', 'V90', 'C30', 'S40', 'S80'], ['XC40', 'EX30', 'XC60', 'XC90', 'EX40', 'EX90', 'C40']],
  // Λοιπές μάρκες ελληνικής αγοράς (κινεζικές, premium, παλιές)
  ['Aixam', ['City', 'Crossline', 'Coupé', 'Minauto'], []],
  ['Alpine', ['A110', 'A290'], []],
  ['Aston Martin', ['Vantage', 'DB11', 'DB12', 'DBS'], ['DBX']],
  ['Bentley', ['Continental GT', 'Flying Spur'], ['Bentayga']],
  ['Cadillac', ['CTS', 'ATS'], ['Escalade', 'XT4', 'XT5', 'Lyriq']],
  ['Chery', ['Arrizo'], ['Tiggo 4', 'Tiggo 7', 'Tiggo 8']],
  ['Chrysler', ['300C', 'PT Cruiser'], ['Voyager', 'Grand Voyager', 'Pacifica']],
  ['Dodge', ['Charger', 'Challenger'], ['Journey', 'Durango', 'Ram', 'Nitro']],
  ['DFSK', [], ['Seres 3', 'Fengon 500', 'Fengon 580', 'Glory']],
  ['Ferrari', ['Roma', '296', 'F8', 'SF90', '812', 'Portofino', '488', 'California'], ['Purosangue']],
  ['Geely', ['Emgrand', 'Geometry A'], ['Coolray', 'EX5', 'Atlas']],
  ['Genesis', ['G70', 'G80'], ['GV60', 'GV70', 'GV80']],
  ['Great Wall', [], ['Steed', 'Hover', 'Wingle', 'Poer']],
  ['Infiniti', ['Q30', 'Q50', 'Q60'], ['QX30', 'QX50', 'QX70']],
  ['Ineos', [], ['Grenadier']],
  ['Isuzu', [], ['D-Max', 'Trooper']],
  ['Iveco', [], ['Daily']],
  ['Jaecoo', [], ['J7', 'J8']],
  ['Lada', ['Vesta', 'Granta', 'Samara'], ['Niva', 'Niva Legend', 'Largus']],
  ['Lamborghini', ['Huracán', 'Revuelto', 'Aventador', 'Temerario'], ['Urus']],
  ['Leapmotor', ['T03'], ['C10', 'B10']],
  ['Ligier', ['JS50', 'Myli'], []],
  ['Lotus', ['Elise', 'Exige', 'Emira', 'Emeya'], ['Eletre']],
  ['Lynk & Co', [], ['01', '02']],
  ['Maserati', ['Ghibli', 'Quattroporte', 'GranTurismo', 'MC20'], ['Levante', 'Grecale']],
  ['Maxus', [], ['eDeliver 3', 'T90', 'Mifa 9', 'Euniq 6']],
  ['Microcar', ['M.Go', 'Due'], []],
  ['Omoda', [], ['5', 'E5', '7']],
  ['Rolls-Royce', ['Ghost', 'Phantom', 'Wraith', 'Spectre'], ['Cullinan']],
  ['Rover', ['25', '45', '75', 'Streetwise'], []],
  ['Saab', ['9-3', '9-5', '900'], []],
  ['Xpeng', [], ['G6', 'G9', 'P7']],
  ['Zeekr', [], ['001', '7X', 'X']],
  ['Daewoo', ['Matiz', 'Lanos', 'Nubira', 'Kalos'], ['Tacuma']],
  ['Proton', ['Persona', 'Satria', 'Savvy'], []],
  ['Tata', ['Indica', 'Indigo'], ['Safari', 'Xenon']],
  ['Mahindra', [], ['Scorpio', 'XUV500', 'Goa', 'Pik Up']],
  ['UAZ', [], ['Hunter', 'Patriot']],
]

// Μοτοσικλέτες/scooter (ίδια αναζήτηση με τα αυτοκίνητα).
const MOTO: [string, string[]][] = [
  ['Honda', ['SH 125', 'SH 150', 'SH 300', 'SH 350', 'PCX 125', 'Forza 125', 'Forza 350', 'Forza 750', 'X-ADV', 'NC 750', 'Africa Twin', 'CB 500', 'CB 650R', 'CBR 500R', 'CBR 650R', 'CBR 1000RR', 'Transalp', 'Hornet', 'Vision 110', 'Innova', 'Astrea', 'Supra', 'Wave', 'Rebel', 'Gold Wing', 'ADV 350', 'MSX 125']],
  ['Yamaha', ['TMAX', 'XMAX 125', 'XMAX 300', 'NMAX 125', 'NMAX 155', 'Tricity', 'Crypton', 'MT-03', 'MT-07', 'MT-09', 'MT-10', 'MT-125', 'Tracer 7', 'Tracer 9', 'Ténéré 700', 'R1', 'R3', 'R7', 'R125', 'XSR 700', 'XSR 900', 'Aerox', 'D\'elight', 'Neo\'s', 'X-City']],
  ['Kymco', ['Agility', 'People', 'People S', 'Downtown', 'Xciting', 'AK 550', 'Like', 'DT X360', 'Super 8', 'Dink']],
  ['SYM', ['Symphony', 'Joymax', 'GTS', 'Maxsym', 'Jet 14', 'Fiddle', 'Orbit', 'Cruisym', 'ADX', 'VF 185']],
  ['Piaggio', ['Beverly', 'Liberty', 'Medley', 'MP3', 'Zip', 'Fly', 'X10', 'X-Evo', '1']],
  ['Vespa', ['Primavera', 'Sprint', 'GTS', 'GTV', 'LX', 'Elettrica']],
  ['Suzuki', ['Burgman 125', 'Burgman 200', 'Burgman 400', 'Address', 'Avenis', 'V-Strom 650', 'V-Strom 800', 'V-Strom 1050', 'GSX-R', 'GSX-S', 'SV 650', 'Hayabusa']],
  ['Kawasaki', ['Ninja 400', 'Ninja 650', 'Ninja ZX-6R', 'Ninja ZX-10R', 'Z400', 'Z650', 'Z900', 'Versys 650', 'Versys 1000', 'Vulcan', 'Eliminator']],
  ['BMW Motorrad', ['R 1250 GS', 'R 1300 GS', 'F 800 GS', 'F 900 R', 'F 900 XR', 'S 1000 RR', 'C 400 X', 'C 400 GT', 'CE 04', 'G 310 R', 'R nineT']],
  ['KTM', ['Duke 125', 'Duke 390', 'Duke 790', 'Duke 890', '390 Adventure', '890 Adventure', '1290 Super Adventure', 'RC 390']],
  ['Ducati', ['Monster', 'Multistrada', 'Scrambler', 'Panigale', 'Diavel', 'Hypermotard', 'DesertX', 'Streetfighter']],
  ['Triumph', ['Tiger', 'Street Triple', 'Speed Triple', 'Trident', 'Bonneville', 'Speed Twin', 'Scrambler']],
  ['Aprilia', ['SR GT', 'SR 50', 'Tuono', 'RS 660', 'RSV4', 'Tuareg', 'Scarabeo']],
  ['Harley-Davidson', ['Sportster', 'Street Glide', 'Road Glide', 'Fat Boy', 'Softail', 'Pan America', 'Nightster']],
  ['Benelli', ['TRK 502', 'Leoncino', 'BN 125', '752S']],
  ['Royal Enfield', ['Classic 350', 'Himalayan', 'Interceptor', 'Meteor', 'Hunter']],
  ['Modenas', ['Kriss']],
  ['Daytona', ['Velos']],
  ['CFMOTO', ['450 MT', '700 MT', '300 NK', '800 NK']],
  ['Voge', ['300 Rally', '525 DSX', 'SR4']],
  ['Zontes', ['ZT 350', 'ZT 125']],
  ['Moto Guzzi', ['V7', 'V85 TT', 'Stelvio']],
  ['MV Agusta', ['Brutale', 'Dragster', 'F3']],
  ['Niu', ['NQi', 'MQi', 'UQi']],
]

export type CarModel = { make: string; model: string; size: VehicleClass; label: string }

export const CAR_MODELS: CarModel[] = DATA.flatMap<CarModel>(([make, ix, suv]) => [
  ...ix.map(model => ({ make, model, size: 'ΙΧ' as SizeClass, label: `${make} ${model}` })),
  ...suv.map(model => ({ make, model, size: 'SUV' as SizeClass, label: `${make} ${model}` })),
]).concat(MOTO.flatMap(([make, models]) => models.map(model => ({ make, model, size: 'Μοτοσικλέτα' as VehicleClass, label: `${make} ${model}` }))))

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9α-ω]+/g, '')

// Μάρκες γραμμένες στα ελληνικά → λατινικά (π.χ. «τογιοτα γιαρις»).
const GR_ALIASES: [string, string][] = [
  ['τογιοτα', 'toyota'], ['τοιοτα', 'toyota'], ['γιαρις', 'yaris'], ['νισαν', 'nissan'], ['νισσαν', 'nissan'], ['κασκαι', 'qashqai'],
  ['πεζω', 'peugeot'], ['πεζο', 'peugeot'], ['ρενο', 'renault'], ['σιτροεν', 'citroen'], ['φιατ', 'fiat'], ['φορντ', 'ford'],
  ['οπελ', 'opel'], ['φολκσβαγκεν', 'volkswagen'], ['βω', 'vw'], ['γκολφ', 'golf'], ['πολο', 'polo'], ['σκοντα', 'skoda'], ['σεατ', 'seat'],
  ['χιουνται', 'hyundai'], ['χιουνταϊ', 'hyundai'], ['κια', 'kia'], ['μαζντα', 'mazda'], ['χοντα', 'honda'], ['σουζουκι', 'suzuki'],
  ['μερσεντες', 'mercedes'], ['μερσεντεσ', 'mercedes'], ['μπεμβε', 'bmw'], ['αουντι', 'audi'], ['βολβο', 'volvo'], ['ντασια', 'dacia'],
  ['μινι', 'mini'], ['τζιπ', 'jeep'], ['λεξους', 'lexus'], ['τεσλα', 'tesla'], ['μιτσουμπισι', 'mitsubishi'], ['σουμπαρου', 'subaru'],
  ['κουπρα', 'cupra'], ['αλφα', 'alfa'], ['λαντσια', 'lancia'], ['σμαρτ', 'smart'], ['πορσε', 'porsche'], ['ρειντζ', 'range'],
]
const ALIAS_MAKE: Record<string, string> = { vw: 'volkswagen', mercedes: 'mercedesbenz' }

/** Αναζήτηση (μάρκα ή μοντέλο, χωρίς τόνους/κενά, και ελληνικά). */
export function searchCarModels(q: string, limit = 8, only?: 'car' | 'moto'): CarModel[] {
  let lq = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [gr, en] of GR_ALIASES) lq = lq.replace(new RegExp(gr, 'g'), en)
  let n = norm(lq)
  for (const [a, full] of Object.entries(ALIAS_MAKE)) if (n.startsWith(a)) n = full + n.slice(a.length)
  if (n.length < 2) return []
  const pool = CAR_MODELS.filter(c => !(only === 'car' && c.size === 'Μοτοσικλέτα') && !(only === 'moto' && c.size !== 'Μοτοσικλέτα'))
  // Έγραψε σκέτη μάρκα (π.χ. «bmw») → ΟΛΑ τα μοντέλα της (X1, X5, Σειρά 3…), όχι μόνο τα πρώτα.
  const makeHits = pool.filter(c => norm(c.make) === n)
  if (makeHits.length) return makeHits
  const starts: CarModel[] = [], modelStarts: CarModel[] = [], has: CarModel[] = []
  for (const c of pool) {
    const full = norm(c.label), model = norm(c.model)
    if (full.startsWith(n)) starts.push(c)          // «bmw x» → BMW X1…X7
    else if (model.startsWith(n)) modelStarts.push(c) // «x5» → BMW X5
    else if (full.includes(n)) has.push(c)
  }
  return [...starts, ...modelStarts, ...has].slice(0, limit)
}

/** Ακριβής αντιστοίχιση ετικέτας → κατηγορία (null = άγνωστο μοντέλο). */
export function sizeOfModel(label: string | null | undefined): VehicleClass | null {
  if (!label) return null
  const n = norm(label)
  return CAR_MODELS.find(c => norm(c.label) === n)?.size ?? null
}
