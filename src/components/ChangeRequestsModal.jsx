import React, { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { storage } from '../services/storage';

const labels = {
  add_person: 'Aggiunta persona', update_person: 'Modifica persona', delete_person: 'Eliminazione persona',
  add_union: 'Aggiunta relazione', update_union: 'Modifica relazione', delete_union: 'Eliminazione relazione'
};

export default function ChangeRequestsModal({ treeId, onClose, onReviewed }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setRequests(await storage.getChangeRequests(treeId)); }
    catch (error) { alert(error.message); }
    finally { setLoading(false); }
  }, [treeId]);
  useEffect(() => { load(); }, [load]);
  const review = async (id, approve) => {
    await storage.reviewChangeRequest(id, approve);
    await load();
    if (approve) onReviewed();
  };
  return <div className="modal-overlay" onClick={onClose}>
    <div className="modal-container glass" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h3>Modifiche da approvare</h3><button className="btn-icon" onClick={onClose}><X size={18}/></button></div>
      <div className="modal-body">
        {loading ? <p>Caricamento…</p> : requests.length === 0 ? <p>Nessuna modifica in attesa.</p> : requests.map(req =>
          <div key={req.id} className="glass" style={{padding: 14, marginBottom: 10}}>
            <strong>{req.proposer?.first_name ? `${req.proposer.first_name} ${req.proposer.last_name || ''}` : req.proposer_name}</strong>
            <div style={{fontSize: '.85rem', color: 'var(--text-muted)', margin: '6px 0 12px'}}>{req.operations.map(op => labels[op.action] || op.action).join(', ')}</div>
            <details style={{marginBottom: 12}}><summary>Dettagli proposta</summary><pre style={{whiteSpace:'pre-wrap', fontSize:'.75rem'}}>{JSON.stringify(req.operations, null, 2)}</pre></details>
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-primary" onClick={() => review(req.id, true)}><Check size={16}/> Approva</button>
              <button className="btn btn-danger" onClick={() => review(req.id, false)}><X size={16}/> Rifiuta</button>
            </div>
          </div>)}
      </div>
    </div>
  </div>;
}
