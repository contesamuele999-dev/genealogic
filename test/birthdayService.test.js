import test from 'node:test';
import assert from 'node:assert/strict';
import { getUpcomingBirthdays, generateBirthdayEmailContent } from '../src/services/birthdayService.js';

test('ordina i compleanni, esclude i defunti e calcola l’età futura', () => {
  const people = [
    { id: '1', first_name: 'Anna', last_name: 'Rossi', birth_date: '1980-04-02', death_date: '' },
    { id: '2', first_name: 'Luca', last_name: 'Bianchi', birth_date: '01/04/1990', death_date: '' },
    { id: '3', first_name: 'Ada', last_name: 'Verdi', birth_date: '03/04/1970', death_date: '2020' }
  ];

  const result = getUpcomingBirthdays(people, 10, new Date(2026, 2, 31));

  assert.deepEqual(result.map(item => item.person.id), ['2', '1']);
  assert.deepEqual(result.map(item => item.daysRemaining), [1, 2]);
  assert.equal(result[0].turningAge, 36);
});

test('rifiuta date inesistenti senza normalizzarle al mese successivo', () => {
  const result = getUpcomingBirthdays([
    { id: 'invalid', first_name: 'Data', birth_date: '31/02/2000', death_date: '' }
  ], 365, new Date(2026, 0, 1));

  assert.deepEqual(result, []);
});

test('genera una bozza email coerente per il compleanno odierno', () => {
  const [birthday] = getUpcomingBirthdays([
    { id: 'today', first_name: 'Sara', last_name: 'Neri', birth_date: '03/08/2000', death_date: '' }
  ], 0, new Date(2026, 7, 3));

  const email = generateBirthdayEmailContent(birthday, 'Famiglia Neri');
  assert.match(email.subject, /Sara Neri/);
  assert.match(email.subject, /OGGI/);
  assert.match(email.body, /26 anni/);
  assert.match(email.body, /Famiglia Neri/);
});
