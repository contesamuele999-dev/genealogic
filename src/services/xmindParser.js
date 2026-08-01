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

  const cleanName = nameStr.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

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
 * Parsea una singola riga o nodo che può contenere una coppia separata da '+' o '&' o '-'
 */
function parseNodeContent(text, treeId) {
  if (!text) return null;

  // Riconosce coppie separate da +, & o -
  // Nota: il separatore '-' deve essere l'ultimo controllo perché potrebbe essere parte di un nome
  let partnerSeparator = text.includes('+') ? '+' : (text.includes('&') ? '&' : null);

  // Se non c'è + o &, prova con '-' ma assicurati che sia un separatore tra due nomi completi
  if (!partnerSeparator && text.includes('-')) {
    // Verifica che '-' non sia dentro una data tra parentesi
    const parts = text.split('-');
    if (parts.length >= 2) {
      // Controllo che ci sia almeno un carattere dopo l'ultima '-' fuori dalle parentesi
      const lastPart = parts[parts.length - 1].trim();
      const hasContentAfterLastDash = lastPart.length > 0 && !lastPart.startsWith('(');

      // Se il contenuto dopo l'ultimo trattino ha senso (più di 2 caratteri, non è una data), è una coppia
      if (hasContentAfterLastDash && !text.match(/\(\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}\)/)) {
        partnerSeparator = '-';
      }
    }
  }

  if (partnerSeparator) {
    const parts = text.split(partnerSeparator);
    const part1 = parts[0].trim();
    const part2 = parts[1].trim();

    const meta1 = parseMetadata(part1);
    const name1 = parseName(part1);
    const p1 = {
      id: generateUUID(),
      tree_id: treeId,
      first_name: name1.firstName,
      last_name: name1.lastName,
      ...meta1
    };

    const meta2 = parseMetadata(part2);
    const name2 = parseName(part2);
    // Se il genere del partner 2 non è esplicito, usiamo l'opposto del partner 1
    if (meta2.gender === 'M' && meta1.gender === 'M') meta2.gender = 'F';
    else if (meta2.gender === 'F' && meta1.gender === 'F') meta2.gender = 'M';

    const p2 = {
      id: generateUUID(),
      tree_id: treeId,
      first_name: name2.firstName,
      last_name: name2.lastName || name1.lastName,
      ...meta2
    };

    return {
      type: 'couple',
      partner1: p1,
      partner2: p2
    };
  } else {
    const meta = parseMetadata(text);
    const name = parseName(text);
    const p = {
      id: generateUUID(),
      tree_id: treeId,
      first_name: name.firstName,
      last_name: name.lastName,
      ...meta
    };
    return {
      type: 'single',
      person: p
    };
  }
}

/**
 * Parser per file .xmind (ZIP che contiene content.json)
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
  const rootSheet = Array.isArray(data) ? data[0] : data;
  const rootTopic = rootSheet.rootTopic;

  if (!rootTopic) {
    throw new Error('Nessun topic radice trovato nella mappa mentale');
  }

  const people = [];
  const unions = [];

  function traverseTopic(topic, parentUnionId = null) {
    const title = topic.title || '';
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

    // Ricorsione sui figli
    const childrenAttached = topic.children && topic.children.attached;
    if (Array.isArray(childrenAttached)) {
      childrenAttached.forEach(childTopic => {
        traverseTopic(childTopic, activeUnionId);
      });
    }
  }

  traverseTopic(rootTopic);

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
