import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize, RefreshCw, Trash2 } from 'lucide-react';
import NodeCard from './NodeCard';

// Dimensioni di layout
const CARD_WIDTH = 190;
const CARD_HEIGHT = 80;
const HORIZONTAL_GAP = 60;
const VERTICAL_GAP = 120;
const HORIZONTAL_GENERATION_GAP = 280;

const LAYOUT_OPTIONS = [
  { value: 'organigram', label: 'Organigramma' },
  { value: 'horizontal', label: 'Albero verso destra' },
  { value: 'conceptual', label: 'Mappa concettuale' },
  { value: 'table', label: 'Vista tabellare' }
];

function getConceptualViewport(layoutPositions, viewportWidth, viewportHeight) {
  const values = Object.values(layoutPositions);
  if (values.length === 0) {
    return { zoom: 0.75, pan: { x: viewportWidth / 2, y: viewportHeight / 2 } };
  }

  const minX = Math.min(...values.map(position => position.x - CARD_WIDTH / 2));
  const maxX = Math.max(...values.map(position => position.x + CARD_WIDTH / 2));
  const minY = Math.min(...values.map(position => position.y - CARD_HEIGHT / 2));
  const maxY = Math.max(...values.map(position => position.y + CARD_HEIGHT / 2));
  const availableWidth = Math.max(320, viewportWidth - 230);
  const availableHeight = Math.max(240, viewportHeight - 60);
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const zoom = Math.max(0.35, Math.min(0.8, availableWidth / contentWidth, availableHeight / contentHeight));
  const contentCenterX = (minX + maxX) / 2;
  const contentCenterY = (minY + maxY) / 2;

  return {
    zoom,
    pan: {
      x: availableWidth / 2 - contentCenterX * zoom,
      y: viewportHeight / 2 - contentCenterY * zoom
    }
  };
}

