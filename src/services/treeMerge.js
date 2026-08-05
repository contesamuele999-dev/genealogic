/**
 * treeMerge.js
 *
 * Fusione di più alberi genealogici collegati da "innesti" (tree_links).
 *
 * Un innesto dichiara che la persona A dell'albero X e la persona B dell'albero Y sono
 * la stessa persona reale. Gli alberi restano documenti distinti e di proprietà diversa:
 * qui li si combina soltanto per il DISEGNO, producendo un grafo unico in cui ogni
 * individuo compare una volta sola.
 *
 * Regole:
 * - l'albero "di casa" (homeTreeId) è quello che l'utente sta consultando e vince
 *   sempre come rappresentante canonico di una persona condivisa;
 * - i nodi provenienti da altri alberi sono marcati `isForeign` e sono in sola lettura;
 * - i campi vuoti della persona canonica vengono completati con quelli dell'alias
 *   (se il ramo conosce la data di nascita e l'albero principale no, la mostriamo).
 *
 * Il modulo è puro: nessuna dipendenza da rete o da React, quindi è testabile.
 */

// Campi anagrafici che possono essere completati a partire da un alias.
const FILLABLE_FIELDS = ['birth_date', 'death_date', 'birth_place', 'gender', 'avatar_url'];

function isEmptyValue(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

/**
 * Union-Find con radice forzabile: serve a garantire che il rappresentante di un
 * gruppo di alias sia sempre la persona dell'albero di casa, quando esiste.
 */
function createUnionFind() {
  const parent = new Map();

  function find(id) {
    if (!parent.has(id)) {
      parent.set(id, id);
      return id;
    }
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    // Compressione del cammino
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor);
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  function union(a, b) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  }

  return { find, union, parent };
}

/**
 * Unisce più alberi in un unico grafo di persone e unioni.
 *
 * @param {object} params
 * @param {string} params.homeTreeId          albero attualmente aperto
 * @param {Array}  params.trees               [{ id, name, people, unions }]
 * @param {Array}  params.links               innesti approvati [{ source_person_id, target_person_id, ... }]
 * @returns {{ people: Array, unions: Array, foreignPersonIds: Set, aliasByPersonId: Map, stats: object }}
 */
