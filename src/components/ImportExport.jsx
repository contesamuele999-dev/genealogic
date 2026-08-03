import React, { useState } from 'react';
import { X, Upload, FileText, AlertCircle, Check } from 'lucide-react';
import { parseTextOutline, parseXMindFile } from '../services/xmindParser';

export default function ImportExport({ treeId, onImportComplete, onClose }) {
  const [activeTab, setActiveTab] = useState('xmind');
  const [textOutline, setTextOutline] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const handleTextImport = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (!textOutline.trim()) {
      setErrorMsg('Inserisci del testo strutturato prima di procedere.');
      return;
    }

    try {
      const { people, unions } = parseTextOutline(textOutline, treeId);
      if (people.length === 0) {
        setErrorMsg('Nessun familiare rilevato. Verifica la formattazione.');
        return;
      }
      await onImportComplete(people, unions);
      setSuccessMsg(`Importazione completata con successo! Caricati ${people.length} persone e ${unions.length} unioni.`);
      setTextOutline('');
    } catch (err) {
      setErrorMsg(`Errore nell'analisi del testo: ${err.message}`);
    }
  };

  const processFile = async (file) => {
    setErrorMsg('');
    setSuccessMsg('');
    
    if (!file.name.endsWith('.xmind')) {
      setErrorMsg('Carica solo file validi con estensione .xmind');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target.result;
          const { people, unions } = await parseXMindFile(buffer, treeId);
          if (people.length === 0) {
            setErrorMsg('Nessun nodo trovato nella mappa mentale.');
            return;
          }
          await onImportComplete(people, unions);
          setSuccessMsg(`Importazione XMind riuscita! Rilevati ${people.length} familiari e ${unions.length} unioni.`);
        } catch (err) {
          setErrorMsg(`Errore nell'estrazione del file XMind: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setErrorMsg(`Errore di lettura file: ${err.message}`);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container glass large" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header">
          <h3>Importa / Esporta Albero</h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ padding: '0 24px' }}>
          <button
            className={`tab-btn ${activeTab === 'xmind' ? 'active' : ''}`}
            onClick={() => setActiveTab('xmind')}
          >
            File XMind (.xmind)
          </button>
          <button
            className={`tab-btn ${activeTab === 'outline' ? 'active' : ''}`}
            onClick={() => setActiveTab('outline')}
          >
            Testo Strutturato (Outline)
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {errorMsg && (
            <div className="alert-box alert-error">
              <AlertCircle size={16} />
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="alert-box alert-success">
              <Check size={16} />
              {successMsg}
            </div>
          )}

          {activeTab === 'xmind' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Puoi importare un albero genealogico disegnato su una mappa mentale **XMind**.
              </p>

              <div
                className={`glass ${isDragOver ? 'drag-over' : ''}`}
                style={{
                  border: isDragOver ? '2px dashed var(--accent-teal)' : '2px dashed var(--border-color)',
                  borderRadius: '12px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)'
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => document.getElementById('xmind-file-input').click()}
              >
                <Upload size={32} style={{ color: 'var(--accent-teal)', marginBottom: '12px' }} />
                <p style={{ fontWeight: 600, marginBottom: '4px' }}>Trascina qui il file .xmind</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>oppure clicca per sfogliare i file</p>
                <input
                  type="file"
                  id="xmind-file-input"
                  accept=".xmind"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </div>

              <div className="xmind-help-box">
                <strong>💡 Regole di formattazione XMind:</strong>
                <ul>
                  <li>Il nodo principale rappresenta i capostipiti (es: <code>Giovanni Rossi + Maria Bianchi</code>).</li>
                  <li>Usa il simbolo <code>+</code> o <code>&</code> per indicare che due persone formano una coppia.</li>
                  <li>I sotto-nodi (sotto-topic) rappresentano i figli della coppia.</li>
                  <li>Puoi inserire metadati tra parentesi quadre: <code>[Nato: 1980, Note: vive a Milano, Malattie: Diabete]</code>.</li>
                  <li>Se un figlio ha una propria famiglia, scrivi <code>Nome Figlio + Nome Coniuge</code> per far discendere altri figli da loro.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'outline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Incolla una gerarchia di testo indentata. Usa i tasti TAB o gli spazi per strutturare le generazioni.
              </p>
              
              <textarea
                className="form-control"
                rows={10}
                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                placeholder={
`Giovanni Rossi + Maria Bianchi [N: 1940]
  Marco Rossi + Carla Neri [N: 1965]
    Sara Rossi [N: 1992, Malattia: Ipertensione]
    Luca Rossi [N: 1995]
  Anna Rossi [N: 1970]
    Tommaso Bianchi [N: 2000]`
                }
                value={textOutline}
                onChange={(e) => setTextOutline(e.target.value)}
              />

              <button className="btn btn-primary" onClick={handleTextImport} style={{ alignSelf: 'flex-end' }}>
                <FileText size={16} /> Importa Testo
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Chiudi
          </button>
        </div>

      </div>
    </div>
  );
}
