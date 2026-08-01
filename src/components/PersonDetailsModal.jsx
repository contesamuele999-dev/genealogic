import React, { useState, useEffect } from 'react';
import { X, Save, Edit2, Trash2, HeartPulse, FileText, User, Plus } from 'lucide-react';

export default function PersonDetailsModal({
  person,
  onClose,
  onSave,
  onDelete,
  canEdit
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  
  // Dati modulo
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('M');
  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [illnesses, setIllnesses] = useState([]);

  // Nuova malattia temporanea
  const [newIllnessName, setNewIllnessName] = useState('');
  const [newIllnessSeverity, setNewIllnessSeverity] = useState('lieve');
  const [newIllnessNotes, setNewIllnessNotes] = useState('');

  // Carica i dati quando cambia la persona
  useEffect(() => {
    if (person) {
      setFirstName(person.first_name || '');
      setLastName(person.last_name || '');
      setGender(person.gender || 'M');
      setBirthDate(person.birth_date || '');
      setDeathDate(person.death_date || '');
      setBirthPlace(person.birth_place || '');
      setNotes(person.notes || '');
      setIllnesses(person.illnesses || []);
      // Apri direttamente in modalità modifica se è una nuova persona
      setIsEditing(person.id === 'new');
      setActiveTab('general');
    }
  }, [person]);

  const handleSave = () => {
    if (!firstName.trim()) {
      alert('Il nome è obbligatorio.');
      return;
    }

    onSave(person.id, {
      tree_id: person.tree_id,
      first_name: firstName,
      last_name: lastName,
      gender,
      birth_date: birthDate,
      death_date: deathDate,
      birth_place: birthPlace,
      notes,
      illnesses
    });
    setIsEditing(false);
  };

  const handleAddIllness = () => {
    if (!newIllnessName.trim()) return;
    const newIll = {
      id: Date.now().toString(),
      name: newIllnessName.trim(),
      severity: newIllnessSeverity,
      notes: newIllnessNotes.trim()
    };
    setIllnesses([...illnesses, newIll]);
    setNewIllnessName('');
    setNewIllnessNotes('');
    setNewIllnessSeverity('lieve');
  };

  const handleRemoveIllness = (id) => {
    setIllnesses(illnesses.filter(i => i.id !== id));
  };

  const handleDelete = () => {
    if (window.confirm(`Sei sicuro di voler eliminare ${firstName} ${lastName}? Questa operazione rimuoverà anche tutte le sue relazioni familiari.`)) {
      onDelete(person.id);
    }
  };

  if (!person) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container glass" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={20} className="logo-icon" />
            {isEditing ? 'Modifica Scheda Familiare' : 'Scheda Familiare'}
          </h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs (Solo in Edit Mode o se ci sono dati nelle note/salute in View Mode) */}
        <div className="tabs" style={{ padding: '0 24px' }}>
          <button
            className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            Anagrafica
          </button>
          <button
            className={`tab-btn ${activeTab === 'health' ? 'active' : ''}`}
            onClick={() => setActiveTab('health')}
          >
            Salute {illnesses.length > 0 ? `(${illnesses.length})` : ''}
          </button>
          <button
            className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            Note
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {activeTab === 'general' && (
            <div>
              {isEditing ? (
                <>
                  <div className="form-group row">
                    <div>
                      <label>Nome *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Nome"
                      />
                    </div>
                    <div>
                      <label>Cognome</label>
                      <input
                        type="text"
                        className="form-control"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Cognome"
                      />
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label>Sesso</label>
                    <select
                      className="form-control"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                    >
                      <option value="M">Maschio</option>
                      <option value="F">Femmina</option>
                    </select>
                  </div>

                  <div className="form-group row">
                    <div>
                      <label>Data di nascita (o anno)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        placeholder="Es: 1954 o 12/05/1954"
                      />
                    </div>
                    <div>
                      <label>Luogo di nascita</label>
                      <input
                        type="text"
                        className="form-control"
                        value={birthPlace}
                        onChange={(e) => setBirthPlace(e.target.value)}
                        placeholder="Es: Roma"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Data di decesso (se defunto)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={deathDate}
                      onChange={(e) => setDeathDate(e.target.value)}
                      placeholder="Es: 2021"
                    />
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className={`node-avatar avatar-${gender}`} style={{ width: '60px', height: '60px', fontSize: '1.5rem' }}>
                      {firstName[0] || ''}{lastName[0] || ''}
                    </div>
                    <div>
                      <h2>{firstName} {lastName}</h2>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Genere: {gender === 'M' ? 'Maschio' : 'Femmina'}
                      </p>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {birthDate && (
                      <p><strong>Nascita:</strong> {birthDate} {birthPlace ? `a ${birthPlace}` : ''}</p>
                    )}
                    {deathDate && (
                      <p><strong>Decesso:</strong> {deathDate}</p>
                    )}
                    {!birthDate && !deathDate && (
                      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Nessuna informazione anagrafica inserita.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'health' && (
            <div>
              {isEditing && (
                <div className="glass" style={{ padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                  <h4 style={{ marginBottom: '12px', fontSize: '0.9rem' }}>Nuova Malattia / Tendenza Ereditaria</h4>
                  <div className="form-group row">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Nome patologia (es. Diabete)"
                      value={newIllnessName}
                      onChange={(e) => setNewIllnessName(e.target.value)}
                    />
                    <select
                      className="form-control"
                      value={newIllnessSeverity}
                      onChange={(e) => setNewIllnessSeverity(e.target.value)}
                    >
                      <option value="lieve">Lieve</option>
                      <option value="moderata">Moderata</option>
                      <option value="grave">Grave</option>
                    </select>
                  </div>
                  <div className="form-group row" style={{ marginBottom: 0 }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Note o dettagli (opzionale)"
                      value={newIllnessNotes}
                      onChange={(e) => setNewIllnessNotes(e.target.value)}
                    />
                    <button className="btn btn-primary" onClick={handleAddIllness} style={{ flex: 'none', width: '80px' }}>
                      <Plus size={16} /> Aggiungi
                    </button>
                  </div>
                </div>
              )}

              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '0.95rem' }}>
                <HeartPulse size={16} className="logo-icon" />
                Quadro Clinico Familiare
              </h4>
              
              {illnesses.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>Nessuna patologia o tendenza medica registrata.</p>
              ) : (
                <div className="illness-list">
                  {illnesses.map(ill => (
                    <div key={ill.id} className="illness-item">
                      <div className="illness-info">
                        <span className="illness-name">{ill.name}</span>
                        {ill.notes && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ill.notes}</span>}
                        <span className={`illness-severity severity-${ill.severity}`}>
                          {ill.severity}
                        </span>
                      </div>
                      {isEditing && (
                        <button className="btn-icon" onClick={() => handleRemoveIllness(ill.id)} style={{ color: 'var(--accent-rose)' }}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              <div style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }} className="xmind-help-box">
                ℹ️ Mappare le patologie ereditarie (es. ipertensione, diabete, cardiopatie) aiuta a comprendere le predisposizioni genetiche del ramo familiare nel tempo.
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div>
              {isEditing ? (
                <div className="form-group">
                  <label>Note Generali</label>
                  <textarea
                    className="form-control"
                    rows={6}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Informazioni aggiuntive, aneddoti, professione, etc."
                  />
                </div>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                  {notes ? (
                    <div>
                      <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '0.95rem' }}>
                        <FileText size={16} className="logo-icon" />
                        Biografia e Note
                      </h4>
                      {notes}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>Nessuna nota aggiuntiva disponibile per questo membro della famiglia.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {canEdit && (
            <>
              {isEditing ? (
                <>
                  <button className="btn btn-secondary" onClick={() => {
                    if (person.id === 'new') { onClose(); } else { setIsEditing(false); }
                  }}>
                    Annulla
                  </button>
                  <button className="btn btn-primary" onClick={handleSave}>
                    <Save size={16} />
                    {person.id === 'new' ? 'Crea Persona' : 'Salva Modifiche'}
                  </button>
                </>
              ) : (
                <>
                  {onDelete && (
                    <button className="btn btn-danger" onClick={handleDelete} style={{ marginRight: 'auto' }}>
                      <Trash2 size={16} />
                      Elimina
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
                    <Edit2 size={16} />
                    Modifica
                  </button>
                </>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