export function mergeLinkedTrees({ homeTreeId, trees = [], links = [] }) {
  const treeById = new Map(trees.map(tree => [tree.id, tree]));

  // 1. Indice di tutte le persone di tutti gli alberi coinvolti.
  const personById = new Map();
  trees.forEach(tree => {
    (tree.people || []).forEach(person => {
      personById.set(person.id, { person, treeId: tree.id });
    });
  });

  // 2. Raggruppa gli alias con union-find, ignorando i collegamenti verso persone
  //    che non sono state caricate (albero non visibile, dati parziali...).
  const uf = createUnionFind();
  const usableLinks = links.filter(link =>
    personById.has(link.source_person_id) && personById.has(link.target_person_id)
  );
  usableLinks.forEach(link => {
    uf.union(link.source_person_id, link.target_person_id);
  });

  // 3. Scegli il rappresentante canonico di ogni gruppo: prima l'albero di casa,
  //    altrimenti l'id più basso per avere un risultato deterministico.
  const membersByRoot = new Map();
  personById.forEach((entry, id) => {
    const root = uf.find(id);
    if (!membersByRoot.has(root)) membersByRoot.set(root, []);
    membersByRoot.get(root).push(id);
  });

  const canonicalByPersonId = new Map();
  const aliasByPersonId = new Map();

  membersByRoot.forEach(members => {
    const sorted = [...members].sort((a, b) => {
      const aHome = personById.get(a).treeId === homeTreeId ? 0 : 1;
      const bHome = personById.get(b).treeId === homeTreeId ? 0 : 1;
      if (aHome !== bHome) return aHome - bHome;
      return a.localeCompare(b);
    });

    const canonicalId = sorted[0];
    members.forEach(id => canonicalByPersonId.set(id, canonicalId));
    if (sorted.length > 1) {
      aliasByPersonId.set(canonicalId, sorted.slice(1).map(id => ({
        personId: id,
        treeId: personById.get(id).treeId,
        treeName: treeById.get(personById.get(id).treeId)?.name || ''
      })));
    }
  });

  const resolve = (id) => (id ? canonicalByPersonId.get(id) || id : id);

  // 4. Costruisci le persone finali, completando i campi mancanti dagli alias.
  const people = [];
  const foreignPersonIds = new Set();

  membersByRoot.forEach(members => {
    const canonicalId = canonicalByPersonId.get(members[0]);
    const { person: base, treeId } = personById.get(canonicalId);

    const merged = { ...base };
    const aliases = aliasByPersonId.get(canonicalId) || [];

    aliases.forEach(({ personId }) => {
      const other = personById.get(personId).person;
      FILLABLE_FIELDS.forEach(field => {
        if (isEmptyValue(merged[field]) && !isEmptyValue(other[field])) {
          merged[field] = other[field];
        }
      });
    });

    const isForeign = treeId !== homeTreeId;
    merged.origin_tree_id = treeId;
    merged.origin_tree_name = treeById.get(treeId)?.name || '';
    merged.is_foreign = isForeign;
    // Una persona condivisa appartiene all'albero di casa ma esiste anche altrove.
    merged.linked_trees = aliases.map(alias => alias.treeName).filter(Boolean);
    merged.alias_person_ids = aliases.map(alias => alias.personId);

    if (isForeign) foreignPersonIds.add(canonicalId);
    people.push(merged);
  });

  // 5. Riscrivi le unioni sugli id canonici ed elimina i duplicati generati dalla fusione.
  const unions = [];
  const seenUnionSignatures = new Set();

  trees.forEach(tree => {
    (tree.unions || []).forEach(union => {
      const partner1 = resolve(union.partner1_id);
      const partner2 = resolve(union.partner2_id);
      const children = Array.from(new Set((union.children_ids || []).map(resolve)))
        // Una persona non può essere figlia di sé stessa dopo la fusione degli alias.
        .filter(childId => childId && childId !== partner1 && childId !== partner2);

      if (!partner1 && !partner2) return;

      // Firma indipendente dall'ordine dei partner
      const partnerKey = [partner1 || '', partner2 || ''].sort().join('~');
      const signature = `${partnerKey}|${[...children].sort().join(',')}`;

      if (seenUnionSignatures.has(signature)) return;

      // Se esiste già un'unione con gli stessi partner, fondi gli elenchi di figli:
      // il ramo aggiunge i propri discendenti a una coppia già presente.
      const existing = unions.find(candidate => candidate.partner_key === partnerKey);
      if (existing) {
        const before = existing.children_ids.length;
        children.forEach(childId => {
          if (!existing.children_ids.includes(childId)) existing.children_ids.push(childId);
        });
        if (existing.children_ids.length !== before) {
          existing.origin_tree_ids = Array.from(new Set([...existing.origin_tree_ids, tree.id]));
        }
        return;
      }

      seenUnionSignatures.add(signature);
      unions.push({
        ...union,
        id: union.id,
        partner1_id: partner1 || null,
        partner2_id: partner2 || null,
        children_ids: children,
        partner_key: partnerKey,
        origin_tree_ids: [tree.id],
        is_foreign: tree.id !== homeTreeId
      });
    });
  });

  return {
    people,
    unions,
    foreignPersonIds,
    aliasByPersonId,
    stats: {
      treesMerged: trees.length,
      linksApplied: usableLinks.length,
      linksSkipped: links.length - usableLinks.length,
      foreignPeople: foreignPersonIds.size,
      totalPeople: people.length
    }
  };
}

/**
 * A partire dall'albero di casa, individua tutti gli alberi raggiungibili tramite
 * innesti approvati, entro un numero massimo di salti (un ramo di un ramo è ammesso).
 * Restituisce gli id degli alberi da caricare, escluso quello di casa.
 */
export function collectLinkedTreeIds(homeTreeId, links = [], maxHops = 3) {
  const neighbours = new Map();

  const addEdge = (from, to) => {
    if (!neighbours.has(from)) neighbours.set(from, new Set());
    neighbours.get(from).add(to);
  };

  links.forEach(link => {
    if (link.status && link.status !== 'approved') return;
    addEdge(link.source_tree_id, link.target_tree_id);
    addEdge(link.target_tree_id, link.source_tree_id);
  });

  const visited = new Set([homeTreeId]);
  let frontier = [homeTreeId];

  for (let hop = 0; hop < maxHops; hop++) {
    const next = [];
    frontier.forEach(treeId => {
      (neighbours.get(treeId) || new Set()).forEach(neighbour => {
        if (visited.has(neighbour)) return;
        visited.add(neighbour);
        next.push(neighbour);
      });
    });
    if (next.length === 0) break;
    frontier = next;
  }

  visited.delete(homeTreeId);
  return Array.from(visited);
}
