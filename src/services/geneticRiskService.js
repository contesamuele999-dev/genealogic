/**
 * geneticRiskService.js
 *
 * Calcolo EURISTICO e NON DIAGNOSTICO della predisposizione familiare a una patologia.
 *
 * Modello: per ogni antenato affetto si somma un contributo pari a
 *     coefficiente di parentela × peso della gravità
 * dove il coefficiente di parentela è quello classico (genitore 0.5, nonno 0.25,
 * bisnonno 0.125 …), cioè la quota media di genoma condivisa.
 * Il punteggio grezzo viene poi compresso in una scala 0-100 con una curva di
 * saturazione, così che più familiari affetti alzino il punteggio senza mai
 * superare il massimo.
 *
 * ATTENZIONE: si tratta di un indicatore statistico grossolano, utile solo come
 * spunto per un consulto medico. Non sostituisce in alcun modo una consulenza
 * genetica o una diagnosi.
 */

// Peso relativo della gravità dichiarata sulla scheda della persona.
export const SEVERITY_WEIGHT = {
  lieve: 0.5,
  moderata: 0.75,
  grave: 1
};

// Soglie di traduzione punteggio -> fascia qualitativa.
export const RISK_BANDS = [
  { key: 'basso', label: 'Basso', max: 20 },
  { key: 'moderato', label: 'Moderato', max: 45 },
  { key: 'alto', label: 'Alto', max: 70 },
  { key: 'molto-alto', label: 'Molto alto', max: 100 }
];

// Costante di saturazione: con un solo genitore affetto grave (contributo 0.5)
// il punteggio risulta ~ 45 (fascia "Alto" al limite con "Moderato").
const SATURATION = 0.6;

function normalizeIllnessKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Costruisce gli indici di parentela a partire da persone e unioni.
 */
export function buildRelationIndex(people = [], unions = []) {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const parentsOf = new Map(people.map(person => [person.id, new Set()]));
  const childrenOf = new Map(people.map(person => [person.id, new Set()]));
  const partnersOf = new Map(people.map(person => [person.id, new Set()]));

  unions.forEach(union => {
    const parents = [union.partner1_id, union.partner2_id].filter(Boolean);

    if (parents.length === 2) {
      partnersOf.get(parents[0])?.add(parents[1]);
      partnersOf.get(parents[1])?.add(parents[0]);
    }

    (union.children_ids || []).forEach(childId => {
      if (!parentsOf.has(childId)) return;
      parents.forEach(parentId => {
        parentsOf.get(childId).add(parentId);
        childrenOf.get(parentId)?.add(childId);
      });
    });
  });

  return { peopleById, parentsOf, childrenOf, partnersOf };
}

/**
 * Restituisce gli ascendenti di una persona con il relativo coefficiente di
 * parentela (0.5 genitori, 0.25 nonni, …) e il grado generazionale.
 * Se un antenato è raggiungibile per più vie, i coefficienti si sommano.
 */
export function getAncestorsWithKinship(personId, index, maxGenerations = 6) {
  const { parentsOf } = index;
  const result = new Map(); // id -> { coefficient, generation }

  let frontier = [{ id: personId, coefficient: 1, generation: 0 }];
  const visitedAtGeneration = new Set();

  for (let generation = 1; generation <= maxGenerations; generation++) {
    const next = [];

    frontier.forEach(({ id, coefficient }) => {
      const parents = parentsOf.get(id);
      if (!parents) return;

      parents.forEach(parentId => {
        const contribution = coefficient * 0.5;
        const existing = result.get(parentId);

        if (existing) {
          existing.coefficient += contribution;
        } else {
          result.set(parentId, { coefficient: contribution, generation });
        }

        // Evita cicli in alberi malformati (una persona non può essere avo di sé stessa)
        const guardKey = `${parentId}@${generation}`;
        if (parentId !== personId && !visitedAtGeneration.has(guardKey)) {
          visitedAtGeneration.add(guardKey);
          next.push({ id: parentId, coefficient: contribution, generation });
        }
      });
    });

    if (next.length === 0) break;
    frontier = next;
  }

  return result;
}

/**
 * Coefficienti di parentela per una prole ipotetica di due genitori.
 * I genitori stessi valgono 0.5, i loro ascendenti la metà del proprio coefficiente.
 */
export function getKinshipForHypotheticalChild(parentAId, parentBId, index) {
  const combined = new Map();

  const addLineage = (parentId) => {
    if (!parentId) return;

    const merge = (id, coefficient, generation) => {
      const existing = combined.get(id);
      if (existing) {
        existing.coefficient += coefficient;
        existing.generation = Math.min(existing.generation, generation);
      } else {
        combined.set(id, { coefficient, generation });
      }
    };

    merge(parentId, 0.5, 1);
    getAncestorsWithKinship(parentId, index).forEach((value, id) => {
      merge(id, value.coefficient * 0.5, value.generation + 1);
    });
  };

  addLineage(parentAId);
  addLineage(parentBId);

  return combined;
}

