import { unzipSync } from 'fflate';

/**
 * Genera un UUID v4 per compatibilità sia in locale che con Supabase
 */
export function generateUUID() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Estrae nome e cognome da una stringa di testo
 */
function parseName(nameStr) {
  if (!nameStr) return { firstName: 'Sconosciuto', lastName: '' };

  const cleanName = nameStr
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    // rimuove separatori/punteggiatura pendenti a inizio o fine ("Mario Rossi -" -> "Mario Rossi")
    .replace(/^[\s\-–—+&=|,.:;]+/, '')
    .replace(/[\s\-–—+&=|,.:;]+$/, '')
    .trim();

  if (!cleanName) return { firstName: 'Sconosciuto', lastName: '' };

  if (cleanName.includes(',')) {
    const parts = cleanName.split(',');
    return {
      lastName: parts[0].trim(),
      firstName: parts[1].trim()
    };
  }

  const parts = cleanName.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  const lastName = parts.pop();
  const firstName = parts.join(' ');
  return { firstName, lastName };
}

/**
 * Rileva genere da nome
 */
function detectGenderFromName(firstName) {
  if (!firstName) return 'M';
  const lower = firstName.toLowerCase();

  // Maschili
  if (/\b(mario|mari|giuseppe|giuse|luigi|luig|paolo|paol|vittorio|vittor|amando|amand|adamo|adalindo|adalind|germano|german|silvano|silvan|riccardo|riccard|fabio|fabi|andrea|andre|manfredo|manfr|stella)\b/.test(lower)) return 'M';

  // Femminili
  if (/\b(maria|maria|anna|ann|vittoria|vittor|alice|alessia|aless|giulia|giuli|laura|laur|elena|elen|valentina|valent|giorgia|giorg|sara|sarah|lisa|elisa|elis|emilia|emili|chiara|chiar|francesca|frances|martina|martin|beatrice|beatr|alessandra|alessand|simona|simon|nadia|nativ|teresa|teres|natalina|nativ|liliana|lilian|rosa|ros|eve|evelyn)\b/.test(lower)) return 'F';

  // Default basato sul suffisso
  if (lower.endsWith('a')) return 'F';
  if (lower.endsWith('o')) return 'M';
  return 'M';
}

/**
 * Estrae metadati da una stringa con nome e informazioni tra parentesi
 * Es: "Mario Rossi (22/05/1862 - 11/02/1909)"
 * Es: "Mario Rossi (M) [Nato: 1954, Note: Medico]"
 */
