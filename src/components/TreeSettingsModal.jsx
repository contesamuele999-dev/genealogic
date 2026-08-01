import React, { useState, useEffect } from 'react';
import { X, Save, Shield, Settings, Trash2 } from 'lucide-react';
import { storage } from '../services/storage';

export default function TreeSettingsModal({
  tree,
  onClose,
  onSave,
  onDelete
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [editPermission, setEditPermission] = useState('owner');
  const [selectedEditors, setSelectedEditors] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (tree) {
      setName(tree.name || '');
      setDescription(tree.description || '');
      setVisibility(tree.visibility || 'public');
      setEditPermission(tree.edit_permission || 'owner');
      
      const loadSettingsData = async () => {
        setIsLoading(true);
        try {
          // 1. Carica tutti gli utenti attivi
          const activeUsers = await storage.getUsersList();
          // Filtra via il proprietario dell'albero (ha già sempre i permessi)
          setUsersList(activeUsers.filter(u => u.id !== tree.owner_id));

          // 2. Carica gli editori correnti del tree
          const currentEditors = await storage.getTreeEditors(tree.id);
          setSelectedEditors(currentEditors);
        } catch (err) {
          console.error('Errore durante il caricamento impostazioni:', err);
        } finally {
          setIsLoading(false);
        }
      };

      loadSettingsData();
    }
  }, [tree]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Il nome dell\'albero è obbligatorio.');
      return;
    }

    try {
      // 1. Salva dati albero principali
      await onSave(tree.id, {
        ...tree,
        name: name.trim(),
        description: description.trim(),
        visibility,
        edit_permission: editPermission
      });

      // 2. Se impostato su 'specific', salva gli editori associati
      if (editPermission === 'specific') {
        await storage.setTreeEditors(tree.id, selectedEditors);
      }

      alert('Impostazioni salvate con successo!');
      onClose();
    } catch (err) {
      alert(`Errore nel salvataggio: ${err.message}`);
    }
  };

  const handleCheckboxChange = (userId) => {
    if (selectedEditors.includes(userId)) {
      setSelectedEditors(selectedEditors.filter(id => id !== userId));
    } else {
      setSelectedEditors([...selectedEditors, userId]);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`⚠️ ATTENZIONE: Sei sicuro di voler eliminare l'albero "${name}"? Questa azione è irreversibile e cancellerà TUTTE le persone e relazioni associate.`)) {
      onDelete(tree.id);
    }
  };

  if (!tree) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container glass" onClick={(e) => e.stopPropagation()}>
        
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={20} className="logo-icon" />
            Impostazioni Albero
          </h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Nome Albero Genealogico</label>
            <input
              type="text"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Famiglia Rossi"
            />
          </div>

          <div className="form-group">
            <label>Descrizione / Note Storiche</label>
            <textarea
              className="form-control"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve introduzione sulla famiglia o origini geografiche."
            />
          </div>

          {/* Livello di Visibilità (Privacy) */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={14} className="logo-icon" />
              Visibilità dell'Albero (Chi può vederlo)
            </label>
            <select
              className="form-control"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="public">Pubblico (Visibile a tutti)</option>
              <option value="restricted">Riservato (Solo ad utenti registrati e approvati)</option>
              <option value="private">Privato (Visibile solo al creatore)</option>
            </select>
          </div>

          {/* Permessi di Modifica */}
          <div className="form-group">
            <label>Abilitazione Modifiche (Chi può aggiungere o editare parenti)</label>
            <select
              className="form-control"
              value={editPermission}
              onChange={(e) => setEditPermission(e.target.value)}
            >
              <option value="owner">Solo Io (Creatore/Proprietario)</option>
              <option value="auth">Tutti gli utenti registrati ed approvati</option>
              <option value="specific">Solo utenti specifici selezionati sotto</option>
            </select>
          </div>

          {/* Selezione Editori Specifici (Solo se editPermission === 'specific') */}
          {editPermission === 'specific' && (
            <div className="glass" style={{ padding: '16px', borderRadius: '12px', marginTop: '12px' }}>
              <h4 style={{ fontSize: '0.85rem', marginBottom: '8px' }}>Seleziona Editori Autorizzati</h4>
              {isLoading ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Caricamento utenti...</p>
              ) : usersList.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                  Nessun altro utente registrato e approvato nel sistema.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto', paddingRight: '8px' }}>
                  {usersList.map(user => (
                    <label key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedEditors.includes(user.id)}
                        onChange={() => handleCheckboxChange(user.id)}
                        style={{ accentColor: 'var(--accent-teal)' }}
                      />
                      {user.first_name} {user.last_name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-danger" onClick={handleDelete}>
            <Trash2 size={16} /> Elimina Albero
          </button>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Annulla
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              <Save size={16} /> Salva Impostazioni
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
