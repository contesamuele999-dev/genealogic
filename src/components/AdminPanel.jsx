import React, { useState, useEffect } from 'react';
import { X, Check, ShieldAlert, Users } from 'lucide-react';
import { storage } from '../services/storage';

export default function AdminPanel({ onClose }) {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [approvedUsers, setApprovedUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const pending = await storage.getPendingUsers();
      const approved = await storage.getUsersList();
      setPendingUsers(pending);
      setApprovedUsers(approved);
    } catch (err) {
      console.error('Errore durante il caricamento degli utenti:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleApprove = async (userId) => {
    try {
      await storage.approveUser(userId);
      alert('Utente approvato con successo!');
      loadUsers();
    } catch (err) {
      alert(`Errore nell'approvazione dell'utente: ${err.message}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container glass large" onClick={(e) => e.stopPropagation()}>
        
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={20} className="logo-icon" />
            Pannello di Amministrazione
          </h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Sezione Iscrizioni in Attesa */}
          <div>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Users size={16} className="logo-icon" />
              Iscrizioni da Approvare
            </h4>
            
            {isLoading ? (
              <p style={{ color: 'var(--text-muted)' }}>Caricamento...</p>
            ) : pendingUsers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                Nessuna richiesta di iscrizione in sospeso.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Cognome</th>
                      <th>Email / ID</th>
                      <th>Azione</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingUsers.map(user => (
                      <tr key={user.id}>
                        <td>{user.first_name}</td>
                        <td>{user.last_name || '—'}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{user.email || user.id}</td>
                        <td>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            onClick={() => handleApprove(user.id)}
                          >
                            <Check size={12} /> Approva
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sezione Utenti Attivi */}
          <div>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Users size={16} style={{ color: 'var(--accent-emerald)' }} />
              Utenti Approvati ed Attivi ({approvedUsers.length})
            </h4>
            {isLoading ? (
              <p style={{ color: 'var(--text-muted)' }}>Caricamento...</p>
            ) : approvedUsers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>Nessun utente attivo trovato.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Nome Completo</th>
                      <th>ID Profilo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedUsers.map(user => (
                      <tr key={user.id}>
                        <td>{user.first_name} {user.last_name}</td>
                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{user.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Chiudi
          </button>
        </div>

      </div>
    </div>
  );
}
