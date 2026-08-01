import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
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

    // Posiziona i nodi generazione per generazione
    Object.keys(genGroups).forEach(genStr => {
      const gen = Number(genStr);
      const pIds = genGroups[gen];

      // Divide in coppie e singoli in questa generazione
      const genElements = []; // conterrà oggetti { type: 'couple'|'single', ids: [...] }
      const addedToGen = new Set();

      pIds.forEach(pid => {
        if (addedToGen.has(pid)) return;

        const couple = couples.find(c => c.p1 === pid || c.p2 === pid);
        if (couple) {
          const partnerId = couple.p1 === pid ? couple.p2 : couple.p1;
          // Assicura che anche il partner sia in questa generazione
          if (pIds.includes(partnerId)) {
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

      // Calcola larghezza totale occupata da questa generazione
      let totalWidth = 0;
      const elementWidths = genElements.map(el => {
        if (el.type === 'couple') {
          return CARD_WIDTH * 2 + HORIZONTAL_GAP;
        } else {
          return CARD_WIDTH;
        }
      });

      totalWidth = elementWidths.reduce((a, b) => a + b, 0) + (genElements.length - 1) * HORIZONTAL_GAP;

      // Assegna posizioni X centered
      let currentX = -totalWidth / 2;
      const y = gen * VERTICAL_GAP + 100;

      genElements.forEach((el, index) => {
        const w = elementWidths[index];
        const centerOffset = w / 2;

        if (el.type === 'couple') {
          // Preserva posizioni manuali se esistono
          const savedP1 = manualPositionsRef.current[el.ids[0]];
          const savedP2 = manualPositionsRef.current[el.ids[1]];
          const p1X = savedP1 ? savedP1.x : currentX + CARD_WIDTH / 2;
          const p2X = savedP2 ? savedP2.x : currentX + CARD_WIDTH + HORIZONTAL_GAP + CARD_WIDTH / 2;

          newPositions[el.ids[0]] = { x: p1X, y: savedP1?.y ?? y };
          newPositions[el.ids[1]] = { x: p2X, y: savedP2?.y ?? y };
          // Salva anche la posizione del connettore della coppia
          newPositions[`union_${el.unionId}`] = { x: currentX + CARD_WIDTH + HORIZONTAL_GAP / 2, y };
        } else {
          // Preserva posizione manuale se esiste
          const saved = manualPositionsRef.current[el.id];
          newPositions[el.id] = {
            x: saved ? saved.x : currentX + centerOffset,
            y: saved ? saved.y : y
          };
        }

        currentX += w + HORIZONTAL_GAP;
      });
    });

    setPositions(newPositions);

    // Centra l'albero sullo schermo al caricamento iniziale
    if (wrapperRef.current) {
      const wWidth = wrapperRef.current.clientWidth;
      setPan({ x: wWidth / 2, y: 80 });
    }
  }, [dataHash]);

  // Gestione del Pan (trascinamento dello sfondo)
  const handleMouseDown = (e) => {
    if (e.target.closest('.node-card') || e.target.closest('.btn') || e.target.closest('.btn-quick-add') || e.target.closest('.couple-connector')) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    } else if (draggedNode) {
      // Drag di una card singola per riposizionamento manuale
      const rect = canvasRef.current.getBoundingClientRect();
      // Calcola coordinate relative scalate
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;

      // Salva anche in manualPositionsRef per preservare dopo il layout
      manualPositionsRef.current[draggedNode] = {
        x: x - dragOffset.x,
        y: y - dragOffset.y
      };

      setPositions(prev => ({
        ...prev,
        [draggedNode]: manualPositionsRef.current[draggedNode]
      }));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNode(null);
  };

  // Zoom con la rotella
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let newZoom = zoom;
    if (e.deltaY < 0) {
      newZoom = Math.min(zoom * zoomFactor, 2.0);
    } else {
      newZoom = Math.max(zoom / zoomFactor, 0.3);
    }
    setZoom(newZoom);
  };

  // Funzioni HUD
  const zoomIn = () => setZoom(z => Math.min(z * 1.2, 2.0));
  const zoomOut = () => setZoom(z => Math.max(z / 1.2, 0.3));
  const resetPanZoom = () => {
    if (wrapperRef.current) {
      const wWidth = wrapperRef.current.clientWidth;
      setPan({ x: wWidth / 2, y: 80 });
      setZoom(0.85);
    }
  };

  // Inizia il drag di un nodo
  const handleNodeDragStart = (personId, e) => {
    if (!canEdit) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();

    // Calcola il punto di click relativo all'interno del nodo
    const clickX = (e.clientX - rect.left) / zoom;
    const clickY = (e.clientY - rect.top) / zoom;

    setDraggedNode(personId);
    setDragOffset({ x: clickX - CARD_WIDTH/2, y: clickY - CARD_HEIGHT/2 });
  };

  // Gestione click sui nodi per selezione multipla con Shift
  const handleNodeClick = (personId, e) => {
    if (e.shiftKey && canEdit) {
      // selezione multipla con shift
      e.stopPropagation();
      setSelectedPeople(prev => {
        const next = new Set(prev);
        if (next.has(personId)) {
          next.delete(personId);
        } else {
          next.add(personId);
        }
        return next;
      });
    }
  };

  // Effetto per centrare un nodo evidenziato (es. dai risultati della ricerca)
  useEffect(() => {
    if (highlightedPersonId && positions[highlightedPersonId] && wrapperRef.current) {
      const nodePos = positions[highlightedPersonId];
      const wWidth = wrapperRef.current.clientWidth;
      const wHeight = wrapperRef.current.clientHeight;
      
      // Sposta il pan in modo che il nodo sia al centro dello schermo
      setPan({
        x: wWidth / 2 - nodePos.x * zoom,
        y: wHeight / 2 - nodePos.y * zoom
      });
    }
  }, [highlightedPersonId, positions]);

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
        // Punto di partenza (connettore di coppia o centro di p1 se single parent)
        const startX = p2 ? (p1.x + p2.x) / 2 : p1.x;
        const startY = p1.y;

        // Scendi a metà strada tra le generazioni
        const midY = startY + VERTICAL_GAP / 2;

        const isParentHighlighted = highlightedPersonId === u.partner1_id || (p2 && highlightedPersonId === u.partner2_id);

        // Disegna linea verticale principale verso il basso
        lines.push(
          <path
            key={`parent-down-${u.id}`}
            d={`M ${startX} ${startY} L ${startX} ${midY}`}
            className={`connection-line ${isParentHighlighted ? 'highlighted' : ''}`}
          />
        );

        // Disegna linee verso ciascun figlio
        u.children_ids.forEach(childId => {
          const childPos = positions[childId];
          if (!childPos) return;

          const isChildHighlighted = highlightedPersonId === childId;
          const isPathHighlighted = isParentHighlighted || isChildHighlighted;

          // Disegna gomito (elbow path): da midY all'asse X del figlio, poi giù al figlio
          lines.push(
            <path
              key={`child-link-${u.id}-${childId}`}
              d={`M ${startX} ${midY} L ${childPos.x} ${midY} L ${childPos.x} ${childPos.y - CARD_HEIGHT/2}`}
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
      className="canvas-wrapper"
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
                className={`tree-node-wrapper ${isSelected ? 'selected' : ''}`}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                }}
                onMouseDown={(e) => handleNodeClick(person.id, e)}
                onMouseDownCapture={(e) => handleNodeDragStart(person.id, e)}
              >
                <NodeCard
                  person={person}
                  highlighted={highlightedPersonId === person.id}
                  onClick={() => onSelectPerson(person)}
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
