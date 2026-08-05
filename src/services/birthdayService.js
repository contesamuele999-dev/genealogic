/**
 * birthdayService.js
 * Servizio per calcolare i compleanni dei familiari a partire dalla data di nascita
 * registrata su ciascun nodo dell'albero, e generare bozze di notifiche email.
 */

// Oltre questa età una persona senza data di decesso viene comunque considerata defunta:
// serve a non proporre "compleanni" di antenati nati nell'800 solo perché manca il decesso.
const MAX_PLAUSIBLE_AGE = 110;

const MONTH_NAMES = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
];

/**
 * Estrae giorno e mese da una data di nascita in vari formati
 * (es: "22/05/1862", "22-05-1862", "1954-05-22", "22 maggio", "22/05")
 */
export function parseBirthDayMonth(dateStr) {
  if (!dateStr) return null;

  const str = String(dateStr).trim();

  // Formato AAAA-MM-GG (ISO). Va verificato per primo: "1954-05-22" inizia con 4 cifre.
  const isoMatch = str.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (isoMatch) {
    const day = parseInt(isoMatch[3], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    return isValidDayMonth(day, month) ? { day, month } : null;
  }

  // Formato GG/MM/AAAA o GG/MM (accetta anche separatori . e -)
  const slashMatch = str.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    return isValidDayMonth(day, month) ? { day, month } : null;
  }

  // Formato testuale "22 maggio" / "22 maggio 1954"
  const textMatch = str.toLowerCase().match(/^(\d{1,2})\s+([a-zà-ù]+)/);
  if (textMatch) {
    const day = parseInt(textMatch[1], 10);
    const month = MONTH_NAMES.findIndex(name => name.startsWith(textMatch[2].slice(0, 3)));
    return month >= 0 && isValidDayMonth(day, month) ? { day, month } : null;
  }

  return null;
}

function isValidDayMonth(day, month) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 0 || month > 11) {
    return false;
  }
  // Il 2000 mantiene valido il 29 febbraio.
  const candidate = new Date(Date.UTC(2000, month, day));
  return candidate.getUTCMonth() === month && candidate.getUTCDate() === day;
}

/**
 * Estrae l'anno di nascita, se presente nella stringa.
 */
function extractBirthYear(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/\b(\d{4})\b/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Stabilisce se una persona è (verosimilmente) in vita.
 * Una data di decesso valorizzata, oppure un'età implausibile, la escludono.
 */
export function isProbablyAlive(person, referenceDate = new Date()) {
  if (person?.death_date && String(person.death_date).trim().length > 0) return false;

  const birthYear = extractBirthYear(person?.birth_date);
  if (birthYear === null) return true;

  return referenceDate.getFullYear() - birthYear <= MAX_PLAUSIBLE_AGE;
}

/**
 * Trova i compleanni imminenti entro un certo numero di giorni (default 60).
 * Scorre TUTTI i nodi che hanno una data di nascita utilizzabile; l'opzione
 * `includeDeceased` permette di includere anche gli anniversari dei defunti.
 */
export function getUpcomingBirthdays(people = [], daysThreshold = 60, referenceDate = new Date(), options = {}) {
  const { includeDeceased = false } = options;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const upcoming = [];

  people.forEach(person => {
    if (!person || !person.birth_date) return;

    const alive = isProbablyAlive(person, today);
    if (!alive && !includeDeceased) return;

    const parsed = parseBirthDayMonth(person.birth_date);
    if (!parsed) return;

    const currentYear = today.getFullYear();
    let nextBirthday = new Date(currentYear, parsed.month, parsed.day);

    // Se il compleanno è già passato quest'anno, considera il prossimo anno
    if (nextBirthday < today) {
      nextBirthday = new Date(currentYear + 1, parsed.month, parsed.day);
    }

    // Il calcolo in UTC evita scarti di un giorno nei cambi ora legale/solare.
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const birthdayUtc = Date.UTC(nextBirthday.getFullYear(), nextBirthday.getMonth(), nextBirthday.getDate());
    const daysRemaining = Math.round((birthdayUtc - todayUtc) / 86400000);

    if (daysRemaining <= daysThreshold) {
      const birthYear = extractBirthYear(person.birth_date);

      upcoming.push({
        person,
        alive,
        daysRemaining,
        nextBirthday,
        turningAge: birthYear !== null ? nextBirthday.getFullYear() - birthYear : null
      });
    }
  });

  // Ordina dal compleanno più vicino al più lontano, poi per nome
  return upcoming.sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
    const nameA = `${a.person.first_name || ''} ${a.person.last_name || ''}`.trim();
    const nameB = `${b.person.first_name || ''} ${b.person.last_name || ''}`.trim();
    return nameA.localeCompare(nameB, 'it');
  });
}

/**
 * Riepilogo diagnostico: quante persone hanno una data di nascita utilizzabile.
 * Serve nel pannello per spiegare all'utente perché certi nodi non compaiono.
 */
export function getBirthdayCoverage(people = [], referenceDate = new Date()) {
  let withUsableDate = 0;
  let yearOnly = 0;
  let missing = 0;
  let deceased = 0;

  people.forEach(person => {
    if (!person) return;
    if (!isProbablyAlive(person, referenceDate)) deceased += 1;
    if (!person.birth_date) { missing += 1; return; }
    if (parseBirthDayMonth(person.birth_date)) withUsableDate += 1;
    else yearOnly += 1;
  });

  return { total: people.length, withUsableDate, yearOnly, missing, deceased };
}

/**
 * Genera il modello di email per notificare i membri della famiglia di un compleanno imminente
 */
export function generateBirthdayEmailContent(birthdayItem, treeName = 'Albero Genealogico') {
  const { person, daysRemaining, turningAge } = birthdayItem;
  const fullName = `${person.first_name || ''} ${person.last_name || ''}`.trim();
  const ageText = turningAge ? ` compirà ${turningAge} anni!` : '!';

  let timeText = '';
  if (daysRemaining === 0) timeText = "OGGI";
  else if (daysRemaining === 1) timeText = "DOMANI";
  else timeText = `tra ${daysRemaining} giorni`;

  const subject = `🎉 Compleanno in famiglia: ${fullName} (${timeText})`;
  const body = `Ciao,\n\nTi ricordiamo che ${timeText} (${birthdayItem.nextBirthday.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}) ricorre il compleanno di ${fullName}${ageText}\n\nNon dimenticare di inviargli i tuoi più cari auguri!\n\nMessaggio inviato da Genealogic App - ${treeName}`;

  return { subject, body };
}
