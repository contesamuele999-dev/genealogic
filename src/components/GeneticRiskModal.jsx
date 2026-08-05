import React, { useMemo, useState } from 'react';
import { X, Dna, ShieldAlert, AlertTriangle, Users, User } from 'lucide-react';
import {
  assessPersonRisk,
  assessOffspringRisk,
  getPeopleWithIllnesses
} from '../services/geneticRiskService';

function PersonSelect({ label, value, onChange, people, allowEmpty = false }) {
  const sorted = useMemo(
    () => [...people].sort((a, b) =>
      `${a.last_name || ''} ${a.first_name || ''}`.trim()
        .localeCompare(`${b.last_name || ''} ${b.first_name || ''}`.trim(), 'it')
    ),
    [people]
  );

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <select className="form-control" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allowEmpty ? '— nessuno / sconosciuto —' : '— seleziona —'}</option>
        {sorted.map(person => (
          <option key={person.id} value={person.id}>
            {person.last_name ? `${person.last_name} ${person.first_name}` : person.first_name}
            {person.birth_date ? ` (${person.birth_date})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function GeneticRiskModal({ isOpen, onClose, people = [], unions = [], onSelectPerson }) {
  const [mode, setMode] = useState('offspring');
  const [subjectId, setSubjectId] = useState('');
  const [parentAId, setParentAId] = useState('');
  const [parentBId, setParentBId] = useState('');
  const [expanded, setExpanded] = useState(null);

  const peopleWithIllnesses = useMemo(() => getPeopleWithIllnesses(people), [people]);

  const assessment = useMemo(() => {
    if (mode === 'person') {
      return subjectId ? assessPersonRisk(subjectId, people, unions) : null;
    }
    return parentAId || parentBId ? assessOffspringRisk(parentAId, parentBId, people, unions) : null;
  }, [mode, subjectId, parentAId, parentBId, people, unions]);

  if (!isOpen) return null;

  const consanguinity = assessment?.consanguinity;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container glass large clinical-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Dna size={20} style={{ color: 'var(--accent-violet)' }} />
            Rischio ereditario della prole
            <span className="clinical-tag"><ShieldAlert size={11} /> Dati riservati</span>
          </h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="clinical-disclaimer">
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>
            Stima <strong>puramente statistica e non diagnostica</strong>, calcolata dal coefficiente di
            parentela con i familiari affetti registrati nell’albero. Non sostituisce una consulenza
            genetica: parlane con un medico prima di trarre qualsiasi conclusione.
          </span>
        </div>

        <div className="clinical-mode-switch">
          <button
            className={`birthday-chip ${mode === 'offspring' ? 'active' : ''}`}
            onClick={() => setMode('offspring')}
          >
            <Users size={13} /> Prole ipotetica di una coppia
          </button>
          <button
            className={`birthday-chip ${mode === 'person' ? 'active' : ''}`}
            onClick={() => setMode('person')}
          >
            <User size={13} /> Persona dell’albero
          </button>
        </div>

        <div className="modal-body">
          {peopleWithIllnesses.length === 0 && (
            <div className="alert-box alert-warning">
              <AlertTriangle size={16} />
              Nessuna patologia registrata nell’albero: aggiungi le informazioni cliniche nella scheda
              dei familiari (scheda “Salute”) per ottenere una stima.
            </div>
          )}

          <div className="form-group row" style={{ marginBottom: 0 }}>
            {mode === 'person' ? (
              <PersonSelect label="Persona" value={subjectId} onChange={setSubjectId} people={people} />
            ) : (
              <>
                <PersonSelect label="Genitore 1" value={parentAId} onChange={setParentAId} people={people} />
                <PersonSelect label="Genitore 2" value={parentBId} onChange={setParentBId} people={people} allowEmpty />
              </>
            )}
          </div>

          {!assessment && (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
              Seleziona {mode === 'person' ? 'una persona' : 'almeno un genitore'} per calcolare la stima.
            </p>
          )}

          {assessment && consanguinity && consanguinity.shared.length > 0 && (
            <div className="alert-box alert-warning" style={{ marginBottom: 0 }}>
              <AlertTriangle size={16} />
              <span>
                I due genitori condividono {consanguinity.shared.length} antenat{consanguinity.shared.length === 1 ? 'e' : 'i'}
                {' '}({consanguinity.shared.map(s => s.name).join(', ')}). La consanguineità aumenta il rischio
                per le patologie recessive.
              </span>
            </div>
          )}

          {assessment && assessment.illnesses.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
              Nessuna patologia registrata fra i {assessment.ancestorsAnalyzed} ascendenti analizzati.
            </p>
          )}

          {assessment && assessment.illnesses.length > 0 && (
            <>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {assessment.ancestorsAnalyzed} ascendenti analizzati su {assessment.subjects.length || 1} ramo/i.
              </p>

              <div className="risk-list">
                {assessment.illnesses.map(illness => (
                  <div key={illness.key} className={`risk-item band-${illness.band}`}>
                    <button
                      className="risk-item-head"
                      onClick={() => setExpanded(expanded === illness.key ? null : illness.key)}
                    >
                      <span className="risk-name">{illness.name}</span>
                      <span className={`risk-band band-${illness.band}`}>{illness.bandLabel}</span>
                      <span className="risk-score">{illness.score}<small>/100</small></span>
                    </button>

                    <div className="risk-bar">
                      <div className={`risk-bar-fill band-${illness.band}`} style={{ width: `${illness.score}%` }} />
                    </div>

                    <div className="risk-affected-count">
                      {illness.affected.length} familiar{illness.affected.length === 1 ? 'e' : 'i'} affett{illness.affected.length === 1 ? 'o' : 'i'}
                      {expanded === illness.key ? '' : ' — clicca per il dettaglio'}
                    </div>

                    {expanded === illness.key && (
                      <ul className="risk-affected-list">
                        {illness.affected.map(affected => (
                          <li key={`${illness.key}-${affected.personId}`}>
                            <button
                              className="birthday-name"
                              onClick={() => { if (onSelectPerson) onSelectPerson(affected.personId); }}
                            >
                              {affected.name}
                            </button>
                            <span className="risk-affected-meta">
                              {affected.generationLabel} • parentela {Math.round(affected.kinship * 100)}% • gravità {affected.severity}
                            </span>
                            {affected.notes && <span className="risk-affected-meta">{affected.notes}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="xmind-help-box">
            <strong>Come viene calcolato</strong>
            <ul>
              <li>Ogni familiare affetto pesa in base al coefficiente di parentela: genitore 50%, nonno 25%, bisnonno 12,5%.</li>
              <li>Il peso è modulato dalla gravità indicata nella scheda: lieve ×0,5 · moderata ×0,75 · grave ×1.</li>
              <li>La somma dei contributi viene convertita in un punteggio 0-100 con una curva di saturazione.</li>
              <li>Il modello ignora la modalità di trasmissione della singola patologia e i fattori ambientali.</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