const GENERATION_LABEL = {
  1: 'Genitore',
  2: 'Nonno/a',
  3: 'Bisnonno/a',
  4: 'Trisnonno/a',
  5: '4ª generazione',
  6: '5ª generazione'
};

export function describeGeneration(generation) {
  return GENERATION_LABEL[generation] || `${generation}ª generazione`;
}

function scoreToBand(score) {
  return RISK_BANDS.find(band => score <= band.max) || RISK_BANDS[RISK_BANDS.length - 1];
}

/**
 * Aggrega le patologie degli ascendenti pesandole per coefficiente di parentela.
 * `kinship` è una Map id -> { coefficient, generation }.
 */
function aggregateIllnesses(kinship, index) {
  const { peopleById } = index;
  const byIllness = new Map();

  kinship.forEach(({ coefficient, generation }, personId) => {
    const person = peopleById.get(personId);
    if (!person || !Array.isArray(person.illnesses)) return;

    person.illnesses.forEach(illness => {
      const key = normalizeIllnessKey(illness?.name);
      if (!key) return;

      const severity = SEVERITY_WEIGHT[illness?.severity] ?? SEVERITY_WEIGHT.lieve;
      const contribution = coefficient * severity;

      if (!byIllness.has(key)) {
        byIllness.set(key, {
          key,
          name: String(illness.name).trim(),
          rawScore: 0,
          affected: []
        });
      }

      const entry = byIllness.get(key);
      entry.rawScore += contribution;
      entry.affected.push({
        personId,
        name: `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Senza nome',
        generation,
        generationLabel: describeGeneration(generation),
        kinship: Number(coefficient.toFixed(4)),
        severity: illness?.severity || 'lieve',
        notes: illness?.notes || '',
        contribution: Number(contribution.toFixed(4))
      });
    });
  });

  return Array.from(byIllness.values())
    .map(entry => {
      // Curva di saturazione: score = 100 * raw / (raw + SATURATION)
      const score = Math.round((100 * entry.rawScore) / (entry.rawScore + SATURATION));
      const band = scoreToBand(score);
      return {
        ...entry,
        rawScore: Number(entry.rawScore.toFixed(4)),
        score,
        band: band.key,
        bandLabel: band.label,
        affected: entry.affected.sort((a, b) => b.contribution - a.contribution)
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'it'));
}

/**
 * Rischio ereditato da una persona già presente nell'albero.
 */
export function assessPersonRisk(personId, people, unions) {
  const index = buildRelationIndex(people, unions);
  const person = index.peopleById.get(personId) || null;
  const kinship = getAncestorsWithKinship(personId, index);

  return {
    mode: 'person',
    subjects: person ? [person] : [],
    ancestorsAnalyzed: kinship.size,
    illnesses: aggregateIllnesses(kinship, index),
    ownIllnesses: Array.isArray(person?.illnesses) ? person.illnesses : []
  };
}

/**
 * Rischio per la prole ipotetica di due persone dell'albero.
 * Il secondo genitore è opzionale (ramo singolo).
 */
export function assessOffspringRisk(parentAId, parentBId, people, unions) {
  const index = buildRelationIndex(people, unions);
  const kinship = getKinshipForHypotheticalChild(parentAId, parentBId, index);

  const subjects = [parentAId, parentBId]
    .filter(Boolean)
    .map(id => index.peopleById.get(id))
    .filter(Boolean);

  return {
    mode: 'offspring',
    subjects,
    ancestorsAnalyzed: kinship.size,
    illnesses: aggregateIllnesses(kinship, index),
    consanguinity: getConsanguinity(parentAId, parentBId, index)
  };
}

/**
 * Verifica se i due genitori condividono antenati (consanguineità), che alza
 * il rischio per le patologie recessive.
 */
export function getConsanguinity(parentAId, parentBId, index) {
  if (!parentAId || !parentBId) return { shared: [], coefficient: 0 };

  const ancestorsA = getAncestorsWithKinship(parentAId, index);
  const ancestorsB = getAncestorsWithKinship(parentBId, index);

  const shared = [];
  let coefficient = 0;

  ancestorsA.forEach((valueA, id) => {
    const valueB = ancestorsB.get(id);
    if (!valueB) return;
    const person = index.peopleById.get(id);
    coefficient += valueA.coefficient * valueB.coefficient;
    shared.push({
      personId: id,
      name: person ? `${person.first_name || ''} ${person.last_name || ''}`.trim() : 'Sconosciuto',
      generationLabel: describeGeneration(Math.min(valueA.generation, valueB.generation))
    });
  });

  return { shared, coefficient: Number(coefficient.toFixed(4)) };
}

/**
 * Elenco delle persone dell'albero che hanno almeno una patologia registrata.
 */
export function getPeopleWithIllnesses(people = []) {
  return people.filter(person => Array.isArray(person?.illnesses) && person.illnesses.length > 0);
}
