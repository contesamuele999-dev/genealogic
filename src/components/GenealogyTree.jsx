import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize, RefreshCw, Plus, UserPlus, Trash2 } from 'lucide-react';
import NodeCard from './NodeCard';

// Dimensioni di layout
const CARD_WIDTH = 190;
const CARD_HEIGHT = 80;
const HORIZONTAL_GAP = 60;
const VERTICAL_GAP = 120;

export default function GenealogyTree({
  people,
  unions,
  onSelectPerson,
  onAddRelative,
  canEdit,
  highlightedPersonId,
  onDeletePeople
}) {
  const [positions, setPositions] = useState({});
  const [draggedNode, setDraggedNode] = useState(null);
  // Stato del drag corrente (ref: non provoca re-render e non è soggetto a closure stale)
  const dragRef = useRef(null);
  // Memoria posizioni manuali (drag)
  const manualPositionsRef = useRef({});
  // Nodi selezionati per multi-select
  const [selectedPeople, setSelectedPeople] = useState(new Set());

  // Stati per Pan & Zoom
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [zoom, setZoom] = useState(0.85);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const hasCenteredRef = useRef(false);
  const [layoutVersion, setLayoutVersion] = useState(0);

  // Hash per rilevare cambiamenti reali nei dati
  const dataHash = useMemo(() => {
    const pHash = people ? people.map(p => `${p.id}:${p.first_name}:${p.last_name}`).join('|') : '';
    const uHash = unions ? unions.map(u => `${u.id}:${u.partner1_id || ''}:${u.partner2_id || ''}:${u.children_ids?.join(',') || ''}`).join('|') : '';
    return [pHash, uHash].join('||');
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
    const maxGen = Math.max(...Object.keys(genGroups).map(Number), 0);

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

      // Funzione per identificare i figli di un elemento della generazione
      const getElementChildrenIds = (el) => {
        if (el.type === 'couple') {
          const u = unions.find(x => x.id === el.unionId);
          return u && Array.isArray(u.children_ids) ? u.children_ids : [];
        } else {
          const uList = unions.filter(x => x.partner1_id === el.id || x.partner2_id === el.id);
          const cIds = [];
          uList.forEach(u => {
            if (Array.isArray(u.children_ids)) cIds.push(...u.children_ids);
          });
          return cIds;
        }
      };

      // Calcola la larghezza dinamica riservata a ciascun elemento in base allo spazio richiesto dai suoi figli
      const elementWidths = genElements.map(el => {
        const selfW = el.type === 'couple' ? (CARD_WIDTH * 2 + HORIZONTAL_GAP) : CARD_WIDTH;
        const childIds = getElementChildrenIds(el);
        if (childIds.length > 0) {
          let childrenW = 0;
          childIds.forEach(cId => {
            const isCouple = couples.some(c => c.p1 === cId || c.p2 === cId);
            childrenW += isCouple ? (CARD_WIDTH * 2 + HORIZONTAL_GAP) : CARD_WIDTH;
          });
          childrenW += (childIds.length - 1) * HORIZONTAL_GAP;
          return Math.max(selfW, childrenW);
        }
        return selfW;
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
          const savedP1 = manualPositionsRef.current[el.ids[0]];
          const savedP2 = manualPositionsRef.current[el.ids[1]];
          const p1X = savedP1 ? savedP1.x : slotCenterX - (CARD_WIDTH + HORIZONTAL_GAP) / 2;
          const p2X = savedP2 ? savedP2.x : slotCenterX + (CARD_WIDTH + HORIZONTAL_GAP) / 2;

          newPositions[el.ids[0]] = { x: p1X, y: savedP1?.y ?? y };
          newPositions[el.ids[1]] = { x: p2X, y: savedP2?.y ?? y };
          newPositions[`union_${el.unionId}`] = { x: slotCenterX, y };
        } else {
          const saved = manualPositionsRef.current[el.id];
          newPositions[el.id] = {
            x: saved ? saved.x : slotCenterX,
            y: saved ? saved.y : y
          };
        }

        currentX += allocatedW + HORIZONTAL_GAP;
      });
    });

    setPositions(newPositions);

    // Centra l'albero sullo schermo SOLO al primo caricamento:
    // ricentrare ad ogni modifica dei dati faceva "saltare" la visuale.
    if (!hasCenteredRef.current && wrapperRef.current) {
      hasCenteredRef.current = true;
      const wWidth = wrapperRef.current.clientWidth;
      setPan({ x: wWidth / 2, y: 80 });
    }
  }, [dataHash, layoutVersion]);

  // Mantiene le posizioni aggiornate in un ref (evita dipendenze che rilanciano effetti durante il drag)
  const positionsRef = useRef(positions);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Gestione del Pan (trascinamento dello sfondo)
  const handleMouseDown = (e) => {
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
  const resetPanZoom = () => {
    if (wrapperRef.current) {
      const wWidth = wrapperRef.current.clientWidth;
      setPan({ x: wWidth / 2, y: 80 });
      setZoom(0.85);
    }
  };
  const resetLayout = () => {
    manualPositionsRef.current = {};
    // Forza il ricalcolo del layout: senza questo i nodi restavano a 0,0
    // perché l'effetto dipende solo da dataHash (invariato).
    setLayoutVersion(v => v + 1);
    if (wrapperRef.current) {
      const wWidth = wrapperRef.current.clientWidth;
      setPan({ x: wWidth / 2, y: 80 });
      setZoom(0.85);
    }
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
      const unionPos = positions[`union_${u.id}`];

      if (!p1) return;

      // 1. Linea tra partner
      if (p1 && p2) {
        const isHighlighted = highlightedPersonId === u.partner1_id || highlightedPersonId === u.partner2_id;
        lines.push(
          <path
            key={`union-line-${u.id}`}
            d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`}
            className={`connection-line ${isHighlighted ? 'highlighted' : ''}`}
            style={{ strokeStyle: u.type === 'divorced' ? 'dashed' : 'solid' }}
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

        const isParentHighlighted = highlightedPersonId === u.partner1_id || (p2 && highlightedPersonId === u.partner2_id);

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
        <div className="hud-panel glass hud-vertical">
          <button className="btn-icon" onClick={zoomIn} title="Zoom In">
            <ZoomIn size={18} />
          </button>
          <button className="btn-icon" onClick={zoomOut} title="Zoom Out">
            <ZoomOut size={18} />
          </button>
          <button className="btn-icon" onClick={resetPanZoom} title="Centra Albero">
            <Maximize size={18} />
          </button>
          <button className="btn-icon" onClick={resetLayout} title="Ripristina Layout Automatico">
            <RefreshCw size={18} />
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
        </div>
      </div>

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
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
