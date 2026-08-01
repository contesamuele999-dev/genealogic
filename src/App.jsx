import React, { useState, useEffect } from 'react';
import { Network, Plus, ShieldAlert, LogIn, LogOut, Settings, Upload, AlertCircle } from 'lucide-react';
import { storage } from './services/storage';
import { generateUUID } from './services/xmindParser';

// Componenti
import GenealogyTree from './components/GenealogyTree';
import PersonDetailsModal from './components/PersonDetailsModal';
import SearchPanel from './components/SearchPanel';
import ImportExport from './components/ImportExport';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import TreeSettingsModal from './components/TreeSettingsModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [trees, setTrees] = useState([]);
  const [activeTreeId, setActiveTreeId] = useState('');
  const [people, setPeople] = useState([]);
  const [unions, setUnions] = useState([]);
  const [canEdit, setCanEdit] = useState(false);

  // Stati di evidenziazione e modali
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [highlightedPersonId, setHighlightedPersonId] = useState(null);
  const [relativeToAdd, setRelativeToAdd] = useState(null); // { person, relation: 'parent'|'partner'|'child' }
  
  // Modali aperti
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showTreeSettings, setShowTreeSettings] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);

  // Carica i dati utente
  const loadUser = async () => {
    try {
      const user = await storage.getCurrentUser();
      setCurrentUser(user);
    } catch (err) {
      console.error(err);
    }
  };

  // Carica la lista degli alberi visibili
  const loadTrees = async () => {
    try {
      const list = await storage.getTrees();
      setTrees(list);
      
      // Imposta il primo albero come attivo se non ne è già selezionato uno valido
      if (list.length > 0) {
        if (!activeTreeId || !list.some(t => t.id === activeTreeId)) {
          setActiveTreeId(list[0].id);
        }
      } else {
        setActiveTreeId('');
        setPeople([]);
        setUnions([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Carica persone, unioni e permessi per l'albero attivo
  const loadTreeDetails = async () => {
    if (!activeTreeId) return;

    try {
      const pList = await storage.getPeople(activeTreeId);
      const uList = await storage.getUnions(activeTreeId);
      setPeople(pList);
      setUnions(uList);

      const writePermission = await storage.canWriteTree(activeTreeId);
      setCanEdit(writePermission);
    } catch (err) {
      console.error(err);
    }
  };

  // Inizializzazione iniziale
  useEffect(() => {
    const init = async () => {
      await loadUser();
    };
    init();
  }, []);

  // Ricarica alberi quando cambia l'utente (cambiano i suoi permessi)
  useEffect(() => {
    loadTrees();
  }, [currentUser]);

  // Ricarica dettagli quando cambia l'albero selezionato
  useEffect(() => {
    loadTreeDetails();
    setHighlightedPersonId(null);
  }, [activeTreeId]);

  const handleCreateTree = async () => {
    const name = window.prompt("Inserisci il nome del nuovo Albero Genealogico:");
    if (!name || !name.trim()) return;

    try {
      const newTree = await storage.createTree(name.trim(), "Nuovo albero genealogico di famiglia");
      alert(`Albero "${newTree.name}" creato con successo!`);
      await loadTrees();
      setActiveTreeId(newTree.id);
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
      await storage.updatePerson(id, personData);
      loadTreeDetails();
    } catch (err) {
      alert(err.message);
    }
  };

  // Elimina una persona ed i suoi collegamenti
  const handleDeletePerson = async (id) => {
    try {
      await storage.deletePerson(id);
      setSelectedPerson(null);
      loadTreeDetails();
    } catch (err) {
      alert(err.message);
    }
  };

  // Elimina multiple persone
  const handleDeleteMultiplePeople = async (personIds) => {
    try {
      for (const id of personIds) {
        await storage.deletePerson(id);
      }
      loadTreeDetails();
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

    try {
      // 1. Crea la nuova persona nel database
      const newPerson = await storage.addPerson({
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
      alert(`Errore nell'aggiunta del familiare: ${err.message}`);
    }
  };

  // Importazione da file XMind o outline di testo
  const handleImportComplete = async (importedPeople, importedUnions) => {
    if (!activeTreeId) return;
    try {
      await storage.importTreeData(activeTreeId, importedPeople, importedUnions, true);
      loadTreeDetails();
    } catch (err) {
      alert(`Errore di importazione: ${err.message}`);
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
              onChange={(e) => setActiveTreeId(e.target.value)}
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
          {activeTreeId && canEdit && (
            <>
              <button className="btn btn-primary" onClick={() => handleAddRelativeTrigger(null, 'free')} title="Aggiungi Capostipite">
                <Plus size={16} /> Aggiungi Capostipite
              </button>
              <button className="btn btn-secondary" onClick={() => setShowImportExport(true)} title="Importa / Esporta">
                <Upload size={16} /> Importa/Esporta
              </button>
              <button className="btn btn-secondary" onClick={() => setShowTreeSettings(true)} title="Impostazioni Albero">
                <Settings size={16} /> Impostazioni
              </button>
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
          people={people}
          unions={unions}
          onSelectPerson={setSelectedPerson}
          onAddRelative={handleAddRelativeTrigger}
          canEdit={canEdit}
          highlightedPersonId={highlightedPersonId}
          onDeletePeople={handleDeleteMultiplePeople}
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
          canEdit={canEdit}
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
    </div>
  );
}
