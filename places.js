/* Gyms and libraries. Hours are minutes after midnight, [open, close], days Mon..Sun.
   null = closed that day. 1440 = midnight. Pulled from the official pages the
   week of Oct 26, 2026 (regular semester hours). Holidays and finals can differ:
   every place links to its official hours page. */
var TH7_HOURS_ASOF = 'Oct 26, 2026';

var TH7_PLACES = [
  /* ---------------- gyms ---------------- */
  { id: 'rpac', type: 'gym', short: 'RPAC', name: 'RPAC', full: 'Recreation and Physical Activity Center',
    addr: '337 Annie & John Glenn Ave', ll: [39.99964, -83.01844],
    url: 'https://recsports.osu.edu/fms/facilities/rpac',
    hours: [[330, 1440], [330, 1440], [330, 1440], [330, 1440], [330, 1440], [480, 1440], [600, 1440]],
    note: 'Biggest rec center on campus. BuckID to get in.' },
  { id: 'nrc', type: 'gym', short: 'North Rec', name: 'North Rec', full: 'North Recreation Center',
    addr: '149 W Lane Ave', ll: [40.00523, -83.01279],
    url: 'https://recsports.osu.edu/fms/facilities/nrc',
    hours: [[360, 1440], [360, 1440], [360, 1440], [360, 1440], [360, 1320], [600, 1320], [600, 1440]],
    note: 'Three floors of fitness, outdoor courts.' },
  { id: 'jon', type: 'gym', short: 'JO North', name: 'Jesse Owens North', full: 'Jesse Owens North Recreation Center',
    addr: '2151 Neil Ave', ll: [40.00589, -83.01504],
    url: 'https://recsports.osu.edu/fms/facilities/jon',
    hours: [[480, 1200], [480, 1200], [480, 1200], [480, 1200], [480, 1200], [720, 1080], [720, 1200]],
    note: 'Smaller and quieter. No bags on the fitness floor, bring a lock.' },
  { id: 'jos', type: 'gym', short: 'JO South', name: 'Jesse Owens South', full: 'Jesse Owens South Recreation Center',
    addr: '175 W 11th Ave', ll: [39.99501, -83.01186],
    url: 'https://recsports.osu.edu/fms/facilities/jos',
    hours: [[360, 1440], [360, 1440], [360, 1440], [360, 1440], [360, 1320], [720, 1320], [720, 1440]],
    note: 'South campus. Courts, free weights, table tennis.' },
  { id: 'pf', type: 'gym', short: 'Planet Fitness', name: 'Planet Fitness', full: 'Planet Fitness (Indianola Ave)',
    addr: '3614 Indianola Ave', ll: [40.03718, -82.99930],
    url: 'https://www.planetfitness.com/gyms/columbus-indianola-ave-oh',
    hours: [[300, 1440], [0, 1440], [0, 1440], [0, 1440], [0, 1320], [420, 1140], [420, 1140]],
    note: 'Open straight through from Mon 5am to Fri 10pm. Closest PF to campus.' },
  { id: 'crunch', type: 'gym', short: 'Crunch', name: 'Crunch Fitness', full: 'Crunch Fitness (Campus)',
    addr: '2875 Olentangy River Rd', ll: [40.01957, -83.02620],
    url: 'https://www.crunch.com/locations/campus',
    hours: [[300, 1440], [300, 1440], [300, 1440], [300, 1440], [300, 1380], [420, 1260], [420, 1260]],
    note: 'Off campus on Olentangy River Rd.' },

  /* ---------------- libraries ---------------- */
  { id: 'thompson', type: 'library', short: 'Thompson', name: 'Thompson Library', full: 'William Oxley Thompson Memorial Library',
    addr: '1858 Neil Avenue Mall', ll: [39.99926, -83.01490],
    url: 'https://library.osu.edu/hours',
    hours: [[450, 1440], [450, 1440], [450, 1440], [450, 1440], [450, 1320], [480, 1320], [660, 1440]],
    note: 'Group study rooms close 30 min before the building.' },
  { id: 'l18', type: 'library', short: '18th Ave', name: '18th Avenue Library', full: '18th Avenue Library',
    addr: '175 W 18th Ave', ll: [40.00160, -83.01333],
    url: 'https://library.osu.edu/hours',
    hours: [[0, 1440], [0, 1440], [0, 1440], [0, 1440], [0, 1439], [450, 1440], [450, 1440]],
    note: '24 hours Sun 7:30am to Fri 11:59pm. Current BuckID needed 12am to 7am. Study rooms 7:30am to 11:30pm.' },
  { id: 'music', type: 'library', inside: 'l18', short: 'Music & Dance', name: 'Music & Dance Library', full: 'Music & Dance Library (210-A, 18th Ave Library)',
    addr: '175 W 18th Ave, Room 210-A', ll: [40.00160, -83.01333],
    url: 'https://library.osu.edu/hours',
    hours: [[540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 1020], null, null],
    note: 'Inside the 18th Avenue Library, 2nd floor.' },
  { id: 'rcommons', type: 'library', inside: 'l18', short: 'Research Commons', name: 'Research Commons', full: 'Research Commons (3rd floor, 18th Ave Library)',
    addr: '175 W 18th Ave, 3rd Floor', ll: [40.00160, -83.01333],
    url: 'https://library.osu.edu/hours',
    hours: [[540, 1140], [540, 1140], [540, 1140], [540, 1140], [540, 1020], null, null],
    note: 'Inside the 18th Avenue Library, 3rd floor.' },
  { id: 'arch', type: 'library', short: 'Architecture', name: 'Architecture Library', full: 'Architecture Library (Knowlton Hall)',
    addr: '275 W Woodruff Ave, 400A Knowlton Hall', ll: [40.00360, -83.01659],
    url: 'https://library.osu.edu/hours',
    hours: [[540, 1170], [540, 1170], [540, 1170], [540, 1170], [540, 1080], null, null],
    note: 'Top floor of Knowlton Hall.' },
  { id: 'finearts', type: 'library', short: 'Fine Arts', name: 'Fine Arts Library', full: 'Fine Arts Library (Wexner Center)',
    addr: '1871 N High St, 040L Wexner Center', ll: [40.00068, -83.00937],
    url: 'https://library.osu.edu/hours',
    hours: [[540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 1080], null, null],
    note: 'Lower level of the Wexner Center for the Arts.' },
  { id: 'faes', type: 'library', short: 'FAES', name: 'FAES Library', full: 'Food, Agricultural & Environmental Sciences Library',
    addr: '2120 Fyffe Rd, 045 Ag Admin Building', ll: [40.00547, -83.02706],
    url: 'https://library.osu.edu/hours',
    hours: [[480, 1080], [480, 1080], [480, 1080], [480, 1080], [480, 1020], null, null],
    note: 'Ag Administration Building on west campus.' },
  { id: 'geology', type: 'library', short: 'Geology', name: 'Geology Library', full: 'Orton Memorial Library of Geology',
    addr: '155 S Oval Mall, 180 Orton Hall', ll: [39.99834, -83.01194],
    url: 'https://library.osu.edu/hours',
    hours: [[540, 1140], [540, 1140], [540, 1140], [540, 1140], [540, 960], null, [840, 1080]],
    note: 'Inside Orton Hall on the Oval. Gorgeous reading room.' },
  { id: 'hsl', type: 'library', short: 'Health Sci', name: 'Health Sciences Library', full: 'Health Sciences Library (Prior Hall)',
    addr: '376 W 10th Ave, Prior Hall', ll: [39.99478, -83.01709],
    url: 'https://hsl.osu.edu/using-library/visit/location-hours-and-parking',
    hours: [[450, 1170], [450, 1170], [450, 1170], [450, 1170], [450, 1050], [600, 1050], [720, 1170]],
    note: 'Prior Hall building needs a badge swipe on weekends.' },
  { id: 'law', type: 'library', short: 'Law', name: 'Moritz Law Library', full: 'Moritz Law Library (Drinko Hall)',
    addr: '55 W 12th Ave, Drinko Hall 2nd Floor', ll: [39.99608, -83.00821],
    url: 'https://moritzlaw.osu.edu/law-library',
    hours: [[480, 1020], [480, 1020], [480, 1020], [480, 1020], [480, 1020], null, null],
    note: 'Open to people using the law collection.' },
  { id: 'vet', type: 'library', short: 'Vet Med', name: 'Veterinary Medicine Library', full: 'Veterinary Medicine Library',
    addr: '1900 Coffey Rd, 225 Vet Med Academic Bldg', ll: [39.99958, -83.02691],
    url: 'https://library.osu.edu/hours',
    hours: [[480, 1020], [480, 1020], [480, 1020], [480, 1020], [480, 1020], null, null],
    note: 'Public 8am to 5pm weekdays. CVM ID needed after hours and weekends.' }
];