export default function GenealogyTree({
  treeId,
  people,
  unions,
  onSelectPerson,
  onAddRelative,
  canEdit,
  highlightedPersonId,
  onDeletePeople,
  // Le informazioni sanitarie hanno una visibilità separata dall'albero ufficiale.
  healthVisible = false
}) {
  const [positions, setPositions] = useState({});
  const [draggedNode, setDraggedNode] = useState(null);
  // Stato del drag corrente (ref: non provoca re-render e non è soggetto a closure stale)
  const dragRef = useRef(null);
  // Memoria posizioni manuali (drag)
  const manualPositionsByModeRef = useRef({ organigram: {} });
  const manualPositionsRef = useRef(manualPositionsByModeRef.current.organigram);
  // Nodi selezionati per multi-select
  const [selectedPeople, setSelectedPeople] = useState(new Set());
  const [layoutMode, setLayoutMode] = useState('organigram');

  // Stati per Pan & Zoom
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [zoom, setZoom] = useState(0.85);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const hasCenteredRef = useRef(false);
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    manualPositionsByModeRef.current = { organigram: {} };
    manualPositionsRef.current = {};
    hasCenteredRef.current = false;
    setSelectedPeople(new Set());
    setPositions({});
  }, [treeId]);

  // Hash per rilevare cambiamenti reali nei dati
  const dataHash = useMemo(() => {
    const pHash = people ? people.map(p => `${p.id}:${p.first_name}:${p.last_name}`).join('|') : '';
    const uHash = unions ? unions.map(u => `${u.id}:${u.partner1_id || ''}:${u.partner2_id || ''}:${u.children_ids?.join(',') || ''}`).join('|') : '';
    return [pHash, uHash].join('||');
  }, [people, unions]);

  const tableRows = useMemo(() => {
    const peopleById = new Map(people.map(person => [person.id, person]));
    const parentsByPerson = new Map(people.map(person => [person.id, new Set()]));
    const partnersByPerson = new Map(people.map(person => [person.id, new Set()]));
    const childrenByPerson = new Map(people.map(person => [person.id, new Set()]));

    unions.forEach(union => {
      if (union.partner1_id && union.partner2_id) {
        partnersByPerson.get(union.partner1_id)?.add(union.partner2_id);
        partnersByPerson.get(union.partner2_id)?.add(union.partner1_id);
      }
      (union.children_ids || []).forEach(childId => {
        if (union.partner1_id) {
          parentsByPerson.get(childId)?.add(union.partner1_id);
          childrenByPerson.get(union.partner1_id)?.add(childId);
        }
        if (union.partner2_id) {
          parentsByPerson.get(childId)?.add(union.partner2_id);
          childrenByPerson.get(union.partner2_id)?.add(childId);
        }
      });
    });

    const generationCache = new Map();
    const getGeneration = (personId, visiting = new Set()) => {
      if (generationCache.has(personId)) return generationCache.get(personId);
      if (visiting.has(personId)) return 0;
      const nextVisiting = new Set(visiting).add(personId);
      const parentIds = [...(parentsByPerson.get(personId) || [])];
      const generation = parentIds.length === 0
        ? 0
        : Math.max(...parentIds.map(parentId => getGeneration(parentId, nextVisiting))) + 1;
      generationCache.set(personId, generation);
      return generation;
    };

    people.forEach(person => getGeneration(person.id));
    let generationsChanged = true;
    let generationIterations = 0;
    while (generationsChanged && generationIterations < Math.max(10, people.length * 2)) {
      generationsChanged = false;
      unions.forEach(union => {
        if (union.partner1_id && union.partner2_id) {
          const coupleGeneration = Math.max(
            generationCache.get(union.partner1_id) || 0,
            generationCache.get(union.partner2_id) || 0
          );
          if ((generationCache.get(union.partner1_id) || 0) !== coupleGeneration) {
            generationCache.set(union.partner1_id, coupleGeneration);
            generationsChanged = true;
          }
          if ((generationCache.get(union.partner2_id) || 0) !== coupleGeneration) {
            generationCache.set(union.partner2_id, coupleGeneration);
            generationsChanged = true;
          }
        }

        const parentGeneration = Math.max(
          generationCache.get(union.partner1_id) || 0,
          generationCache.get(union.partner2_id) || 0
        );
        (union.children_ids || []).forEach(childId => {
          if ((generationCache.get(childId) || 0) <= parentGeneration) {
            generationCache.set(childId, parentGeneration + 1);
            generationsChanged = true;
          }
        });
      });
      generationIterations++;
    }

    const formatNames = (ids) => [...ids]
      .map(id => peopleById.get(id))
      .filter(Boolean)
      .map(person => `${person.first_name || ''} ${person.last_name || ''}`.trim())
      .sort((a, b) => a.localeCompare(b, 'it'))
      .join(', ');

    return people
      .map(person => ({
        person,
        generation: generationCache.get(person.id) || 0,
        parents: formatNames(parentsByPerson.get(person.id) || []),
        partners: formatNames(partnersByPerson.get(person.id) || []),
        children: formatNames(childrenByPerson.get(person.id) || [])
      }))
      .sort((a, b) => (
        a.generation - b.generation
        || (a.person.last_name || '').localeCompare(b.person.last_name || '', 'it')
        || (a.person.first_name || '').localeCompare(b.person.first_name || '', 'it')
      ));
  }, [people, unions]);

  // 1. Algoritmo di Auto-Layout Generazionale
  useEffect(() => {
    if (!people || people.length === 0) return;

    // Calcola le generazioni
    const generations = {};
    const visited = new Set();

    // Trova i genitori di ciascuna persona
    const personParents = {};
    people.forEach(p => {
      personParents[p.id] = [];
    });

    unions.forEach(u => {
      const p1 = u.partner1_id;
      const p2 = u.partner2_id;
      if (Array.isArray(u.children_ids)) {
        u.children_ids.forEach(childId => {
          if (personParents[childId]) {
            if (p1) personParents[childId].push(p1);
            if (p2) personParents[childId].push(p2);
          }
        });
      }
    });

    // Calcola la generazione ricorsivamente
    function getGeneration(personId) {
      if (visited.has(personId)) {
        return generations[personId] || 0;
      }
      visited.add(personId);

      const parents = personParents[personId] || [];
      if (parents.length === 0) {
        generations[personId] = 0;
        return 0;
      }

      const parentGens = parents.map(pid => getGeneration(pid));
      const gen = Math.max(...parentGens) + 1;
      generations[personId] = gen;
      return gen;
    }

    // Inizializza
    people.forEach(p => getGeneration(p.id));

    // Uniforma la generazione delle coppie (devono stare sullo stesso livello)
    unions.forEach(u => {
      const p1 = u.partner1_id;
      const p2 = u.partner2_id;
      if (p1 && p2) {
        const g1 = generations[p1] || 0;
        const g2 = generations[p2] || 0;
        const maxG = Math.max(g1, g2);
        generations[p1] = maxG;
        generations[p2] = maxG;
      }
    });

    // Ricalcola i figli dopo l'adeguamento delle coppie
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 10) {
      changed = false;
      unions.forEach(u => {
        const parentGen = Math.max(
          u.partner1_id ? (generations[u.partner1_id] || 0) : 0,
          u.partner2_id ? (generations[u.partner2_id] || 0) : 0
        );
        u.children_ids.forEach(childId => {
          const currentChildGen = generations[childId] || 0;
          if (currentChildGen <= parentGen) {
            generations[childId] = parentGen + 1;
            changed = true;
          }
        });
      });
      iterations++;
    }

    // Raggruppa per generazione
    const genGroups = {};
    people.forEach(p => {
      const g = generations[p.id] || 0;
      if (!genGroups[g]) genGroups[g] = [];
      genGroups[g].push(p.id);
    });

    // Calcola le coordinate X e Y per ciascun nodo
    const newPositions = {};
    // Mappa le unioni per identificare coppie
    const couples = [];
    const singlePeople = new Set(people.map(p => p.id));

    unions.forEach(u => {
      if (u.partner1_id && u.partner2_id) {
        couples.push({ p1: u.partner1_id, p2: u.partner2_id, unionId: u.id });
        singlePeople.delete(u.partner1_id);
        singlePeople.delete(u.partner2_id);
      }
    });

    // La larghezza di un ramo deve includere tutti i discendenti, non soltanto
    // i figli diretti. In caso contrario il successivo centraggio delle famiglie
    // può spostare un sottoalbero dentro quello vicino.
    const branchWidthCache = new Map();
    const getPartnerComponent = (personId) => {
      const component = new Set();
      const queue = [personId];

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || component.has(currentId)) continue;
        component.add(currentId);

        unions.forEach(union => {
          if (union.partner1_id === currentId && union.partner2_id && !component.has(union.partner2_id)) {
            queue.push(union.partner2_id);
          } else if (union.partner2_id === currentId && union.partner1_id && !component.has(union.partner1_id)) {
            queue.push(union.partner1_id);
          }
        });
      }

      return component;
    };

    const getBranchWidth = (personId, visiting = new Set()) => {
      if (branchWidthCache.has(personId)) return branchWidthCache.get(personId);
      if (visiting.has(personId)) return CARD_WIDTH;

      const nextVisiting = new Set(visiting);
      nextVisiting.add(personId);
      const partnerComponent = getPartnerComponent(personId);
      const ownWidth = partnerComponent.size * CARD_WIDTH
        + Math.max(0, partnerComponent.size - 1) * HORIZONTAL_GAP;
      const childIds = new Set();

      unions.forEach(union => {
        const belongsToComponent = partnerComponent.has(union.partner1_id)
          || partnerComponent.has(union.partner2_id);
        if (!belongsToComponent) return;
        (union.children_ids || []).forEach(childId => childIds.add(childId));
      });

      const descendantWidths = [...childIds].map(childId => getBranchWidth(childId, nextVisiting));
      const descendantsWidth = descendantWidths.length > 0
        ? descendantWidths.reduce((total, width) => total + width, 0)
          + (descendantWidths.length - 1) * HORIZONTAL_GAP
        : 0;
      const width = Math.max(ownWidth, descendantsWidth);

      partnerComponent.forEach(componentPersonId => branchWidthCache.set(componentPersonId, width));
      return width;
    };

    // Posiziona i nodi generazione per generazione (raggruppando i fratelli assieme e distanziando i genitori in base allo spazio richiesto dai figli)
    const sortedGenKeys = Object.keys(genGroups).map(Number).sort((a, b) => a - b);

    sortedGenKeys.forEach(gen => {
      const rawPIds = genGroups[gen];

      // Raggruppa i membri della generazione per unione genitoriale comune (fratelli assieme)
      const familyGroups = [];
      const groupMap = new Map();
      const orphanIds = [];

      rawPIds.forEach(pid => {
        const parentUnion = unions.find(u => Array.isArray(u.children_ids) && u.children_ids.includes(pid));
        if (parentUnion) {
          if (!groupMap.has(parentUnion.id)) {
            const groupObj = { parentUnionId: parentUnion.id, parentUnion, pIds: [] };
            groupMap.set(parentUnion.id, groupObj);
            familyGroups.push(groupObj);
          }
          groupMap.get(parentUnion.id).pIds.push(pid);
        } else {
          orphanIds.push(pid);
        }
      });

      // Ordina i gruppi di fratelli in base al baricentro X dei genitori (se già posizionati al livello precedente)
      familyGroups.sort((a, b) => {
        const uA = a.parentUnion;
        const uB = b.parentUnion;
        const p1X_a = uA.partner1_id && newPositions[uA.partner1_id] ? newPositions[uA.partner1_id].x : 0;
        const p2X_a = uA.partner2_id && newPositions[uA.partner2_id] ? newPositions[uA.partner2_id].x : p1X_a;
        const centerA = (p1X_a + p2X_a) / 2;

        const p1X_b = uB.partner1_id && newPositions[uB.partner1_id] ? newPositions[uB.partner1_id].x : 0;
        const p2X_b = uB.partner2_id && newPositions[uB.partner2_id] ? newPositions[uB.partner2_id].x : p1X_b;
        const centerB = (p1X_b + p2X_b) / 2;

        return centerA - centerB;
      });

      // Ricostruisci la lista ordinata di pIds mantenendo i fratelli contigui
      const sortedPIds = [];
      familyGroups.forEach(grp => {
        sortedPIds.push(...grp.pIds);
      });
      sortedPIds.push(...orphanIds);

      // Divide in coppie e singoli in questa generazione (rispettando l'ordine dei fratelli)
      const genElements = [];
      const addedToGen = new Set();

      sortedPIds.forEach(pid => {
        if (addedToGen.has(pid)) return;

        const couple = couples.find(c =>
          (c.p1 === pid && !addedToGen.has(c.p2)) ||
          (c.p2 === pid && !addedToGen.has(c.p1))
        );

        if (couple) {
          const partnerId = couple.p1 === pid ? couple.p2 : couple.p1;
          if (sortedPIds.includes(partnerId) && !addedToGen.has(partnerId)) {
            genElements.push({
              type: 'couple',
              ids: [couple.p1, couple.p2],
              unionId: couple.unionId
            });
            addedToGen.add(couple.p1);
            addedToGen.add(couple.p2);
          } else {
            genElements.push({ type: 'single', id: pid });
            addedToGen.add(pid);
          }
        } else {
          genElements.push({ type: 'single', id: pid });
          addedToGen.add(pid);
        }
      });

      // Riserva a ogni elemento lo spazio richiesto dal suo intero sottoalbero.
      const elementWidths = genElements.map(el => {
        const selfW = el.type === 'couple' ? (CARD_WIDTH * 2 + HORIZONTAL_GAP) : CARD_WIDTH;
        const rootPersonId = el.type === 'couple' ? el.ids[0] : el.id;
        return Math.max(selfW, getBranchWidth(rootPersonId));
      });

      // Calcola larghezza totale occupata da questa generazione considerando lo spazio richiesto dalle sotto-strutture dei figli
      let totalWidth = elementWidths.reduce((a, b) => a + b, 0) + (genElements.length - 1) * HORIZONTAL_GAP;

      // Assegna posizioni X al centro dello spazio riservato (Slot) a ciascun elemento e ai suoi figli
      let currentX = -totalWidth / 2;
      const y = gen * VERTICAL_GAP + 100;

      genElements.forEach((el, index) => {
        const allocatedW = elementWidths[index];
        const slotCenterX = currentX + allocatedW / 2;

        if (el.type === 'couple') {
          newPositions[el.ids[0]] = {
            x: slotCenterX - (CARD_WIDTH + HORIZONTAL_GAP) / 2,
            y
          };
          newPositions[el.ids[1]] = {
            x: slotCenterX + (CARD_WIDTH + HORIZONTAL_GAP) / 2,
            y
          };
          newPositions[`union_${el.unionId}`] = { x: slotCenterX, y };
        } else {
          newPositions[el.id] = {
            x: slotCenterX,
            y
          };
        }

        currentX += allocatedW + HORIZONTAL_GAP;
      });
    });

    // Centra ogni gruppo di figli sotto il punto medio della coppia e sposta
    // con esso l'intero ramo discendente, inclusi gli eventuali partner.
    const unionsByGeneration = [...unions].sort((a, b) => {
      const aGeneration = Math.max(
        generations[a.partner1_id] || 0,
        generations[a.partner2_id] || 0
      );
      const bGeneration = Math.max(
        generations[b.partner1_id] || 0,
        generations[b.partner2_id] || 0
      );
      return aGeneration - bGeneration;
    });

    const collectDescendantBranchIds = (rootPersonId) => {
      const branchIds = new Set();
      const queue = [rootPersonId];

      while (queue.length > 0) {
        const personId = queue.shift();
        if (!personId || branchIds.has(personId)) continue;
        branchIds.add(personId);

        unions.forEach(union => {
          const isPartner = union.partner1_id === personId || union.partner2_id === personId;
          if (!isPartner) return;

          const partnerId = union.partner1_id === personId
            ? union.partner2_id
            : union.partner1_id;
          if (partnerId && !branchIds.has(partnerId)) queue.push(partnerId);
          (union.children_ids || []).forEach(childId => {
            if (!branchIds.has(childId)) queue.push(childId);
          });
        });
      }

      return branchIds;
    };

    unionsByGeneration.forEach(union => {
      const childIds = (union.children_ids || []).filter(childId => newPositions[childId]);
      const parent1Position = newPositions[union.partner1_id];
      const parent2Position = union.partner2_id ? newPositions[union.partner2_id] : null;
      if (childIds.length === 0 || !parent1Position) return;

      const parentCenterX = parent2Position
        ? (parent1Position.x + parent2Position.x) / 2
        : parent1Position.x;
      const immediateFamilyIds = new Set(childIds);

      childIds.forEach(childId => {
        unions.forEach(childUnion => {
          if (childUnion.partner1_id === childId && childUnion.partner2_id) {
            immediateFamilyIds.add(childUnion.partner2_id);
          } else if (childUnion.partner2_id === childId && childUnion.partner1_id) {
            immediateFamilyIds.add(childUnion.partner1_id);
          }
        });
      });

      const immediatePositions = [...immediateFamilyIds]
        .map(personId => newPositions[personId])
        .filter(Boolean);
      if (immediatePositions.length === 0) return;

      const leftEdge = Math.min(...immediatePositions.map(position => position.x - CARD_WIDTH / 2));
      const rightEdge = Math.max(...immediatePositions.map(position => position.x + CARD_WIDTH / 2));
      const childrenCenterX = (leftEdge + rightEdge) / 2;
      const offsetX = parentCenterX - childrenCenterX;
      if (Math.abs(offsetX) < 0.01) return;

      const branchIds = new Set();
      childIds.forEach(childId => {
        collectDescendantBranchIds(childId).forEach(personId => branchIds.add(personId));
      });
      branchIds.forEach(personId => {
        if (newPositions[personId]) {
          newPositions[personId] = {
            ...newPositions[personId],
            x: newPositions[personId].x + offsetX
          };
        }
      });
    });

    const autoPositions = {};

    if (layoutMode === 'conceptual') {
      const rootIds = people
        .filter(person => (generations[person.id] || 0) === 0)
        .map(person => person.id)
        .sort((a, b) => (newPositions[a]?.x || 0) - (newPositions[b]?.x || 0));

      rootIds.forEach((personId, index) => {
        autoPositions[personId] = {
          x: 0,
          y: (index - (rootIds.length - 1) / 2) * 120
        };
      });

      const branchAnchorSet = new Set();
      unions.forEach(union => {
        const parentGeneration = Math.max(
          generations[union.partner1_id] || 0,
          generations[union.partner2_id] || 0
        );
        if (parentGeneration === 0) {
          (union.children_ids || []).forEach(childId => branchAnchorSet.add(childId));
        }
      });

      const branchAnchorIds = [...branchAnchorSet].sort(
        (a, b) => (newPositions[a]?.x || 0) - (newPositions[b]?.x || 0)
      );
      const leftCount = Math.floor(branchAnchorIds.length / 2);
      const leftAnchors = branchAnchorIds.slice(0, leftCount);
      const rightAnchors = branchAnchorIds.slice(leftCount);
      const branchAssignments = new Map();

      const assignSide = (anchorIds, side) => {
        anchorIds.forEach((anchorId, index) => {
          branchAssignments.set(anchorId, {
            side,
            baseY: (index - (anchorIds.length - 1) / 2) * 340
          });
        });
      };
      assignSide(leftAnchors, -1);
      assignSide(rightAnchors, 1);

      const personBranch = new Map();
      branchAnchorIds.forEach(anchorId => {
        const queue = [anchorId];
        while (queue.length > 0) {
          const personId = queue.shift();
          if (!personId || personBranch.has(personId) || (generations[personId] || 0) === 0) continue;
          personBranch.set(personId, anchorId);

          unions.forEach(union => {
            const isPartner = union.partner1_id === personId || union.partner2_id === personId;
            if (!isPartner) return;

            const partnerId = union.partner1_id === personId
              ? union.partner2_id
              : union.partner1_id;
            if (partnerId && !personBranch.has(partnerId)) queue.push(partnerId);
            (union.children_ids || []).forEach(childId => {
              if (!personBranch.has(childId)) queue.push(childId);
            });
          });
        }
      });

      branchAnchorIds.forEach(anchorId => {
        const assignment = branchAssignments.get(anchorId);
        sortedGenKeys.filter(gen => gen > 0).forEach(gen => {
          const ids = people
            .filter(person => personBranch.get(person.id) === anchorId && (generations[person.id] || 0) === gen)
            .map(person => person.id)
            .sort((a, b) => (newPositions[a]?.x || 0) - (newPositions[b]?.x || 0));

          ids.forEach((personId, index) => {
            autoPositions[personId] = {
              x: assignment.side * (340 + (gen - 1) * 320),
              y: assignment.baseY + (index - (ids.length - 1) / 2) * 125
            };
          });
        });
      });

      const unassignedIds = people
        .filter(person => !autoPositions[person.id])
        .map(person => person.id)
        .sort((a, b) => (newPositions[a]?.x || 0) - (newPositions[b]?.x || 0));
      unassignedIds.forEach((personId, index) => {
        const generation = generations[personId] || 1;
        const side = index % 2 === 0 ? -1 : 1;
        autoPositions[personId] = {
          x: side * (340 + (generation - 1) * 320),
          y: (Math.floor(index / 2) - (unassignedIds.length - 1) / 4) * 150
        };
      });
    } else {
      people.forEach(person => {
        const base = newPositions[person.id] || { x: 0, y: 100 };

        if (layoutMode === 'horizontal') {
          autoPositions[person.id] = {
            x: 100 + ((base.y - 100) / VERTICAL_GAP) * HORIZONTAL_GENERATION_GAP,
            y: base.x
          };
        } else {
          autoPositions[person.id] = base;
        }
      });
    }

    Object.entries(manualPositionsRef.current).forEach(([personId, manualPosition]) => {
      if (autoPositions[personId]) {
        autoPositions[personId] = manualPosition;
      }
    });

    setPositions(autoPositions);

    // Centra l'albero sullo schermo SOLO al primo caricamento:
    // ricentrare ad ogni modifica dei dati faceva "saltare" la visuale.
    if (!hasCenteredRef.current && wrapperRef.current) {
      hasCenteredRef.current = true;
      const wWidth = wrapperRef.current.clientWidth;
      const wHeight = wrapperRef.current.clientHeight;
      if (layoutMode === 'conceptual') {
        const fittedView = getConceptualViewport(autoPositions, wWidth, wHeight);
        setZoom(fittedView.zoom);
        setPan(fittedView.pan);
      } else if (layoutMode === 'horizontal') {
        setPan({ x: 80, y: wHeight / 2 });
      } else {
        setPan({ x: wWidth / 2, y: 80 });
      }
    }
  }, [people, unions, layoutMode, layoutVersion]);

  // Mantiene le posizioni aggiornate in un ref (evita dipendenze che rilanciano effetti durante il drag)
  const positionsRef = useRef(positions);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Gestione del Pan (trascinamento dello sfondo)
  const handleMouseDown = (e) => {
    if (layoutMode === 'table') return;
    if (e.target.closest('.node-card') || e.target.closest('.btn') || e.target.closest('.btn-quick-add') || e.target.closest('.couple-connector')) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const hasDraggedRef = useRef(false);

  // Soglia (in pixel schermo) oltre la quale il movimento è considerato un drag e non un click
  const DRAG_THRESHOLD = 4;

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;

    // Spostamento calcolato in DELTA rispetto al punto di partenza:
    // non dipende né dal riquadro del canvas né dal pan corrente, quindi il nodo
    // segue il mouse 1:1 e non "schizza" via se la visuale cambia.
    const dxScreen = e.clientX - drag.startClientX;
    const dyScreen = e.clientY - drag.startClientY;

    if (!drag.moved) {
      if (Math.abs(dxScreen) < DRAG_THRESHOLD && Math.abs(dyScreen) < DRAG_THRESHOLD) return;
      drag.moved = true;
      hasDraggedRef.current = true;
    }

    const newX = drag.origX + dxScreen / zoom;
    const newY = drag.origY + dyScreen / zoom;

    manualPositionsRef.current[drag.id] = { x: newX, y: newY };

    setPositions(prev => ({
      ...prev,
      [drag.id]: { x: newX, y: newY }
    }));
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    dragRef.current = null;
    setDraggedNode(null);
  };

  // Applica uno zoom mantenendo fisso il punto (cx, cy) espresso in coordinate del wrapper
  const applyZoom = (nextZoomRaw, cx, cy) => {
    const nextZoom = Math.min(2.0, Math.max(0.3, nextZoomRaw));
    if (nextZoom === zoom) return;
    const k = nextZoom / zoom;
    setPan(p => ({
      x: cx - (cx - p.x) * k,
      y: cy - (cy - p.y) * k
    }));
    setZoom(nextZoom);
  };

  // Zoom con la rotella, ancorato alla posizione del cursore
  const handleWheel = (e) => {
    if (layoutMode === 'table') return;
    e.preventDefault();
    const rect = wrapperRef.current.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    applyZoom(zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
  };

  // Funzioni HUD (zoom ancorato al centro della vista)
  const zoomAtCenter = (factor) => {
    const el = wrapperRef.current;
    if (!el) return;
    applyZoom(zoom * factor, el.clientWidth / 2, el.clientHeight / 2);
  };
  const zoomIn = () => zoomAtCenter(1.2);
  const zoomOut = () => zoomAtCenter(1 / 1.2);
  const centerCurrentLayout = () => {
    if (!wrapperRef.current) return;
    const wWidth = wrapperRef.current.clientWidth;
    const wHeight = wrapperRef.current.clientHeight;

    if (layoutMode === 'conceptual') {
      const fittedView = getConceptualViewport(positions, wWidth, wHeight);
      setZoom(fittedView.zoom);
      setPan(fittedView.pan);
    } else if (layoutMode === 'horizontal') {
      setPan({ x: 80, y: wHeight / 2 });
    } else {
      setPan({ x: wWidth / 2, y: 80 });
    }
  };
  const resetPanZoom = () => {
    centerCurrentLayout();
    if (layoutMode !== 'conceptual') setZoom(0.85);
  };
  const handleLayoutModeChange = (nextMode) => {
    manualPositionsByModeRef.current[layoutMode] = manualPositionsRef.current;
    const nextManualPositions = manualPositionsByModeRef.current[nextMode] || {};
    manualPositionsByModeRef.current[nextMode] = nextManualPositions;
    manualPositionsRef.current = nextManualPositions;
    hasCenteredRef.current = false;
    setLayoutMode(nextMode);
  };
  // Il reset riporta SEMPRE tutti i nodi (coppie e singoli) alla posizione calcolata.
  const resetNodePositions = () => {
    manualPositionsRef.current = {};
    manualPositionsByModeRef.current[layoutMode] = manualPositionsRef.current;

    // Forza il ricalcolo anche se i dati genealogici non sono cambiati.
    hasCenteredRef.current = false;
    setLayoutVersion(v => v + 1);
  };

  // Mousedown su un nodo: gestisce selezione multipla (Shift) e avvio del drag.
  // Un solo handler evita che il pan dello sfondo parta contemporaneamente al drag della card.
  const handleNodeMouseDown = (personId, e) => {
    if (e.button !== 0) return;
    // Non interferire con i pulsanti interni alla card (quick add, menu...)
    if (e.target.closest('button')) return;

    if (e.shiftKey && canEdit) {
      e.stopPropagation();
      e.preventDefault();
      hasDraggedRef.current = true; // impedisce l'apertura della scheda al click
      setSelectedPeople(prev => {
        const next = new Set(prev);
        if (next.has(personId)) next.delete(personId);
        else next.add(personId);
        return next;
      });
      return;
    }

    if (!canEdit) return;

    e.stopPropagation();

    hasDraggedRef.current = false;

    const currentPos = positionsRef.current[personId] || { x: 0, y: 0 };
    dragRef.current = {
      id: personId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: currentPos.x,
      origY: currentPos.y,
      moved: false
    };
    setDraggedNode(personId);
  };

  // Effetto per centrare un nodo evidenziato (es. dai risultati della ricerca).
  // Dipende SOLO da highlightedPersonId: dipendere da `positions` faceva ricentrare
  // la visuale ad ogni pixel di trascinamento.
  useEffect(() => {
    if (!highlightedPersonId) return;
    const pos = positionsRef.current[highlightedPersonId];
    if (!pos || !wrapperRef.current) return;

    const wWidth = wrapperRef.current.clientWidth;
    const wHeight = wrapperRef.current.clientHeight;
    setPan({
      x: wWidth / 2 - pos.x * zoom,
      y: wHeight / 2 - pos.y * zoom
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedPersonId, positions[highlightedPersonId] ? 1 : 0]);

  // Altezza reale delle card (varia se ci sono badge Salute/Note):
  // usare un valore fisso lasciava un piccolo distacco fra linea e scheda.
  const cardElsRef = useRef({});
  const [cardHeights, setCardHeights] = useState({});

  useLayoutEffect(() => {
    const measured = {};
    Object.entries(cardElsRef.current).forEach(([id, el]) => {
      const h = el && el.offsetHeight;
      if (h) measured[id] = h;
    });
    setCardHeights(prev => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(measured);
      const same =
        prevKeys.length === nextKeys.length &&
        nextKeys.every(k => prev[k] === measured[k]);
      return same ? prev : measured;
    });
  }, [dataHash]);

  const halfHeight = (personId) => (cardHeights[personId] || CARD_HEIGHT) / 2;

  // Genera linee di collegamento SVG
  const renderConnections = () => {
    const lines = [];

    unions.forEach(u => {
      const p1 = positions[u.partner1_id];
      const p2 = u.partner2_id ? positions[u.partner2_id] : null;
      if (!p1) return;

      // 1. Linea tra partner
      if (p1 && p2) {
        const isHighlighted = highlightedPersonId === u.partner1_id || highlightedPersonId === u.partner2_id;
        lines.push(
          <path
            key={`union-line-${u.id}`}
            d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`}
            className={`connection-line ${isHighlighted ? 'highlighted' : ''}`}
            style={{ strokeDasharray: u.type === 'divorced' ? '8 6' : 'none' }}
          />
        );
      }

      // 2. Linea dai genitori ai figli
      if (Array.isArray(u.children_ids) && u.children_ids.length > 0) {
        // Figli effettivamente presenti sul canvas
        const childEntries = u.children_ids
          .map(childId => ({ childId, pos: positions[childId] }))
          .filter(c => c.pos);

        if (childEntries.length === 0) return;

        const isParentHighlighted = highlightedPersonId === u.partner1_id || (p2 && highlightedPersonId === u.partner2_id);

        if (layoutMode === 'conceptual') {
          const startX = p2 ? (p1.x + p2.x) / 2 : p1.x;
          const startY = p2 ? (p1.y + p2.y) / 2 : p1.y;

          childEntries.forEach(({ childId, pos: childPos }) => {
            const isPathHighlighted = isParentHighlighted || highlightedPersonId === childId;
            const direction = childPos.x >= startX ? 1 : -1;
            const startEdgeX = startX + direction * CARD_WIDTH / 2;
            const childEdgeX = childPos.x - direction * CARD_WIDTH / 2;
            const curveOffset = Math.max(90, Math.abs(childEdgeX - startEdgeX) * 0.45);
            lines.push(
              <path
                key={`conceptual-child-link-${u.id}-${childId}`}
                d={`M ${startEdgeX} ${startY} C ${startEdgeX + direction * curveOffset} ${startY}, ${childEdgeX - direction * curveOffset} ${childPos.y}, ${childEdgeX} ${childPos.y}`}
                className={`connection-line ${isPathHighlighted ? 'highlighted' : ''}`}
              />
            );
          });
          return;
        }

        if (layoutMode === 'horizontal') {
          const startX = Math.max(
            p1.x + CARD_WIDTH / 2,
            p2 ? p2.x + CARD_WIDTH / 2 : p1.x + CARD_WIDTH / 2
          );
          const startY = p2 ? (p1.y + p2.y) / 2 : p1.y;
          const minChildLeftX = Math.min(...childEntries.map(c => c.pos.x - CARD_WIDTH / 2));
          const busX = startX + (minChildLeftX - startX) / 2;

          lines.push(
            <path
              key={`parent-right-${u.id}`}
              d={`M ${startX} ${startY} L ${busX} ${startY}`}
              className={`connection-line ${isParentHighlighted ? 'highlighted' : ''}`}
            />
          );

          childEntries.forEach(({ childId, pos: childPos }) => {
            const childEdgeX = childPos.x + (childPos.x >= busX ? -CARD_WIDTH / 2 : CARD_WIDTH / 2);
            const isPathHighlighted = isParentHighlighted || highlightedPersonId === childId;
            lines.push(
              <path
                key={`horizontal-child-link-${u.id}-${childId}`}
                d={`M ${busX} ${startY} L ${busX} ${childPos.y} L ${childEdgeX} ${childPos.y}`}
                className={`connection-line ${isPathHighlighted ? 'highlighted' : ''}`}
              />
            );
          });
          return;
        }

        // Punto di partenza: connettore della coppia (o centro di p1 se genitore singolo).
        // Parte dal BORDO INFERIORE della card più bassa fra i due partner, così la linea
        // resta agganciata anche se i genitori vengono trascinati a quote diverse.
        const startX = p2 ? (p1.x + p2.x) / 2 : p1.x;
        const parentBottomY = p2
          ? Math.max(p1.y + halfHeight(u.partner1_id), p2.y + halfHeight(u.partner2_id))
          : p1.y + halfHeight(u.partner1_id);

        // Bordo superiore del figlio più in alto
        const minChildTopY = Math.min(...childEntries.map(c => c.pos.y - halfHeight(c.childId)));

        // Altezza della "sbarra" orizzontale: sempre a metà fra genitori e figli.
        // Essendo calcolata dalle posizioni REALI (non da VERTICAL_GAP fisso), gli estremi
        // del gomito restano attaccati alle card durante il trascinamento.
        const busY = parentBottomY + (minChildTopY - parentBottomY) / 2;

        // Tratto verticale che scende dai genitori fino alla sbarra
        lines.push(
          <path
            key={`parent-down-${u.id}`}
            d={`M ${startX} ${parentBottomY} L ${startX} ${busY}`}
            className={`connection-line ${isParentHighlighted ? 'highlighted' : ''}`}
          />
        );

        // Un gomito completo per ciascun figlio: sbarra -> colonna del figlio -> bordo del figlio
        childEntries.forEach(({ childId, pos: childPos }) => {
          const isChildHighlighted = highlightedPersonId === childId;
          const isPathHighlighted = isParentHighlighted || isChildHighlighted;

          // Se il figlio è stato trascinato sopra i genitori, ci si aggancia al suo bordo inferiore
          const childEdgeY = childPos.y + (childPos.y >= busY ? -halfHeight(childId) : halfHeight(childId));

          lines.push(
            <path
              key={`child-link-${u.id}-${childId}`}
              d={`M ${startX} ${busY} L ${childPos.x} ${busY} L ${childPos.x} ${childEdgeY}`}
              className={`connection-line ${isPathHighlighted ? 'highlighted' : ''}`}
            />
          );
        });
      }
    });

    return lines;
  };

  return (
    <div
      ref={wrapperRef}
      className={`canvas-wrapper ${draggedNode || isPanning ? 'is-dragging' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* HUD Controls */}
      <div className="canvas-hud">
        <div className="hud-panel glass layout-mode-panel" onMouseDown={(e) => e.stopPropagation()}>
          <label htmlFor="tree-layout-mode">Visualizzazione</label>
          <select
            id="tree-layout-mode"
            className="form-control"
            value={layoutMode}
            onChange={(e) => handleLayoutModeChange(e.target.value)}
          >
            {LAYOUT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        {layoutMode !== 'table' && <div className="hud-panel glass reset-positions-panel" onMouseDown={(e) => e.stopPropagation()}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={resetNodePositions}
            title="Ripristina la posizione di tutti i nodi"
          >
            <RefreshCw size={15} /> Reset posizioni
          </button>
        </div>}
        {layoutMode !== 'table' && <div className="hud-panel glass hud-vertical">
          <button className="btn-icon" onClick={zoomIn} title="Zoom In">
            <ZoomIn size={18} />
          </button>
          <button className="btn-icon" onClick={zoomOut} title="Zoom Out">
            <ZoomOut size={18} />
          </button>
          <button className="btn-icon" onClick={resetPanZoom} title="Centra Albero">
            <Maximize size={18} />
          </button>
          {canEdit && selectedPeople.size > 0 && (
            <button className="btn-icon btn-danger" onClick={() => {
              if (window.confirm(`Sei sicuro di voler eliminare ${selectedPeople.size} persone?`)) {
                onDeletePeople(Array.from(selectedPeople));
                setSelectedPeople(new Set());
              }
            }} title={`Elimina ${selectedPeople.size} persone selezionate (Shift+Click per selezionare)`}>
              <Trash2 size={18} />
            </button>
          )}
        </div>}
      </div>

      {layoutMode === 'table' ? (
        <div className="genealogy-table-view" onMouseDown={(e) => e.stopPropagation()}>
          <div className="genealogy-table-header">
            <div>
              <h3>Persone dell’albero</h3>
              <p>Ordinate per generazione e cognome</p>
            </div>
            <span className="table-total-count">{tableRows.length} persone</span>
          </div>
          <div className="genealogy-table-scroll">
            <table className="genealogy-data-table">
              <thead>
                <tr>
                  <th>Generazione</th>
                  <th>Persona</th>
                  <th>Nascita / decesso</th>
                  <th>Genitori</th>
                  <th>Partner</th>
                  <th>Figli</th>
                  <th>Informazioni</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ person, generation, parents, partners, children }) => (
                  <tr key={person.id} className={highlightedPersonId === person.id ? 'highlighted' : ''}>
                    <td><span className="table-generation-badge">G{generation + 1}</span></td>
                    <td>
                      <button className="table-person-button" onClick={() => onSelectPerson(person)}>
                        <span className={`node-avatar avatar-${person.gender}`}>
                          {(person.first_name?.[0] || '')}{(person.last_name?.[0] || '')}
                        </span>
                        <span>
                          <strong>{person.first_name} {person.last_name}</strong>
                          {person.birth_place && <small>{person.birth_place}</small>}
                        </span>
                      </button>
                    </td>
                    <td>
                      <span>{person.birth_date || '—'}</span>
                      {person.death_date && <small>† {person.death_date}</small>}
                    </td>
                    <td>{parents || '—'}</td>
                    <td>{partners || '—'}</td>
                    <td>{children || '—'}</td>
                    <td>
                      <div className="table-info-badges">
                        {healthVisible && person.illnesses?.length > 0 && <span>Salute: {person.illnesses.length}</span>}
                        {person.notes && <span>Note</span>}
                        {!(healthVisible && person.illnesses?.length) && !person.notes && <span className="muted">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <div
        ref={canvasRef}
        className="canvas-content"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* SVG per le connessioni */}
        <svg className="connections-svg" style={{ overflow: 'visible' }}>
          {renderConnections()}
        </svg>

        {/* Nodi (Persone) */}
        <div className="tree-nodes-container">
          {people.map(person => {
            const pos = positions[person.id] || { x: 0, y: 0 };
            const isSelected = selectedPeople.has(person.id);
            return (
              <div
                key={person.id}
                ref={(el) => {
                  if (el) cardElsRef.current[person.id] = el;
                  else delete cardElsRef.current[person.id];
                }}
                className={`tree-node-wrapper ${isSelected ? 'selected' : ''}`}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                }}
                onMouseDown={(e) => handleNodeMouseDown(person.id, e)}
              >
                <NodeCard
                  person={person}
                  highlighted={highlightedPersonId === person.id}
                  onClick={() => {
                    if (!hasDraggedRef.current) {
                      onSelectPerson(person);
                    }
                  }}
                  onAddRelative={(relation) => onAddRelative(person, relation)}
                  canEdit={canEdit}
                  healthVisible={healthVisible}
                />
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
