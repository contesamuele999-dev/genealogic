import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeLinkedTrees, collectLinkedTreeIds } from '../src/services/treeMerge.js';

const mainTree = {
  id: 'T1',
  name: 'Famiglia Rossi',
  people: [
    { id: 'p1', first_name: 'Gino', last_name: 'Rossi', birth_date: '1900' },
    { id: 'p2', first_name: 'Ada', last_name: 'Neri' },
    { id: 'p3', first_name: 'Marco', last_name: 'Rossi' }
  ],
  unions: [{ id: 'u1', partner1_id: 'p1', partner2_id: 'p2', children_ids: ['p3'] }]
};

const branchTree = {
  id: 'T2',
  name: 'Ramo di Torino',
  people: [
    { id: 'b1', first_name: 'Marco', last_name: 'Rossi', birth_date: '1935', birth_place: 'Torino' },
    { id: 'b2', first_name: 'Elena', last_name: 'Blu' },
    { id: 'b3', first_name: 'Sara', last_name: 'Rossi' }
  ],
  unions: [{ id: 'u2', partner1_id: 'b1', partner2_id: 'b2', children_ids: ['b3'] }]
};

const link = {
  id: 'l1',
  source_tree_id: 'T2',
  source_person_id: 'b1',
  target_tree_id: 'T1',
  target_person_id: 'p3',
  status: 'approved'
};

test('la persona condivisa compare una volta sola, con l’id dell’albero di casa', () => {
  const result = mergeLinkedTrees({ homeTreeId: 'T1', trees: [mainTree, branchTree], links: [link] });

  const marcos = result.people.filter(person => person.first_name === 'Marco');
  assert.equal(marcos.length, 1);
  assert.equal(marcos[0].id, 'p3');
  assert.equal(marcos[0].is_foreign, false);
  assert.deepEqual(marcos[0].linked_trees, ['Ramo di Torino']);
});

test('i campi mancanti nell’albero di casa vengono completati dal ramo', () => {
  const result = mergeLinkedTrees({ homeTreeId: 'T1', trees: [mainTree, branchTree], links: [link] });
  const marco = result.people.find(person => person.id === 'p3');

  assert.equal(marco.birth_date, '1935');
  assert.equal(marco.birth_place, 'Torino');
});

test('le unioni del ramo sono riscritte sull’id canonico', () => {
  const result = mergeLinkedTrees({ homeTreeId: 'T1', trees: [mainTree, branchTree], links: [link] });
  const branchUnion = result.unions.find(union => union.children_ids.includes('b3'));

  assert.ok(branchUnion, 'unione del ramo assente');
  assert.equal(branchUnion.partner1_id, 'p3');
  assert.equal(branchUnion.partner2_id, 'b2');
});

test('i nodi provenienti da altri alberi sono marcati come esterni', () => {
  const result = mergeLinkedTrees({ homeTreeId: 'T1', trees: [mainTree, branchTree], links: [link] });

  assert.deepEqual([...result.foreignPersonIds].sort(), ['b2', 'b3']);
  const elena = result.people.find(person => person.id === 'b2');
  assert.equal(elena.is_foreign, true);
  assert.equal(elena.origin_tree_name, 'Ramo di Torino');
});

test('aprendo il ramo, il canonico diventa la persona del ramo', () => {
  const result = mergeLinkedTrees({ homeTreeId: 'T2', trees: [mainTree, branchTree], links: [link] });
  const marco = result.people.find(person => person.first_name === 'Marco');

  assert.equal(marco.id, 'b1');
  assert.equal(marco.is_foreign, false);
  assert.ok(result.foreignPersonIds.has('p1'), 'i nonni devono risultare esterni');
});

test('due rami che si agganciano alla stessa persona convergono su un unico nodo', () => {
  const secondBranch = {
    id: 'T3',
    name: 'Ramo di Napoli',
    people: [
      { id: 'c1', first_name: 'Marco', last_name: 'Rossi' },
      { id: 'c2', first_name: 'Nino', last_name: 'Rossi' }
    ],
    unions: [{ id: 'u3', partner1_id: 'c1', partner2_id: null, children_ids: ['c2'] }]
  };
  const secondLink = {
    id: 'l2',
    source_tree_id: 'T3',
    source_person_id: 'c1',
    target_tree_id: 'T1',
    target_person_id: 'p3',
    status: 'approved'
  };

  const result = mergeLinkedTrees({
    homeTreeId: 'T1',
    trees: [mainTree, branchTree, secondBranch],
    links: [link, secondLink]
  });

  assert.equal(result.people.filter(person => person.first_name === 'Marco').length, 1);
  const marco = result.people.find(person => person.id === 'p3');
  assert.deepEqual(marco.linked_trees.sort(), ['Ramo di Napoli', 'Ramo di Torino']);
  // Nino resta figlio del nodo canonico
  const napoliUnion = result.unions.find(union => union.children_ids.includes('c2'));
  assert.equal(napoliUnion.partner1_id, 'p3');
});

test('i collegamenti verso alberi non caricati vengono ignorati senza rompere il grafo', () => {
  const orphanLink = {
    id: 'l3',
    source_tree_id: 'T9',
    source_person_id: 'x1',
    target_tree_id: 'T1',
    target_person_id: 'p1',
    status: 'approved'
  };

  const result = mergeLinkedTrees({ homeTreeId: 'T1', trees: [mainTree], links: [orphanLink] });
  assert.equal(result.people.length, 3);
  assert.equal(result.stats.linksSkipped, 1);
});

test('nessun innesto restituisce l’albero immutato', () => {
  const result = mergeLinkedTrees({ homeTreeId: 'T1', trees: [mainTree], links: [] });

  assert.equal(result.people.length, 3);
  assert.equal(result.unions.length, 1);
  assert.equal(result.foreignPersonIds.size, 0);
});

test('collectLinkedTreeIds attraversa i rami dei rami entro il limite di salti', () => {
  const links = [
    { source_tree_id: 'T2', target_tree_id: 'T1', status: 'approved' },
    { source_tree_id: 'T3', target_tree_id: 'T2', status: 'approved' },
    { source_tree_id: 'T4', target_tree_id: 'T3', status: 'approved' },
    { source_tree_id: 'T8', target_tree_id: 'T1', status: 'pending' }
  ];

  assert.deepEqual(collectLinkedTreeIds('T1', links, 1).sort(), ['T2']);
  assert.deepEqual(collectLinkedTreeIds('T1', links, 2).sort(), ['T2', 'T3']);
  assert.deepEqual(collectLinkedTreeIds('T1', links, 3).sort(), ['T2', 'T3', 'T4']);
  // Gli innesti non approvati non vengono seguiti
  assert.equal(collectLinkedTreeIds('T1', links, 3).includes('T8'), false);
});

test('un innesto non crea un individuo figlio di sé stesso', () => {
  const weirdBranch = {
    id: 'T5',
    name: 'Ramo anomalo',
    people: [{ id: 'w1', first_name: 'Marco', last_name: 'Rossi' }],
    unions: [{ id: 'u5', partner1_id: 'w1', partner2_id: null, children_ids: ['w1'] }]
  };
  const weirdLink = {
    id: 'l5',
    source_tree_id: 'T5',
    source_person_id: 'w1',
    target_tree_id: 'T1',
    target_person_id: 'p3',
    status: 'approved'
  };

  const result = mergeLinkedTrees({ homeTreeId: 'T1', trees: [mainTree, weirdBranch], links: [weirdLink] });
  result.unions.forEach(union => {
    assert.equal(union.children_ids.includes(union.partner1_id), false);
  });
});
