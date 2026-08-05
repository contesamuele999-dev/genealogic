import React, { useState, useRef } from 'react';
import { Plus, HeartPulse, FileText, UserPlus, Heart, Link, GitMerge } from 'lucide-react';

export default function NodeCard({
  person,
  highlighted,
  onClick,
  onAddRelative,
  canEdit,
  // Il badge "Salute" compare solo in modalità clinica: i dati sanitari non fanno
  // parte dell'albero ufficiale.
  healthVisible = false
}) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const menuRef = useRef(null);

  const getInitials = () => {
    const fn = person.first_name ? person.first_name[0] : '';
    const ln = person.last_name ? person.last_name[0] : '';
    return (fn + ln).toUpperCase();
  };

  const handleQuickAddClick = (e, relation) => {
    e.stopPropagation();
    setShowAddMenu(false);
    onAddRelative(relation);
  };

  const handleQuickAddMouseLeave = () => {
    // Ritarda la chiusura per permettere al click di avvenire
    setTimeout(() => {
      // Chiudi solo se il menu non è hovered e non c'è un click in sospeso
      if (!showAddMenu && menuRef.current && !menuRef.current.contains(document.activeElement)) {
        setShowAddMenu(false);
      }
    }, 150);
  };

  const hasIllnesses = healthVisible && Array.isArray(person.illnesses) && person.illnesses.length > 0;
  const hasNotes = person.notes && person.notes.trim().length > 0;

  // Nodo proveniente da un albero collegato: si vede, non si tocca.
  const isForeign = !!person.is_foreign;
  // Persona di questo albero che esiste anche in uno o più rami agganciati.
  const sharedWith = Array.isArray(person.linked_trees) ? person.linked_trees : [];

  return (
    <div
      className={`node-card glass glass-hover gender-${person.gender} ${highlighted ? 'highlighted' : ''} ${isForeign ? 'node-foreign' : ''} ${!isForeign && sharedWith.length > 0 ? 'node-shared' : ''}`}
      onClick={onClick}
      title={isForeign
        ? `Nodo dell'albero collegato "${person.origin_tree_name || ''}" — sola lettura`
        : sharedWith.length > 0
          ? `Persona condivisa con: ${sharedWith.join(', ')}`
          : undefined}
    >
      {isForeign && (
        <span className="node-origin-tag" title={person.origin_tree_name}>
          <GitMerge size={9} />
          {person.origin_tree_name || 'Ramo collegato'}
        </span>
      )}
      {!isForeign && sharedWith.length > 0 && (
        <span className="node-origin-tag node-origin-shared" title={`Condivisa con: ${sharedWith.join(', ')}`}>
          <GitMerge size={9} />
          {sharedWith.length}
        </span>
      )}
      <div className="node-card-header">
        <div className={`node-avatar avatar-${person.gender}`}>
          {getInitials()}
        </div>
        <div className="node-title-info">
          <span className="node-name" title={person.first_name}>
            {person.first_name}
          </span>
          <span className="node-surname" title={person.last_name}>
            {person.last_name || '—'}
          </span>
        </div>
      </div>
      
      <div className="node-date">
        {person.birth_date ? `* ${person.birth_date}` : ''}
        {person.death_date ? ` - † ${person.death_date}` : ''}
      </div>

      {(hasIllnesses || hasNotes) && (
        <div className="node-badges">
          {hasIllnesses && (
            <span className="badge badge-illness" title={`${person.illnesses.length} patologie registrate`}>
              <HeartPulse size={10} style={{ marginRight: 2 }} />
              Salute
            </span>
          )}
          {hasNotes && (
            <span className="badge badge-notes" title="Note disponibili">
              <FileText size={10} style={{ marginRight: 2 }} />
              Note
            </span>
          )}
        </div>
      )}

      {/* Pulsanti di aggiunta rapida sul hover (mai sui nodi di alberi altrui) */}
      {canEdit && !isForeign && (
        <div className="quick-actions" onMouseLeave={handleQuickAddMouseLeave}>
          <button
            className="btn-quick-add"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddMenu(!showAddMenu);
            }}
            title="Aggiungi familiare"
          >
            <Plus size={14} />
          </button>

          {showAddMenu && (
            <div
              ref={menuRef}
              className="glass"
              style={{
                position: 'absolute',
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '6px',
                borderRadius: '8px',
                width: '140px',
                zIndex: 100,
                boxShadow: 'var(--shadow-lg)'
              }}
            >
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.75rem', justifyContent: 'flex-start' }}
                onClick={(e) => handleQuickAddClick(e, 'parent')}
              >
                <UserPlus size={12} />
                Genitore
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.75rem', justifyContent: 'flex-start' }}
                onClick={(e) => handleQuickAddClick(e, 'partner')}
              >
                <Heart size={12} />
                Partner
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.75rem', justifyContent: 'flex-start' }}
                onClick={(e) => handleQuickAddClick(e, 'child')}
              >
                <Link size={12} />
                Figlio
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