function parseMetadata(str) {
  const meta = {
    gender: 'M',
    birthDate: '',
    deathDate: '',
    birthPlace: '',
    illnesses: [],
    notes: ''
  };

  if (!str) return meta;

  // Copia originale per notes
  const originalStr = str;

  // Rileva genere esplicito (M/F tra parentesi)
  const genderMatch = str.match(/\b([MFmf])\b|\b(Maschio|Femmina|Masch|Femm)\b/i);
  if (genderMatch) {
    const g = genderMatch[0].toUpperCase();
    if (g === 'M' || g.includes('MASCH')) meta.gender = 'M';
    else meta.gender = 'F';
  }

  // Estrai informazioni tra parentesi tonde ()
  const parentMatches = str.match(/\((.*?)\)/g);
  if (parentMatches) {
    for (const match of parentMatches) {
      const content = match.slice(1, -1).trim();

      // Rileva date (formati: 22/05/1862, 1862, 22/05/1862 - 11/02/1909, 5-6/11/1928)
      // Data di nascita (prima parte della range o singola)
      const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4})\s*(?:-|\–|–)\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4})?/i;
      const dateMatch = content.match(datePattern);

      if (dateMatch) {
        meta.birthDate = dateMatch[1];
        if (dateMatch[2]) {
          meta.deathDate = dateMatch[2];
        }
      } else if (/^\d{4}$/.test(content) && !dateMatch) {
        // Solo anno
        meta.birthDate = content;
      }

      // Se non c'è una data valida ma c'è un anno, potrebbe essere solo birth
      if (!meta.birthDate && /(\d{4})/.test(content)) {
        const yearMatch = content.match(/(\d{4})/);
        if (yearMatch) {
          meta.birthDate = yearMatch[1];
        }
      }
    }
  }

  // Rileva informazioni tra parentesi quadre []
  const bracketMatches = str.match(/\[(.*?)\]/g);
  if (bracketMatches) {
    for (const match of bracketMatches) {
      const content = match.slice(1, -1);
      const parts = content.split(/,|;/);

      parts.forEach(part => {
        const keyValue = part.split(':');
        if (keyValue.length >= 2) {
          const key = keyValue[0].trim().toLowerCase();
          const val = keyValue.slice(1).join(':').trim();

          if (key.includes('nat') || key.includes('nascita') || key.includes('birth') || key === 'n') {
            meta.birthDate = val;
          } else if (key.includes('mort') || key.includes('decesso') || key.includes('death') || key === 'm') {
            meta.deathDate = val;
          } else if (key.includes('luogo') || key.includes('place') || key.includes('città') || key.includes('citta')) {
            meta.birthPlace = val;
          } else if (key.includes('malatt') || key.includes('patolog') || key.includes('ill') || key.includes('salute')) {
            const illnessNames = val.split('+');
            illnessNames.forEach(ill => {
              let name = ill.trim();
              let severity = 'lieve';

              if (name.toLowerCase().includes('grave')) severity = 'grave';
              else if (name.toLowerCase().includes('moderat')) severity = 'moderata';

              name = name.replace(/\b(grave|lieve|moderata|moderato)\b/gi, '').trim();
              if (name) {
                meta.illnesses.push({ name, notes: '', severity });
              }
            });
          } else if (key.includes('note') || key.includes('info')) {
            meta.notes = val;
          }
        } else {
          const text = part.trim();
          if (/^\d{4}$/.test(text) && !meta.birthDate) {
            meta.birthDate = text;
          } else if (/^\d{4}-\d{4}$/.test(text)) {
            const years = text.split('-');
            meta.birthDate = years[0];
            meta.deathDate = years[1];
          }
        }
      });
    }
  }

  // Se non trovato genere esplicito, rileva da nome
  if (meta.gender === 'M') {
    const { firstName } = parseName(str);
    meta.gender = detectGenderFromName(firstName);
  }

  // Estrai note (tutto ciò che non è data o metadati)
  let notesStr = originalStr;
  // Rimuovi date tra parentesi
  notesStr = notesStr.replace(/\([^)]*\)/g, '');
  // Rimuovi metadati tra parentesi quadre
  notesStr = notesStr.replace(/\[.*?\]/g, '');
  notesStr = notesStr.trim();

  if (notesStr && !notesStr.match(/^\s*$/) && meta.notes) {
    meta.notes = notesStr;
  }

  return meta;
}

/**
 * Sostituisce il contenuto di parentesi tonde e quadre con dei segnaposto della stessa
 * lunghezza. Serve a cercare i separatori di coppia SOLO nel testo "reale", ignorando
 * trattini che fanno parte di date come "(22/05/1862 - 11/02/1909)" o "(1920-1990)".
 * Gli indici restano allineati alla stringa originale.
 */
function maskBracketed(text) {
  const chars = text.split('');
  let depthRound = 0;
  let depthSquare = 0;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '(') { depthRound++; chars[i] = ''; continue; }
    if (c === '[') { depthSquare++; chars[i] = ''; continue; }
    if (c === ')') { if (depthRound > 0) depthRound--; chars[i] = ''; continue; }
    if (c === ']') { if (depthSquare > 0) depthSquare--; chars[i] = ''; continue; }
    if (depthRound > 0 || depthSquare > 0) chars[i] = '';
  }

  return chars.join('');
}

const hasLetters = (s) => /[\p{L}]/u.test(s || '');

/**
 * Converte i metadati (camelCase) nei campi usati dal database/app (snake_case).
 * Senza questa conversione le date estratte dall'import venivano perse.
 */
