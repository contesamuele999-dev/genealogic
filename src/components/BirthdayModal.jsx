import React, { useMemo, useState } from 'react';
import { X, Cake, Mail, Calendar, Check, Send, Info } from 'lucide-react';
import {
  getUpcomingBirthdays,
  getBirthdayCoverage,
  generateBirthdayEmailContent
} from '../services/birthdayService';
import { sendEmail } from '../services/emailService';

const DAY_FILTERS = [7, 15, 30, 60, 365];

export default function BirthdayModal({ isOpen, onClose, people = [], treeName = '', onSelectPerson }) {
  const [selectedDays, setSelectedDays] = useState(60);
  const [includeDeceased, setIncludeDeceased] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [recipients, setRecipients] = useState('');
  const [sendingId, setSendingId] = useState(null);

  const upcomingBirthdays = useMemo(
    () => getUpcomingBirthdays(people, selectedDays, new Date(), { includeDeceased }),
    [people, selectedDays, includeDeceased]
  );
  const coverage = useMemo(() => getBirthdayCoverage(people), [people]);

  if (!isOpen) return null;

  const handleCopyEmail = (item) => {
    const { subject, body } = generateBirthdayEmailContent(item, treeName);
    navigator.clipboard.writeText(`Oggetto: ${subject}\n\n${body}`);
    setCopiedId(item.person.id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  const handleSendEmail = async (item) => {
    if (!recipients.trim()) {
      alert('Inserisci almeno un indirizzo email destinatario.');
      return;
    }
    const { subject, body } = generateBirthdayEmailContent(item, treeName);
    setSendingId(item.person.id);
    try {
      await sendEmail({ to: recipients, subject, plain: body });
      alert('Email inviata tramite Maileroo.');
    } catch (error) {
      alert(`Invio non riuscito: ${error.message}`);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container glass large birthday-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cake size={20} style={{ color: 'var(--accent-amber)' }} />
            Compleanni in famiglia
          </h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="birthday-toolbar">
          <div className="birthday-filter-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <Calendar size={15} /> Prossimi
            </label>
            <div className="birthday-chips">
              {DAY_FILTERS.map(days => (
                <button
                  key={days}
                  className={`birthday-chip ${selectedDays === days ? 'active' : ''}`}
                  onClick={() => setSelectedDays(days)}
                >
                  {days === 365 ? '1 anno' : `${days} gg`}
                </button>
              ))}
            </div>
          </div>

          <label className="hud-checkbox-option" title="Mostra anche gli anniversari di nascita dei familiari defunti">
            <input
              type="checkbox"
              checked={includeDeceased}
              onChange={(e) => setIncludeDeceased(e.target.checked)}
            />
            <span>Includi defunti</span>
          </label>
        </div>

        <div className="modal-body">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Destinatari email</label>
            <input
              type="text"
              className="form-control"
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              placeholder="mario@esempio.it, lucia@esempio.it"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Separa più indirizzi con una virgola.
            </span>
          </div>

          {upcomingBirthdays.length === 0 ? (
            <div className="birthday-empty">
              <Cake size={44} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p style={{ fontWeight: 600 }}>
                Nessun compleanno nei prossimi {selectedDays === 365 ? '12 mesi' : `${selectedDays} giorni`}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Prova ad allargare l’intervallo o a completare le date di nascita nelle schede.
              </p>
            </div>
          ) : (
            <div className="birthday-list">
              {upcomingBirthdays.map((item) => {
                const { person, daysRemaining, nextBirthday, turningAge, alive } = item;
                const isToday = daysRemaining === 0;

                return (
                  <div key={person.id} className={`birthday-item ${isToday ? 'today' : ''}`}>
                    <div className={`birthday-badge ${isToday ? 'today' : ''}`}>
                      {isToday ? 'OGGI' : daysRemaining === 1 ? 'Domani' : `${daysRemaining} gg`}
                    </div>

                    <div className={`node-avatar avatar-${person.gender || 'M'}`}>
                      {(person.first_name || '?')[0]}{(person.last_name || '')[0] || ''}
                    </div>

                    <div className="birthday-info">
                      <button
                        className="birthday-name"
                        onClick={() => {
                          if (onSelectPerson) onSelectPerson(person.id);
                          onClose();
                        }}
                      >
                        {person.first_name} {person.last_name}
                      </button>
                      <span className="birthday-meta">
                        {nextBirthday.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                        {turningAge !== null && (alive ? ` • compie ${turningAge} anni` : ` • ${turningAge}° anniversario`)}
                        {!alive && ' • defunto'}
                      </span>
                    </div>

                    <div className="birthday-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleCopyEmail(item)}
                        title="Copia la bozza email"
                      >
                        {copiedId === person.id ? <Check size={14} /> : <Mail size={14} />}
                        {copiedId === person.id ? 'Copiato' : 'Bozza'}
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleSendEmail(item)}
                        title="Invia tramite Maileroo"
                        disabled={sendingId === person.id}
                      >
                        <Send size={14} />
                        {sendingId === person.id ? 'Invio…' : 'Invia'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="xmind-help-box" style={{ display: 'flex', gap: '8px' }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              Calcolo eseguito sulla data di nascita di tutti i {coverage.total} nodi dell’albero:{' '}
              <strong>{coverage.withUsableDate}</strong> con giorno e mese utilizzabili,{' '}
              {coverage.yearOnly} con il solo anno e {coverage.missing} senza data.
              I familiari con data di decesso sono esclusi salvo l’opzione “Includi defunti”.
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
