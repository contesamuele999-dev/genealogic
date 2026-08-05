import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTextOutline } from '../src/services/xmindParser.js';

function parseOne(line) {
  const { people } = parseTextOutline(line, 'tree-1');
  return people;
}

test('estrae nascita e decesso dagli intervalli tra parentesi (tutti i tipi di trattino)', () => {
  for (const dash of ['-', '–', '—']) {
    const [person] = parseOne(`Mario Rossi (22/05/1862 ${dash} 11/02/1909)`);
    assert.equal(person.birth_date, '22/05/1862', `dash ${dash}`);
    assert.equal(person.death_date, '11/02/1909', `dash ${dash}`);
  }
});

test('riconosce i marcatori espliciti di nascita e morte', () => {
  const cases = [
    'Mario Rossi (n. 1862 - m. 1909)',
    'Mario Rossi (*1862 †1909)',
    'Mario Rossi [Nato: 1862, Morto: 1909]'
  ];
  for (const line of cases) {
    const [person] = parseOne(line);
    assert.equal(person.birth_date, '1862', line);
    assert.equal(person.death_date, '1909', line);
  }
});

test('estrae le date anche quando sono scritte fuori dalle parentesi', () => {
  const [person] = parseOne('Mario Rossi 1862-1909');
  assert.equal(person.first_name, 'Mario');
  assert.equal(person.last_name, 'Rossi');
  assert.equal(person.birth_date, '1862');
  assert.equal(person.death_date, '1909');
});

test('un intervallo di date non viene scambiato per una coppia', () => {
  const people = parseOne('Mario Rossi 1862 - 1909');
  assert.equal(people.length, 1);
  assert.equal(people[0].death_date, '1909');
});

test('normalizza il formato ISO in GG/MM/AAAA', () => {
  const [person] = parseOne('Mario Rossi (1862-05-22 / 1909-02-11)');
  assert.equal(person.birth_date, '22/05/1862');
  assert.equal(person.death_date, '11/02/1909');
});

test('il marcatore di genere non viene scambiato per una data di morte', () => {
  const [person] = parseOne('Mario Rossi (M) (1954)');
  assert.equal(person.gender, 'M');
  assert.equal(person.birth_date, '1954');
  assert.equal(person.death_date, '');
});

test('le coppie mantengono le rispettive date di nascita e morte', () => {
  const people = parseOne('Giuseppe Verdi (22/05/1862 - 11/02/1909) + Anna Neri (1870 - 1930)');
  assert.equal(people.length, 2);
  assert.deepEqual(
    people.map(p => [p.first_name, p.birth_date, p.death_date]),
    [['Giuseppe', '22/05/1862', '11/02/1909'], ['Anna', '1870', '1930']]
  );
});

test('i nomi composti con trattino non vengono spezzati', () => {
  const people = parseOne('Jean-Pierre Dubois (1900-1980)');
  assert.equal(people.length, 1);
  assert.equal(people[0].first_name, 'Jean-Pierre');
  assert.equal(people[0].death_date, '1980');
});

test('la gerarchia dell’outline genera le unioni genitore-figlio', () => {
  const { people, unions } = parseTextOutline(
    'Mario Rossi (1900-1980) + Anna Neri (1905-1990)\n  Luigi Rossi (1930-2001)',
    'tree-1'
  );
  assert.equal(people.length, 3);
  const parentUnion = unions.find(u => u.children_ids.length > 0);
  assert.ok(parentUnion, 'unione con figli mancante');
  assert.equal(parentUnion.children_ids.length, 1);
});
