import React, { useState } from 'react';
import { X, Cake, Mail, Calendar, Check, Send } from 'lucide-react';
import { getUpcomingBirthdays, generateBirthdayEmailContent } from '../services/birthdayService';

export default function BirthdayModal({ isOpen, onClose, people = [], treeName = '', onSelectPerson }) {
  const [selectedDays, setSelectedDays] = useState(60);
  const [copiedId, setCopiedId] = useState(null);

  if (!isOpen) return null;

  const upcomingBirthdays = getUpcomingBirthdays(people, selectedDays);

  const handleCopyEmail = (item) => {
    const { subject, body } = generateBirthdayEmailContent(item, treeName);
    const fullText = `Oggetto: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(fullText);
    setCopiedId(item.person.id);
    setTimeout(() => setCopiedId(null), 3500);
  };

  const handleOpenMailClient = (item) => {
    const { subject, body } = generateBirthdayEmailContent(item, treeName);
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  };

  return (
    <div className="modal-backdrop glass-backdrop flex-center">
      <div className="modal-content glass-card modal-lg animate-scale-in">
        <div className="modal-header border-b">
          <div className="flex-align gap-12">
            <div className="avatar-circle avatar-amber">
              <Cake size={24} className="text-amber" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Compleanni Parenti in Vita</h2>
              <p className="text-sm text-muted">
                Avvisa i membri della famiglia dei compleanni imminenti
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Filtro Orizzonte Temporale */}
        <div className="p-16 border-b flex-between flex-wrap gap-12 bg-app-subtle">
          <span className="text-sm font-medium flex-align gap-6">
            <Calendar size={16} /> Mostra compleanni nei prossimi:
          </span>
          <div className="flex-align gap-8">
            {[7, 15, 30, 60].map(days => (
              <button
                key={days}
                className={`btn btn-sm ${selectedDays === days ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedDays(days)}
              >
                {days} giorni
              </button>
            ))}
          </div>
        </div>

        {/* Lista Compleanni */}
        <div className="modal-body p-20 max-h-400 overflow-y-auto">
          {upcomingBirthdays.length === 0 ? (
            <div className="empty-state text-center p-32">
              <Cake size={48} className="text-muted mb-12 opacity-50" />
              <p className="text-lg font-semibold">Nessun compleanno nei prossimi {selectedDays} giorni</p>
              <p className="text-sm text-muted">Non ci sono parenti in vita che compiono gli anni in questo intervallo.</p>
            </div>
          ) : (
            <div className="flex-col gap-12">
              {upcomingBirthdays.map((item) => {
                const { person, daysRemaining, nextBirthday, turningAge } = item;
                const isToday = daysRemaining === 0;
                const isTomorrow = daysRemaining === 1;

                return (
                  <div
                    key={person.id}
                    className={`p-16 rounded-12 border flex-between flex-wrap gap-12 transition-all ${
                      isToday
                        ? 'border-amber bg-amber-subtle glow-amber'
                        : 'bg-card-hover'
                    }`}
                  >
                    <div className="flex-align gap-12">
                      <div
                        className={`badge-days ${
                          isToday ? 'bg-amber text-inverse font-bold' : 'bg-secondary'
                        }`}
                      >
                        {isToday ? '🎉 OGGI!' : isTomorrow ? 'Domani' : `${daysRemaining} gg`}
                      </div>
                      <div>
                        <button
                          className="text-base font-bold link-hover text-left"
                          onClick={() => {
                            if (onSelectPerson) onSelectPerson(person.id);
                            onClose();
                          }}
                        >
                          {person.first_name} {person.last_name}
                        </button>
                        <p className="text-xs text-muted">
                          {nextBirthday.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                          {turningAge && ` • Compie ${turningAge} anni`}
                        </p>
                      </div>
                    </div>

                    <div className="flex-align gap-8">
                      <button
                        className="btn btn-sm btn-secondary flex-align gap-6"
                        onClick={() => handleCopyEmail(item)}
                        title="Copia bozza email per i membri"
                      >
                        {copiedId === person.id ? <Check size={14} className="text-emerald" /> : <Mail size={14} />}
                        {copiedId === person.id ? 'Copiato!' : 'Copia Bozza'}
                      </button>
                      <button
                        className="btn btn-sm btn-primary flex-align gap-6"
                        onClick={() => handleOpenMailClient(item)}
                        title="Apri client email predefinito"
                      >
                        <Send size={14} />
                        Invia Email
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer border-t p-16 flex-end">
          <button className="btn btn-secondary" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
