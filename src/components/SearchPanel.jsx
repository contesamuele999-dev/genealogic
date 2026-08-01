import React, { useState, useEffect, useRef } from 'react';
import { Search, HeartPulse, FileText, Calendar, X } from 'lucide-react';

export default function SearchPanel({ people, onSelectPerson }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Cerca al variare di query o delle persone
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase();
    
    const filtered = people.map(p => {
      let score = 0;
      let matchReason = '';

      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      const reverseName = `${p.last_name} ${p.first_name}`.toLowerCase();

      // 1. Corrispondenza sul nome/cognome
      if (fullName.includes(q) || reverseName.includes(q)) {
        score += 10;
        matchReason = 'Corrispondenza nome';
      }

      // 2. Corrispondenza sulle malattie
      if (Array.isArray(p.illnesses)) {
        const matchingIllness = p.illnesses.find(ill => ill.name.toLowerCase().includes(q));
        if (matchingIllness) {
          score += 5;
          matchReason = `Patologia: ${matchingIllness.name}`;
        }
      }

      // 3. Corrispondenza sulle note
      if (p.notes && p.notes.toLowerCase().includes(q)) {
        score += 3;
        // Prende uno snippet delle note
        const startIdx = p.notes.toLowerCase().indexOf(q);
        const snippet = p.notes.substring(Math.max(0, startIdx - 10), Math.min(p.notes.length, startIdx + 20));
        matchReason = `Nelle note: "...${snippet}..."`;
      }

      // 4. Corrispondenza sull'anno di nascita
      if (p.birth_date && p.birth_date.includes(q)) {
        score += 2;
        matchReason = `Anno di nascita: ${p.birth_date}`;
      }

      return { person: p, score, matchReason };
    })
    .filter(res => res.score > 0)
    .sort((a, b) => b.score - a.score);

    setResults(filtered);
  }, [query, people]);

  // Chiude il dropdown quando si clicca fuori
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleItemClick = (person) => {
    onSelectPerson(person.id);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="search-container" ref={dropdownRef}>
      <Search size={16} className="search-icon-left" />
      <input
        type="text"
        className="search-input"
        placeholder="Ricerca per nome, malattie, note..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
      />
      {query && (
        <button 
          className="btn-icon" 
          onClick={() => { setQuery(''); setResults([]); }}
          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', padding: '4px' }}
        >
          <X size={14} />
        </button>
      )}

      {isOpen && results.length > 0 && (
        <div className="search-results-dropdown glass">
          <div style={{ padding: '8px 16px', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
            Risultati Trovati ({results.length})
          </div>
          {results.map(({ person, matchReason }) => {
            const isIllness = matchReason.startsWith('Patologia');
            const isNotes = matchReason.startsWith('Nelle note');

            return (
              <div
                key={person.id}
                className="search-result-item"
                onClick={() => handleItemClick(person)}
              >
                <div className={`node-avatar avatar-${person.gender}`} style={{ width: '28px', height: '28px', fontSize: '0.75rem', flexShrink: 0 }}>
                  {person.first_name[0] || ''}{person.last_name[0] || ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {person.first_name} {person.last_name}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isIllness && <HeartPulse size={12} style={{ color: 'var(--accent-rose)' }} />}
                    {isNotes && <FileText size={12} style={{ color: 'var(--accent-amber)' }} />}
                    {!isIllness && !isNotes && <Calendar size={12} />}
                    {matchReason}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isOpen && query && results.length === 0 && (
        <div className="search-results-dropdown glass" style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Nessun familiare trovato per "{query}"
        </div>
      )}
    </div>
  );
}
