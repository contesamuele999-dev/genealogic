import React, { useState } from 'react';
import { X, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { storage } from '../services/storage';

export default function AuthModal({ onClose, onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Tutti i campi sono obbligatori.');
      setIsLoading(false);
      return;
    }

    try {
      if (isRegister) {
        if (!firstName.trim()) {
          setErrorMsg('Il nome è obbligatorio per la registrazione.');
          setIsLoading(false);
          return;
        }
        await storage.signUp(email, password, firstName, lastName);
        alert('Registrazione completata! Se sei il primo utente sarai amministratore, altrimenti attendi l\'approvazione del tuo account.');
      } else {
        await storage.signIn(email, password);
      }
      
      await onAuthSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Si è verificato un errore durante l\'autenticazione.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container glass" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isRegister ? <UserPlus size={18} className="logo-icon" /> : <LogIn size={18} className="logo-icon" />}
            {isRegister ? 'Registrati' : 'Accedi al portale'}
          </h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {errorMsg && (
              <div className="alert-box alert-error">
                <AlertCircle size={16} />
                {errorMsg}
              </div>
            )}

            {isRegister && (
              <div className="form-group row">
                <div>
                  <label>Nome *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Mario"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label>Cognome</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Rossi"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                className="form-control"
                placeholder="nome@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer" style={{ flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
            <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ width: '100%' }}>
              {isLoading ? 'Attendere...' : isRegister ? 'Completa Registrazione' : 'Accedi'}
            </button>
            
            <button
              type="button"
              className="btn btn-secondary"
              style={{ borderWidth: 0, background: 'transparent' }}
              onClick={() => {
                setIsRegister(!isRegister);
                setErrorMsg('');
              }}
            >
              {isRegister ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