function metaToPersonFields(meta) {
  return {
    gender: meta.gender || 'M',
    birth_date: meta.birthDate || '',
    death_date: meta.deathDate || '',
    birth_place: meta.birthPlace || '',
    illnesses: meta.illnesses || [],
    notes: meta.notes || ''
  };
}

/**
 * Trova il separatore di coppia nel testo, ignorando ciò che sta tra parentesi.
 * Ritorna { index, length } oppure null.
 */
function findPartnerSeparator(text) {
  const masked = maskBracketed(text);

  // 1. Separatori espliciti (simboli e parole chiave). Vince quello che compare per primo.
  const explicitPatterns = [
    /\s*[+&=]\s*/,
    /\s+(?:sposato con|sposata con|coniugato con|coniugata con|in sposa a|married to)\s+/i,
    /\s+(?:e|ed|and|m\.)\s+/i,
    /\s*\|\s*/
  ];

  let best = null;
  for (const re of explicitPatterns) {
    const m = masked.match(re);
    if (m && (best === null || m.index < best.index)) {
      best = { index: m.index, length: m[0].length };
    }
  }

  // 2. Trattino usato come separatore: deve essere isolato da spazi (" - ", " – ", " — ")
  //    così da non spezzare cognomi/nomi composti tipo "Jean-Pierre" o "De-Rossi".
  const dashMatch = masked.match(/\s+[-–—]+\s+/);
  if (dashMatch && (best === null || dashMatch.index < best.index)) {
    best = { index: dashMatch.index, length: dashMatch[0].length };
  }

  if (!best) return null;

  // Entrambe le parti devono contenere un nome vero
  const left = text.substring(0, best.index).trim();
  const right = text.substring(best.index + best.length).trim();
  if (!hasLetters(left.replace(/[([].*?[)\]]/g, '')) || !hasLetters(right.replace(/[([].*?[)\]]/g, ''))) {
    return null;
  }

  return best;
}

/**
 * Parsea una singola riga o nodo che può contenere una coppia
 * (separata da +, &, =, " e ", " sposato con ", " - " ecc.)
 */
function parseNodeContent(text, treeId, extraNotes = '') {
  if (!text) return null;

  const separator = findPartnerSeparator(text);

  if (separator) {
    const part1 = text.substring(0, separator.index).trim();
    const part2 = text.substring(separator.index + separator.length).trim();

    const meta1 = parseMetadata(part1);
    const name1 = parseName(part1);
    if (extraNotes) meta1.notes = meta1.notes ? `${meta1.notes} | ${extraNotes}` : extraNotes;

    const p1 = {
      id: generateUUID(),
      tree_id: treeId,
      first_name: name1.firstName,
      last_name: name1.lastName,
      ...metaToPersonFields(meta1)
    };

    const meta2 = parseMetadata(part2);
    const name2 = parseName(part2);
    if (extraNotes) meta2.notes = meta2.notes ? `${meta2.notes} | ${extraNotes}` : extraNotes;

    // Se il genere del partner 2 non è esplicito, usiamo l'opposto del partner 1
    if (meta2.gender === 'M' && meta1.gender === 'M') meta2.gender = 'F';
    else if (meta2.gender === 'F' && meta1.gender === 'F') meta2.gender = 'M';

    const p2 = {
      id: generateUUID(),
      tree_id: treeId,
      first_name: name2.firstName,
      last_name: name2.lastName || name1.lastName,
      ...metaToPersonFields(meta2)
    };

    return {
      type: 'couple',
      partner1: p1,
      partner2: p2
    };
  } else {
    const meta = parseMetadata(text);
    const name = parseName(text);
    if (extraNotes) meta.notes = meta.notes ? `${meta.notes} | ${extraNotes}` : extraNotes;

    const p = {
      id: generateUUID(),
      tree_id: treeId,
      first_name: name.firstName,
      last_name: name.lastName,
      ...metaToPersonFields(meta)
    };
    return {
      type: 'single',
      person: p
    };
  }
}

/**
 * Parser per file .xmind (ZIP che contiene content.json)
 * Gestisce multi-sheet, note, etichette, argomenti staccati e callout.
 */
