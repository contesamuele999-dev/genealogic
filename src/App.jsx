import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Network, Plus, ShieldAlert, LogIn, LogOut, Settings, Upload, AlertCircle, Cake, Share2, Check, Dna, Eye, EyeOff } from 'lucide-react';
import { storage } from './services/storage';
import { generateUUID } from './services/xmindParser';
import { getUpcomingBirthdays } from './services/birthdayService';
import { buildTreeShareUrl, getTreeIdFromUrl, replaceTreeInUrl } from './services/treeShare';

// Componenti
import GenealogyTree from './components/GenealogyTree';
import PersonDetailsModal from './components/PersonDetailsModal';
import SearchPanel from './components/SearchPanel';
import ImportExport from './components/ImportExport';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import TreeSettingsModal from './components/TreeSettingsModal';
import BirthdayModal from './components/BirthdayModal';
import ChangeRequestsModal from './components/ChangeRequestsModal';
import GeneticRiskModal from './components/GeneticRiskModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [trees, setTrees] = useState([]);
  const [activeTreeId, setActiveTreeId] = useState('');
  const [people, setPeople] = useState([]);
  const [unions, setUnions] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [canPropose, setCanPropose] = useState(false);
  const [canManageTree, setCanManageTree] = useState(false);
  const treeLoadRequestRef = useRef(0);

  // Stati di evidenziazione e modali
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [highlightedPersonId, setHighlightedPersonId] = useState(null);
  const [relativeToAdd, setRelativeToAdd] = useState(null); // { person, relation: 'parent'|'partner'|'child' }

  // Modali aperti
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showTreeSettings, setShowTreeSettings] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showBirthdays, setShowBirthdays] = useState(false);
  const [showChangeRequests, setShowChangeRequests] = useState(false);
  const [showGeneticRisk, setShowGeneticRisk] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // "Modalità clinica": le informazioni sanitarie e il calcolo del rischio ereditario
  // hanno una visibilità distinta dall'albero ufficiale. Sono accessibili solo a chi
  // gestisce l'albero e vanno sbloccate esplicitamente ad ogni sessione.
  const [clinicalMode, setClinicalMode] = useState(false);

  // Carica i dati utente
  const loadUser = useCallback(async () => {
    try {
      const user = await storage.getCurrentUser();
      setCurrentUser(user);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Carica la lista degli alberi visibili
  const loadTrees = useCallback(async () => {
    try {
      const list = await storage.getTrees();
      setTrees(list);
      
      // Imposta il primo albero come attivo se non ne è già selezionato uno valido
      if (list.length > 0) {
        const requestedTreeId = getTreeIdFromUrl();
        setActiveTreeId(currentId => {
          if (requestedTreeId && list.some(tree => tree.id === requestedTreeId)) return requestedTreeId;
          return currentId && list.some(tree => tree.id === currentId) ? currentId : list[0].id;
        });
      } else {
        setActiveTreeId('');
        setPeople([]);
        setUnions([]);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Carica persone, unioni e permessi per l'albero attivo
  const loadTreeDetails = useCallback(async () => {
    if (!activeTreeId) {
      setPeople([]);
      setUnions([]);
      setCanEdit(false);
      setCanPropose(false);
      setCanManageTree(false);
      return;
    }

    const requestId = ++treeLoadRequestRef.current;
    const sessionUserId = currentUser?.id || null;

    try {
      const [pList, uList, writePermission, proposePermission, managePermission] = await Promise.all([
        storage.getPeople(activeTreeId),
        storage.getUnions(activeTreeId),
        storage.canWriteTree(activeTreeId),
        storage.canProposeTree(activeTreeId),
        storage.canManageTree(activeTreeId)
      ]);
      if (requestId !== treeLoadRequestRef.current || sessionUserId !== (currentUser?.id || null)) return;
      setPeople(pList);
      setUnions(uList);
      setCanEdit(writePermission);
      setCanPropose(proposePermission);
      setCanManageTree(managePermission);
    } catch (err) {
      console.error(err);
    }
  }, [activeTreeId, currentUser]);

  // Inizializzazione iniziale
  useEffect(() => {
    const init = async () => {
      await loadUser();
    };
    init();
  }, [loadUser]);

  // Ricarica alberi quando cambia l'utente (cambiano i suoi permessi)
  useEffect(() => {
    loadTrees();
  }, [currentUser, loadTrees]);

  // Ricarica dettagli quando cambia l'albero selezionato
  useEffect(() => {
    loadTreeDetails();
    setHighlightedPersonId(null);
  }, [activeTreeId, loadTreeDetails]);

  // La modalità clinica non è mai "appiccicosa": si azzera cambiando albero o utente
  // e decade appena l'utente perde i permessi di gestione.
  useEffect(() => {
    setClinicalMode(false);
    setShowGeneticRisk(false);
  }, [activeTreeId, currentUser]);

  useEffect(() => {
    if (!canManageTree) {
      setClinicalMode(false);
      setShowGeneticRisk(false);
    }
  }, [canManageTree]);

  // Unico interruttore da cui dipende la visibilità di TUTTE le informazioni sanitarie.
  const healthVisible = canManageTree && clinicalMode;

  const handleCreateTree = async () => {
    const name = window.prompt("Inserisci il nome del nuovo Albero Genealogico:");
    if (!name || !name.trim()) return;

    try {
      const newTree = await storage.createTree(name.trim(), "Nuovo albero genealogico di famiglia");
      alert(`Albero "${newTree.name}" creato con successo!`);
      await loadTrees();
      setActiveTreeId(newTree.id);
      replaceTreeInUrl(newTree.id);
    } catch (err) {
      alert(`Errore nella creazione: ${err.message}`);
    }
  };

  const handleUpdateTreeSettings = async (id, updatedTree) => {
    try {
      await storage.updateTree(
        id,
        updatedTree.name,
        updatedTree.description,
        updatedTree.visibility,
        updatedTree.edit_permission
      );
      loadTrees();
    } catch (err) {
      alert(err.message);
      throw err;
    }
  };

  const handleDeleteTree = async (id) => {
    try {
      await storage.deleteTree(id);
      alert('Albero eliminato.');
      setShowTreeSettings(false);
      loadTrees();
    } catch (err) {
      alert(err.message);
    }
  };

  // Salva o modifica una persona esistente
  const handleSavePerson = async (id, personData) => {
    try {
      if (canEdit) {
        await storage.updatePerson(id, personData);
        loadTreeDetails();
      } else {
        await submitProposal([{ action: 'update_person', id, data: personData }]);
      }
    } catch (err) {
      alert(err.message);
      throw err;
    }
  };

  // Elimina una persona ed i suoi collegamenti
  const handleDeletePerson = async (id) => {
    try {
      if (canEdit) await storage.deletePerson(id);
      else await submitProposal([{ action: 'delete_person', id }]);
      setSelectedPerson(null);
      if (canEdit) loadTreeDetails();
    } catch (err) {
      alert(err.message);
    }
  };

  // Elimina multiple persone
  const handleDeleteMultiplePeople = async (personIds) => {
    try {
      if (canEdit) {
        for (const id of personIds) await storage.deletePerson(id);
        loadTreeDetails();
      } else await submitProposal(personIds.map(id => ({ action: 'delete_person', id })));
    } catch (err) {
      alert(err.message);
    }
  };

  // Avvia la procedura per aggiungere un parente rapido
  const handleAddRelativeTrigger = (targetPerson, relation) => {
    setRelativeToAdd({ person: targetPerson, relation });
  };

  // Salva il nuovo parente inserito tramite il menu rapido
  const handleSaveNewRelative = async (dummyId, relativeData) => {
    if (!relativeToAdd) return;

    const { person: target, relation } = relativeToAdd;
    const newPersonId = generateUUID();

    let newPerson = null;
    try {
      if (!canEdit) {
        const operations = [{ action: 'add_person', id: newPersonId, data: relativeData }];
        if (relation === 'parent' && target) operations.push({ action: 'add_union', id: generateUUID(), data: { partner1_id: newPersonId, partner2_id: null, children_ids: [target.id], type: 'relationship' } });
        if (relation === 'partner' && target) operations.push({ action: 'add_union', id: generateUUID(), data: { partner1_id: target.id, partner2_id: newPersonId, children_ids: [], type: 'relationship' } });
        if (relation === 'child' && target) {
          const existingUnion = unions.find(u => u.partner1_id === target.id || u.partner2_id === target.id);
          if (existingUnion) operations.push({ action: 'update_union', id: existingUnion.id, data: { ...existingUnion, children_ids: [...existingUnion.children_ids, newPersonId] } });
          else operations.push({ action: 'add_union', id: generateUUID(), data: { partner1_id: target.id, partner2_id: null, children_ids: [newPersonId], type: 'relationship' } });
        }
        await submitProposal(operations);
        setRelativeToAdd(null);
        return;
      }
      // 1. Crea la nuova persona nel database
      newPerson = await storage.addPerson({
        ...relativeData,
        id: newPersonId,
        tree_id: activeTreeId
      });

      // 2. Collega le relazioni (se 'free', nessuna unione necessaria)
      if (relation === 'parent' && target) {
        // Crea una nuova unione dove il nuovo parente è partner1, e il target è il figlio
        await storage.addUnion({
          tree_id: activeTreeId,
          partner1_id: newPerson.id,
          partner2_id: null,
          children_ids: [target.id],
          type: 'relationship'
        });
      } else if (relation === 'partner' && target) {
        // Crea un'unione tra il target ed il nuovo partner
        await storage.addUnion({
          tree_id: activeTreeId,
          partner1_id: target.id,
          partner2_id: newPerson.id,
          children_ids: [],
          type: 'relationship'
        });
      } else if (relation === 'child' && target) {
        // Cerca se il target ha già un'unione esistente per metterlo come figlio,
        // altrimenti crea un'unione a genitore singolo
        const existingUnion = unions.find(u => u.partner1_id === target.id || u.partner2_id === target.id);
        
        if (existingUnion) {
          await storage.updateUnion(existingUnion.id, {
            ...existingUnion,
            children_ids: [...existingUnion.children_ids, newPerson.id]
          });
        } else {
          await storage.addUnion({
            tree_id: activeTreeId,
            partner1_id: target.id,
            partner2_id: null,
            children_ids: [newPerson.id],
            type: 'relationship'
          });
        }
      }
      // 'free': nessuna unione, persona standalone (capostipite)

      setRelativeToAdd(null);
      loadTreeDetails();
      // Centra sul nuovo nodo inserito
      setHighlightedPersonId(newPerson.id);
    } catch (err) {
      if (newPerson) {
        try {
          await storage.deletePerson(newPerson.id);
        } catch (rollbackError) {
          console.error('Impossibile annullare la persona creata dopo l’errore:', rollbackError);
        }
      }
      alert(`Errore nell'aggiunta del familiare: ${err.message}`);
      throw err;
    }
  };

  const handleTreeSelection = (treeId) => {
    setPeople([]);
    setUnions([]);
    setCanEdit(false);
    setCanPropose(false);
    setCanManageTree(false);
    setActiveTreeId(treeId);
    replaceTreeInUrl(treeId);
  };

  const handleShareTree = async () => {
    const shareUrl = buildTreeShareUrl(activeTreeId);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      window.prompt('Copia il link dell’albero:', shareUrl);
    }
  };

  const submitProposal = async (operations) => {
    let proposerName = '';
    if (!currentUser) {
      proposerName = window.prompt('Inserisci il tuo nome per firmare la proposta:') || '';
      if (!proposerName.trim()) throw new Error('Nome obbligatorio per inviare la proposta.');
    }
    await storage.submitChangeRequest(activeTreeId, operations, proposerName);
    alert('Modifica inviata: sarà visibile dopo l’approvazione del proprietario.');
  };

  // Importazione da file XMind o outline di testo
  const handleImportComplete = async (importedPeople, importedUnions) => {
    if (!activeTreeId) return;
    try {
      await storage.importTreeData(activeTreeId, importedPeople, importedUnions, true);
      await loadTreeDetails();
    } catch (err) {
      alert(`Errore di importazione: ${err.message}`);
      throw err;
    }
  };

  const handleLogout = async () => {
    await storage.signOut();
    setCurrentUser(null);
    alert('Disconnessione effettuata.');
  };

  const activeTree = trees.find(t => t.id === activeTreeId);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header glass">
        <div className="logo-section">
          <Network className="logo-icon" size={24} />
          <span>Genealogia di Famiglia</span>
        </div>

        {trees.length > 0 && (
          <div className="tree-select-wrapper">
            <select
              className="tree-select"
              value={activeTreeId}
              onChange={(e) => handleTreeSelection(e.target.value)}
            >
              {trees.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.visibility === 'public' ? 'Pubblico' : t.visibility === 'restricted' ? 'Riservato' : 'Privato'})
                </option>
              ))}
            </select>
            {currentUser && currentUser.is_approved && (
              <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={handleCreateTree} title="Nuovo albero">
                <Plus size={16} />
              </button>
            )}
          </div>
        )}

        {/* Ricerca intelligente */}
        {activeTreeId && (
          <SearchPanel
            people={people}
            onSelectPerson={(id) => {
              setHighlightedPersonId(id);
              // Trova la persona per aprirne la scheda
              const p = people.find(item => item.id === id);
              if (p) setSelectedPerson(p);
            }}
          />
        )}

        {/* Azioni Utente e Pannelli */}
        <div className="header-actions">
          {activeTreeId && (
            <button className="btn btn-secondary flex-align gap-6" onClick={handleShareTree} title="Copia il link di questo albero">
              {shareCopied ? <Check size={16} /> : <Share2 size={16} />}
              {shareCopied ? 'Link copiato' : 'Condividi'}
            </button>
          )}
          {activeTreeId && (
            <button
              className="btn btn-secondary relative flex-align gap-6"
              onClick={() => setShowBirthdays(true)}
              title="Compleanni Parenti in Vita"
            >
              <Cake size={16} className="text-amber" />
              <span>Compleanni</span>
              {getUpcomingBirthdays(people, 60).length > 0 && (
                <span className="badge-count bg-amber text-inverse font-bold">
                  {getUpcomingBirthdays(people, 60).length}
                </span>
              )}
            </button>
          )}

          {activeTreeId && canManageTree && (
            <button
              className={`btn ${clinicalMode ? 'btn-clinical-on' : 'btn-secondary'} flex-align gap-6`}
              onClick={() => setClinicalMode(value => !value)}
              title={clinicalMode
                ? 'Nascondi le informazioni sanitarie (visibilità riservata)'
                : 'Mostra le informazioni sanitarie: dati riservati, non visibili nell’albero ufficiale'}
            >
              {clinicalMode ? <Eye size={16} /> : <EyeOff size={16} />}
              Modalità clinica
            </button>
          )}

          {activeTreeId && healthVisible && (
            <button
              className="btn btn-secondary flex-align gap-6"
              onClick={() => setShowGeneticRisk(true)}
              title="Stima del rischio ereditario per la prole"
            >
              <Dna size={16} style={{ color: 'var(--accent-violet)' }} />
              Rischio ereditario
            </button>
          )}

          {activeTreeId && (canEdit || canPropose) && (
            <>
              <button className="btn btn-primary" onClick={() => handleAddRelativeTrigger(null, 'free')} title="Aggiungi Capostipite">
                <Plus size={16} /> Aggiungi Capostipite
              </button>
              <button className="btn btn-secondary" onClick={() => setShowImportExport(true)} title="Importa / Esporta">
                <Upload size={16} /> Importa/Esporta
              </button>
              {canManageTree && (
                <button className="btn btn-secondary" onClick={() => setShowTreeSettings(true)} title="Impostazioni Albero">
                  <Settings size={16} /> Impostazioni
                </button>
              )}
              {canManageTree && (
                <button className="btn btn-secondary" onClick={() => setShowChangeRequests(true)}>
                  <ShieldAlert size={16} /> Modifiche da approvare
                </button>
              )}
            </>
          )}

          {currentUser ? (
            <>
              {currentUser.is_admin && (
                <button className="btn btn-secondary" onClick={() => setShowAdmin(true)} style={{ color: 'var(--accent-teal)' }}>
                  <ShieldAlert size={16} /> Admin
                </button>
              )}
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Ciao, {currentUser.first_name || 'Utente'} {currentUser.is_approved ? '' : '(In Attesa)'}
              </span>
              <button className="btn btn-danger" onClick={handleLogout} title="Disconnettiti">
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowAuth(true)}>
              <LogIn size={16} /> Accedi / Registrati
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      {activeTreeId ? (
        <GenealogyTree
          treeId={activeTreeId}
          people={people}
          unions={unions}
          onSelectPerson={setSelectedPerson}
          onAddRelative={handleAddRelativeTrigger}
          canEdit={canEdit || canPropose}
          highlightedPersonId={highlightedPersonId}
          onDeletePeople={handleDeleteMultiplePeople}
          healthVisible={healthVisible}
        />
      ) : (
        <div className="welcome-screen">
          <div className="welcome-box glass">
            <Network className="welcome-icon" size={64} />
            <h2 className="welcome-title">Crea il tuo Albero Genealogico</h2>
            <p className="welcome-subtitle">
              Esplora la storia della tua famiglia, mappa le relazioni biologiche, annota biografie importanti e traccia predisposizioni cliniche ereditarie.
            </p>
            
            {currentUser ? (
              currentUser.is_approved ? (
                <button className="btn btn-primary" onClick={handleCreateTree}>
                  <Plus size={16} /> Crea il tuo Primo Albero
                </button>
              ) : (
                <div className="alert-box alert-warning" style={{ justifyContent: 'center' }}>
                  <AlertCircle size={16} />
                  Il tuo account è registrato. Attendi che l'amministratore approvi il tuo account per poter creare alberi.
                </div>
              )
            ) : (
              <button className="btn btn-primary" onClick={() => setShowAuth(true)}>
                <LogIn size={16} /> Registrati per Iniziare
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modale Dettagli / Modifica Persona */}
      {selectedPerson && (
        <PersonDetailsModal
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onSave={handleSavePerson}
          onDelete={handleDeletePerson}
          canEdit={canEdit || canPropose}
          healthVisible={healthVisible}
        />
      )}

      {/* Modale Aggiunta Rapida Familiare */}
      {relativeToAdd && (
        <PersonDetailsModal
          person={{
            id: 'new',
            first_name: '',
            last_name: (relativeToAdd.relation === 'child' && relativeToAdd.person) ? relativeToAdd.person.last_name : '',
            gender: (relativeToAdd.relation === 'partner' && relativeToAdd.person) ? (relativeToAdd.person.gender === 'M' ? 'F' : 'M') : 'M',
            illnesses: [],
            notes: ''
          }}
          onClose={() => setRelativeToAdd(null)}
          onSave={handleSaveNewRelative}
          canEdit={true}
          healthVisible={healthVisible}
        />
      )}

      {/* Modali di Sistema */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthSuccess={loadUser}
        />
      )}

      {showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
        />
      )}

      {showTreeSettings && activeTree && (
        <TreeSettingsModal
          tree={activeTree}
          onClose={() => setShowTreeSettings(false)}
          onSave={handleUpdateTreeSettings}
          onDelete={handleDeleteTree}
        />
      )}

      {showImportExport && (
        <ImportExport
          treeId={activeTreeId}
          onClose={() => setShowImportExport(false)}
          onImportComplete={handleImportComplete}
        />
      )}

      {showBirthdays && (
        <BirthdayModal
          isOpen={showBirthdays}
          onClose={() => setShowBirthdays(false)}
          people={people}
          treeName={activeTree?.name || 'Albero Genealogico'}
          onSelectPerson={(id) => {
            setHighlightedPersonId(id);
            const p = people.find(item => item.id === id);
            if (p) setSelectedPerson(p);
          }}
        />
      )}
      {showGeneticRisk && healthVisible && (
        <GeneticRiskModal
          isOpen={showGeneticRisk}
          onClose={() => setShowGeneticRisk(false)}
          people={people}
          unions={unions}
          onSelectPerson={(id) => {
            setHighlightedPersonId(id);
            const p = people.find(item => item.id === id);
            if (p) setSelectedPerson(p);
          }}
        />
      )}
      {showChangeRequests && activeTreeId && (
        <ChangeRequestsModal treeId={activeTreeId} onClose={() => setShowChangeRequests(false)} onReviewed={loadTreeDetails} />
      )}
    </div>
  );
}
