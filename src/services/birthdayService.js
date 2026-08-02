/**
 * birthdayService.js
 * Servizio per calcolare i compleanni dei parenti IN VITA e generare bozze di notifiche email per i membri della famiglia.
 */

/**
 * Estrae giorno e mese da una data di nascita in vari formati
 * (es: "22/05/1862", "1954-05-22", "22 maggio", "22/05")
 */
function parseBirthDayMonth(dateStr) {
  if (!dateStr) return null;

  const str = dateStr.trim();

  // Formato GG/MM/AAAA o GG/MM
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1; // 0-indexed per JavaScript Date
    return { day, month };
  }

  // Formato AAAA-MM-GG
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const day = parseInt(isoMatch[3], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    return { day, month };
  }

  return null;
}

/**
 * Calcola l'età attuale (o che compirà quest'anno)
 */
function calculateTurningAge(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})/);
  if (match) {
    const birthYear = parseInt(match[1], 10);
    const currentYear = new Date().getFullYear();
    return currentYear - birthYear;
  }
  return null;
}

/**
 * Trova i compleanni imminenti dei parenti IN VITA entro un certo numero di giorni (default 60 giorni)
 */
export function getUpcomingBirthdays(people = [], daysThreshold = 60) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = [];

  people.forEach(person => {
    // Escludi parenti deceduti (hanno una data di decesso registrata)
    if (person.death_date && person.death_date.trim().length > 0) return;
    if (!person.birth_date) return;

    const parsed = parseBirthDayMonth(person.birth_date);
    if (!parsed) return;

    const currentYear = today.getFullYear();
    let nextBirthday = new Date(currentYear, parsed.month, parsed.day);

    // Se il compleanno è già passato quest'anno, considera il prossimo anno
    if (nextBirthday < today) {
      nextBirthday = new Date(currentYear + 1, parsed.month, parsed.day);
    }

    const diffTime = nextBirthday.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 3600 * 24));

    if (daysRemaining <= daysThreshold) {
      const turningAge = calculateTurningAge(person.birth_date);

      upcoming.push({
        person,
        daysRemaining,
        nextBirthday,
        turningAge: turningAge ? (nextBirthday.getFullYear() - parseInt(person.birth_date.match(/\d{4}/)[0])) : null
      });
    }
  });

  // Ordina dal compleanno più vicino al più lontano
  return upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining);
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
