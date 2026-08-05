import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessPersonRisk,
  assessOffspringRisk,
  getAncestorsWithKinship,
  buildRelationIndex
} from '../src/services/geneticRiskService.js';

const people = [
  { id: 'nonno', first_name: 'Gino', last_name: 'Rossi', illnesses: [{ name: 'Diabete', severity: 'grave' }] },
  { id: 'nonna', first_name: 'Ada', last_name: 'Rossi', illnesses: [] },
  { id: 'padre', first_name: 'Marco', last_name: 'Rossi', illnesses: [{ name: 'Diabete', severity: 'moderata' }] },
  { id: 'madre', first_name: 'Lia', last_name: 'Bianchi', illnesses: [{ name: 'Ipertensione', severity: 'grave' }] },
  { id: 'figlio', first_name: 'Ugo', last_name: 'Rossi', illnesses: [] },
  { id: 'esterna', first_name: 'Sara', last_name: 'Verdi', illnesses: [] }
];

const unions = [
  { id: 'u1', partner1_id: 'nonno', partner2_id: 'nonna', children_ids: ['padre'] },
  { id: 'u2', partner1_id: 'padre', partner2_id: 'madre', children_ids: ['figlio'] },
  { id: 'u3', partner1_id: 'figlio', partner2_id: 'esterna', children_ids: [] }
];

test('i coefficienti di parentela seguono la regola del dimezzamento', () => {
  const index = buildRelationIndex(people, unions);
  const ancestors = getAncestorsWithKinship('figlio', index);

  assert.equal(ancestors.get('padre').coefficient, 0.5);
  assert.equal(ancestors.get('madre').coefficient, 0.5);
  assert.equal(ancestors.get('nonno').coefficient, 0.25);
  assert.equal(ancestors.get('nonno').generation, 2);
  assert.equal(ancestors.has('esterna'), false, 'i partner non sono ascendenti');
});

test('il rischio di una persona aggrega le patologie degli ascendenti', () => {
  const result = assessPersonRisk('figlio', people, unions);
  const diabete = result.illnesses.find(item => item.key === 'diabete');

  assert.ok(diabete, 'diabete non rilevato');
  // padre (0.5 × 0.75) + nonno (0.25 × 1) = 0.625
  assert.equal(diabete.rawScore, 0.625);
  assert.equal(diabete.affected.length, 2);
  assert.ok(diabete.score > 0 && diabete.score <= 100);
});

test('il punteggio cresce con più familiari affetti ma resta entro 0-100', () => {
  const molti = [
    ...people,
    { id: 'zio', first_name: 'Zio', illnesses: [{ name: 'Diabete', severity: 'grave' }] }
  ];
  const unionsMolti = [
    ...unions,
    { id: 'u4', partner1_id: 'nonno', partner2_id: 'nonna', children_ids: ['zio'] }
  ];

  const base = assessPersonRisk('figlio', people, unions).illnesses.find(i => i.key === 'diabete');
  const esteso = assessPersonRisk('figlio', molti, unionsMolti).illnesses.find(i => i.key === 'diabete');

  assert.ok(esteso.score >= base.score);
  assert.ok(esteso.score <= 100);
});

test('la prole ipotetica dimezza il contributo rispetto ai genitori', () => {
  const perFiglio = assessPersonRisk('figlio', people, unions).illnesses.find(i => i.key === 'diabete');
  const perProle = assessOffspringRisk('figlio', 'esterna', people, unions).illnesses.find(i => i.key === 'diabete');

  assert.equal(perProle.rawScore, perFiglio.rawScore / 2);
  assert.ok(perProle.score < perFiglio.score);
});

test('rileva la consanguineità fra due genitori con antenati in comune', () => {
  const consanguinei = [
    ...people,
    { id: 'zia', first_name: 'Zia', illnesses: [] }
  ];
  const unionsConsanguinei = [
    ...unions.filter(u => u.id !== 'u3'),
    { id: 'u4', partner1_id: 'nonno', partner2_id: 'nonna', children_ids: ['zia'] }
  ];

  const result = assessOffspringRisk('padre', 'zia', consanguinei, unionsConsanguinei);
  assert.equal(result.consanguinity.shared.length, 2);
  assert.ok(result.consanguinity.coefficient > 0);
});

test('nessuna patologia registrata produce un risultato vuoto senza errori', () => {
  const puliti = people.map(person => ({ ...person, illnesses: [] }));
  const result = assessPersonRisk('figlio', puliti, unions);
  assert.deepEqual(result.illnesses, []);
});