export async function parseXMindFile(fileBuffer, treeId) {
  const decompressed = unzipSync(new Uint8Array(fileBuffer));

  let contentJsonText = '';

  if (decompressed['content.json']) {
    contentJsonText = new TextDecoder().decode(decompressed['content.json']);
  } else if (decompressed['manifest.json']) {
    const jsonKeys = Object.keys(decompressed).filter(k => k.endsWith('.json') && !k.includes('manifest') && !k.includes('metadata'));
    if (jsonKeys.length > 0) {
      contentJsonText = new TextDecoder().decode(decompressed[jsonKeys[0]]);
    }
  } else if (decompressed['content.xml']) {
    const xmlText = new TextDecoder().decode(decompressed['content.xml']);
    return parseXMindXML(xmlText, treeId);
  }

  if (!contentJsonText) {
    throw new Error('Nessun file content.json o content.xml valido trovato nel file .xmind');
  }

  const data = JSON.parse(contentJsonText);
  const sheets = Array.isArray(data) ? data : [data];

  const people = [];
  const unions = [];

  sheets.forEach(sheet => {
    const rootTopic = sheet.rootTopic;
    if (!rootTopic) return;

    function traverseTopic(topic, parentUnionId = null) {
      const title = topic.title || '';
      if (!title.trim()) return;

      // Estrai eventuali note (plain text o html)
      let notesText = '';
      if (topic.notes) {
        if (topic.notes.plain) notesText = topic.notes.plain.content || '';
        else if (topic.notes.realhtml) notesText = (topic.notes.realhtml.content || '').replace(/<[^>]+>/g, '');
      }

      // Estrai etichette
      let labelsText = '';
      if (Array.isArray(topic.labels) && topic.labels.length > 0) {
        labelsText = `Etichette: ${topic.labels.join(', ')}`;
      }

      const extraNotes = [notesText, labelsText].filter(Boolean).join(' | ');

      const parsedNode = parseNodeContent(title, treeId, extraNotes);
      if (!parsedNode) return;

      let activeUnionId = null;

      if (parsedNode.type === 'couple') {
        const { partner1, partner2 } = parsedNode;
        people.push(partner1, partner2);

        const union = {
          id: generateUUID(),
          tree_id: treeId,
          partner1_id: partner1.id,
          partner2_id: partner2.id,
          children_ids: [],
          type: 'relationship'
        };
        unions.push(union);
        activeUnionId = union.id;

        if (parentUnionId) {
          const pUnion = unions.find(u => u.id === parentUnionId);
          if (pUnion) pUnion.children_ids.push(partner1.id);
        }
      } else {
        const { person } = parsedNode;
        people.push(person);

        const union = {
          id: generateUUID(),
          tree_id: treeId,
          partner1_id: person.id,
          partner2_id: null,
          children_ids: [],
          type: 'relationship'
        };
        unions.push(union);
        activeUnionId = union.id;

        if (parentUnionId) {
          const pUnion = unions.find(u => u.id === parentUnionId);
          if (pUnion) pUnion.children_ids.push(person.id);
        }
      }

      // Ricorsione su figli collegati (attached) e staccati/fluttuanti (detached)
      const childrenAttached = topic.children && topic.children.attached;
      if (Array.isArray(childrenAttached)) {
        childrenAttached.forEach(childTopic => {
          traverseTopic(childTopic, activeUnionId);
        });
      }

      const childrenDetached = topic.children && topic.children.detached;
      if (Array.isArray(childrenDetached)) {
        childrenDetached.forEach(childTopic => {
          traverseTopic(childTopic, null);
        });
      }
    }

    traverseTopic(rootTopic);
  });

  const cleanedUnions = unions.filter(u => u.partner2_id !== null || u.children_ids.length > 0);

  return { people, unions: cleanedUnions };
}

/**
 * 1. Parser per copia-incolla di testo strutturato (Outline)
 * Riconosce la gerarchia in base all'indentazione (spazi o tab)
 */