var TH7_SPLITS = [
  { id: 'push', label: 'Push' }, { id: 'pull', label: 'Pull' }, { id: 'legs', label: 'Legs' },
  { id: 'upper', label: 'Upper' }, { id: 'lower', label: 'Lower' }, { id: 'fullbody', label: 'Full body' },
  { id: 'arms', label: 'Arms' }, { id: 'core', label: 'Core' }, { id: 'cardio', label: 'Cardio' },
  { id: 'hoops', label: 'Hoops' }, { id: 'swim', label: 'Swim' }
];

var TH7_EVENT_TAGS = [
  { id: 'party', label: 'Party' }, { id: 'out', label: 'Night out' }, { id: 'game', label: 'Game day' },
  { id: 'food', label: 'Food' }, { id: 'chill', label: 'Chill' }, { id: 'other', label: 'Other' }
];

var TH7_HOLIDAYS = {
  '2026-10-31': 'Halloween', '2026-11-11': 'Veterans Day', '2026-11-26': 'Thanksgiving',
  '2026-12-24': 'Christmas Eve', '2026-12-25': 'Christmas', '2026-12-31': "New Year's Eve",
  '2027-01-01': "New Year's Day", '2027-02-14': "Valentine's Day", '2027-03-17': "St. Patrick's Day"
};

var TH7_COLORS = ['#ff3b5c', '#ff8a3d', '#ffd23f', '#3ddc97', '#2ec4ff', '#5b7cff',
  '#a66bff', '#ff5fd2', '#00d1c1', '#c6e03b', '#f7a8b8', '#c9ced6'];
