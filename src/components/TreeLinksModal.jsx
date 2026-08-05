import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, GitMerge, Check, Ban, Trash2, Download, Plus, RefreshCw, Info } from 'lucide-react';
import { storage } from '../services/storage';

function personLabel(person) {
  if (!person) return 'Persona sconosciuta';
  const name = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Senza nome';
  const dates = [person.birth_date, person.death_date].filter(Boolean).join(' – ');
  return dates ? `${name} (${dates})` : name;
}

export default function TreeLinksModal({
  isOpen,
  onClose,
  treeId,
  treeName = '',
  people = [],
  canManageTree = false,
  canEditTree = false,
  onChanged
}) {
  const [links, setLinks] = useState([]);
  const [trees, setTrees] = useState([]);
  const [peopleByTree, setPeopleByTree] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  // Form di creazione innesto
  const [showForm, setShowForm] = useState(false);
  const [myPersonId, setMyPersonId] = useState('');
  const [targetTreeId, setTargetTreeId] = useState('');
  const [targetPersonId, setTargetPersonId] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reload = useCallback(async () => {
    if (!treeId) return;
    setIsLoading(true);
    setError('');
    try {
      const [linkList, treeList] = await Promise.all([
        storage.getTreeLinks(treeId),
        storage.getTrees()
      ]);
      setLinks(linkList);
      setTrees(treeList);

      // Carica le persone degli alberi coinvolti per poter mostrare i nomi
      const involved = new Set();
      linkList.forEach(link => {
        involved.add(link.source_tree_id);
        involved.add(link.target_tree_id);
      });
      involved.delete(treeId);

      const loaded = {};
      await Promise.all(Array.from(involved).map(async (id) => {
        try {
          loaded[id] = await storage.getPeople(id);
        } catch {
          loaded[id] = [];
        }
      }));
      setPeopleByTree(loaded);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    if (isOpen) reload();
  }, [isOpen, reload]);

  const treeNameById = useMemo(
    () => new Map(trees.map(tree => [tree.id, tree.name])),
    [trees]
  );

  const findPerson = useCallback((tid, pid) => {
    const list = tid === treeId ? people : (peopleByTree[tid] || []);
    return list.find(person => person.id === pid) || null;
  }, [treeId, people, peopleByTree]);

  // Alberi su cui posso innestarmi: tutti quelli visibili tranne il mio
  const linkableTrees = useMemo(
    () => trees.filter(tree => tree.id !== treeId && (tree.link_permission || 'moderated') !== 'none'),
    [trees, treeId]
  );

  const targetPeople = useMemo(() => {
    if (!targetTreeId) return [];
    return peopleByTree[targetTreeId] || [];
  }, [targetTreeId, peopleByTree]);

  const handleTargetTreeChange = async (id) => {
    setTargetTreeId(id);
    setTargetPersonId('');
    if (id && !peopleByTree[id]) {
      try {
        const list = await storage.getPeople(id);
        setPeopleByTree(prev => ({ ...prev, [id]: list }));
      } catch (err) {
        setError(`Impossibile leggere le persone dell’albero selezionato: ${err.message}`);
      }
    }
  };

  const handleCreate = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const created = await storage.requestTreeLink({
        sourceTreeId: treeId,
        sourcePersonId: myPersonId,
        targetTreeId,
        targetPersonId,
        note
      });
      setShowForm(false);
      setMyPersonId('');
      setTargetTreeId('');
      setTargetPersonId('');
      setNote('');
      await reload();
      if (onChanged) onChanged();
      alert(created.status === 'approved'
        ? 'Innesto creato e già attivo.'
        : 'Richiesta inviata: sarà attiva dopo l’approvazione del proprietario dell’albero.');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const runAction = async (linkId, action) => {
    setError('');
    setBusyId(linkId);
    try {
      await action();
      await reload();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleImport = (link) => {
    const branchName = treeNameById.get(link.source_tree_id) || 'ramo collegato';
    if (!window.confirm(
      `Copiare le persone di "${branchName}" dentro "${treeName}"?\n\n` +
      'Le persone verranno duplicate nel tuo albero e da quel momento non seguiranno ' +
      'più gli aggiornamenti fatti dall’autore del ramo.'
    )) return;

    runAction(link.id, async () => {
      const result = await storage.importLinkedBranch(link.id);
      alert(`Importate ${result.importedPeople} persone e ${result.importedUnions} relazioni.`);
    });
  };

  if (!isOpen) return null;

  const incoming = links.filter(link => link.target_tree_id === treeId);
  const outgoing = links.filter(link => link.source_tree_id === treeId);
  const pendingIncoming = incoming.filter(link => link.status === 'pending');

  const renderLink = (link, direction) => {
    const isIncoming = direction === 'incoming';
    const otherTreeId = isIncoming ? link.source_tree_id : link.target_tree_id;
    const myPerson = findPerson(treeId, isIncoming ? link.target_person_id : link.source_person_id);
    const otherPerson = findPerson(otherTreeId, isIncoming ? link.source_person_id : link.target_person_id);

    return (
      <div key={link.id} className={`tree-link-item status-${link.status}`}>
        <div className="tree-link-main">
          <div className="tree-link-people">
            <strong>{personLabel(myPerson)}</strong>
            <span className="tree-link-arrow">≡</span>
            <strong>{personLabel(otherPerson)}</strong>
          </div>
          <div className="tree-link-meta">
            <span className={`tree-link-badge status-${link.status}`}>
              {link.status === 'approved' ? 'Attivo' : link.status === 'pending' ? 'In attesa' : 'Rifiutato'}
            </span>
            {isIncoming ? 'Ramo: ' : 'Innestato su: '}
            <em>{treeNameById.get(otherTreeId) || 'Albero non visibile'}</em>
            {link.note ? ` — “${link.note}”` : ''}
          </div>
        </div>

        <div className="tree-link-actions">
          {isIncoming && link.status === 'pending' && canManageTree && (
            <>
              <button
                className="btn btn-primary"
                disabled={busyId === link.id}
                onClick={() => runAction(link.id, () => storage.reviewTreeLink(link.id, true))}
              >
                <Check size={14} /> Approva
              </button>
              <button
                className="btn btn-secondary"
                disabled={busyId === link.id}
                onClick={() => runAction(link.id, () => storage.reviewTreeLink(link.id, false))}
              >
                <Ban size={14} /> Rifiuta
              </button>
            </>
          )}

          {isIncoming && link.status === 'approved' && canManageTree && (
            <button
              className="btn btn-secondary"
              disabled={busyId === link.id}
              onClick={() => handleImport(link)}
              title="Copia le persone del ramo dentro questo albero"
            >
              <Download size={14} /> Importa
            </button>
          )}

          {(canManageTree || (!isIncoming && canEditTree)) && (
            <button
              className="btn btn-danger"
              disabled={busyId === link.id}
              onClick={() => {
                if (window.confirm('Rimuovere questo innesto? I due alberi resteranno separati e nessun dato verrà cancellato.')) {
                  runAction(link.id, () => storage.deleteTreeLink(link.id));
                }
              }}
              title="Sgancia i due alberi"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container glass large links-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitMerge size={20} className="logo-icon" />
            Innesti fra alberi
            {pendingIncoming.length > 0 && (
              <span className="tree-link-badge status-pending">{pendingIncoming.length} da approvare</span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="btn-icon" onClick={reload} title="Ricarica">
              <RefreshCw size={16} />
            </button>
            <button className="btn-icon" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {error && <div className="alert-box alert-error">{error}</div>}

          <div className="xmind-help-box" style={{ display: 'flex', gap: '8px' }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              Un innesto dichiara che una persona di questo albero e una persona di un altro
              albero sono lo stesso individuo. I due alberi restano separati e ognuno resta
              modificabile solo dal suo proprietario: nella vista unificata i rami collegati
              appaiono in sola lettura.
            </span>
          </div>

          {/* Creazione nuovo innesto */}
          {canEditTree && (
            <div className="glass" style={{ padding: '16px', borderRadius: '12px' }}>
              {!showForm ? (
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                  <Plus size={16} /> Innesta questo albero su un altro
                </button>
              ) : (
                <>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '12px' }}>Nuovo innesto</h4>

                  <div className="form-group">
                    <label>Persona di “{treeName}”</label>
                    <select className="form-control" value={myPersonId} onChange={(e) => setMyPersonId(e.target.value)}>
                      <option value="">— seleziona —</option>
                      {people.map(person => (
                        <option key={person.id} value={person.id}>{personLabel(person)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Albero di destinazione</label>
                    <select className="form-control" value={targetTreeId} onChange={(e) => handleTargetTreeChange(e.target.value)}>
                      <option value="">— seleziona —</option>
                      {linkableTrees.map(tree => (
                        <option key={tree.id} value={tree.id}>{tree.name}</option>
                      ))}
                    </select>
                    {linkableTrees.length === 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Nessun altro albero visibile accetta innesti.
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Persona corrispondente nell’albero di destinazione</label>
                    <select
                      className="form-control"
                      value={targetPersonId}
                      onChange={(e) => setTargetPersonId(e.target.value)}
                      disabled={!targetTreeId}
                    >
                      <option value="">— seleziona —</option>
                      {targetPeople.map(person => (
                        <option key={person.id} value={person.id}>{personLabel(person)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Nota per il proprietario (facoltativa)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Es. Sono il nipote di Marco, documento il ramo di Torino."
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Annulla</button>
                    <button
                      className="btn btn-primary"
                      onClick={handleCreate}
                      disabled={isSubmitting || !myPersonId || !targetTreeId || !targetPersonId}
                    >
                      {isSubmitting ? 'Invio…' : 'Richiedi innesto'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {isLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Caricamento innesti…</p>
          ) : (
            <>
              <div>
                <h4 className="tree-link-section-title">Rami agganciati a questo albero ({incoming.length})</h4>
                {incoming.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                    Nessun altro utente ha ancora agganciato un proprio ramo.
                  </p>
                ) : (
                  <div className="tree-link-list">{incoming.map(link => renderLink(link, 'incoming'))}</div>
                )}
              </div>

              <div>
                <h4 className="tree-link-section-title">Alberi su cui questo albero è innestato ({outgoing.length})</h4>
                {outgoing.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                    Questo albero non è agganciato a nessun altro.
                  </p>
                ) : (
                  <div className="tree-link-list">{outgoing.map(link => renderLink(link, 'outgoing'))}</div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