export function parseTextOutline(text, treeId) {
  const lines = text.split(/\r?\n/);
  const people = [];
  const unions = [];

  const stack = [];

  lines.forEach((line) => {
    if (!line.trim()) return;

    const indentMatch = line.match(/^([ \t]*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const depth = indent.replace(/\t/g, '    ').length;

    const content = line.trim().replace(/^[-*+•]\s+/, '');
    if (!content) return;

    const parsedNode = parseNodeContent(content, treeId);
    if (!parsedNode) return;

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    let parentUnionId = null;
    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      parentUnionId = parent.unionId;
    }

    if (parsedNode.type === 'couple') {
      const { partner1, partner2 } = parsedNode;
      people.push(partner1, partner2);

      const union = {
        id: generateUUID(),
        tree_id: treeId,
        partner1_id: partner1.id,
        partner2_id: partner2.id,
        children_ids: [],
        type: 'relationship'
      };
      unions.push(union);

      if (parentUnionId) {
        const pUnion = unions.find(u => u.id === parentUnionId);
        if (pUnion) {
          pUnion.children_ids.push(partner1.id);
        }
      }

      stack.push({
        depth,
        personId: partner1.id,
        unionId: union.id
      });
    } else {
      const { person } = parsedNode;
      people.push(person);

      const union = {
        id: generateUUID(),
        tree_id: treeId,
        partner1_id: person.id,
        partner2_id: null,
        children_ids: [],
        type: 'relationship'
      };
      unions.push(union);

      if (parentUnionId) {
        const pUnion = unions.find(u => u.id === parentUnionId);
        if (pUnion) {
          pUnion.children_ids.push(person.id);
        }
      }

      stack.push({
        depth,
        personId: person.id,
        unionId: union.id
      });
    }
  });

  const cleanedUnions = unions.filter(u => u.partner2_id !== null || u.children_ids.length > 0);

  return { people, unions: cleanedUnions };
}

/**
 * Parser di fallback per XML (vecchio XMind 8)
 */
function parseXMindXML(xmlText, treeId) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  const rootTopicElement = xmlDoc.querySelector('sheet > topic');
  if (!rootTopicElement) {
    throw new Error('Nessun topic radice trovato nel file XML di XMind');
  }

  const people = [];
  const unions = [];

  function traverseXMLElement(topicEl, parentUnionId = null) {
    const titleEl = topicEl.querySelector('> title');
    const title = titleEl ? titleEl.textContent : '';
    if (!title.trim()) return;

    const parsedNode = parseNodeContent(title, treeId);
    if (!parsedNode) return;

    let activeUnionId = null;

    if (parsedNode.type === 'couple') {
      const { partner1, partner2 } = parsedNode;
      people.push(partner1, partner2);

      const union = {
        id: generateUUID(),
        tree_id: treeId,
        partner1_id: partner1.id,
        partner2_id: partner2.id,
        children_ids: [],
        type: 'relationship'
      };
      unions.push(union);
      activeUnionId = union.id;

      if (parentUnionId) {
        const pUnion = unions.find(u => u.id === parentUnionId);
        if (pUnion) pUnion.children_ids.push(partner1.id);
      }
    } else {
      const { person } = parsedNode;
      people.push(person);

      const union = {
        id: generateUUID(),
        tree_id: treeId,
        partner1_id: person.id,
        partner2_id: null,
        children_ids: [],
        type: 'relationship'
      };
      unions.push(union);
      activeUnionId = union.id;

      if (parentUnionId) {
        const pUnion = unions.find(u => u.id === parentUnionId);
        if (pUnion) pUnion.children_ids.push(person.id);
      }
    }

    const childrenEl = topicEl.querySelector('> children > topics');
    if (childrenEl) {
      const childTopics = childrenEl.querySelectorAll('> topic');
      childTopics.forEach(childEl => {
        traverseXMLElement(childEl, activeUnionId);
      });
    }
  }

  traverseXMLElement(rootTopicElement);

  const cleanedUnions = unions.filter(u => u.partner2_id !== null || u.children_ids.length > 0);

  return { people, unions: cleanedUnions };
}
