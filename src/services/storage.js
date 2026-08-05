import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { generateUUID } from './xmindParser.js';
import { mergeLinkedTrees, collectLinkedTreeIds } from './treeMerge.js';

// ==========================================
// SEZIONE LOCAL STORAGE (MOCK DATABASE)
// ==========================================

const getLocalData = (key, defaultVal = []) => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : defaultVal;
};

const setLocalData = (key, data) => {
  localStorage.setItem(key, JSON.stringify(data));
};

const initLocalMockData = () => {
  if (!localStorage.getItem('genealogy_users')) {
    setLocalData('genealogy_users', []);
  }
  if (!localStorage.getItem('genealogy_trees')) {
    setLocalData('genealogy_trees', []);
  }
  if (!localStorage.getItem('genealogy_people')) {
    setLocalData('genealogy_people', []);
  }
  if (!localStorage.getItem('genealogy_unions')) {
    setLocalData('genealogy_unions', []);
  }
  if (!localStorage.getItem('genealogy_tree_editors')) {
    setLocalData('genealogy_tree_editors', []);
  }
  if (!localStorage.getItem('genealogy_change_requests')) {
    setLocalData('genealogy_change_requests', []);
  }
  if (!localStorage.getItem('genealogy_tree_links')) {
    setLocalData('genealogy_tree_links', []);
  }
};

initLocalMockData();

// ==========================================
// API UNIFICATA
// ==========================================

export const storage = {
  // ----------------------------------------
  // 1. AUTENTICAZIONE & UTENTI
  // ----------------------------------------

  async signUp(email, password, firstName, lastName) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName
          }
        }
      });
      if (error) throw error;
      return data;
    } else {
      // Local Mock
      const users = getLocalData('genealogy_users');
      if (users.some(u => u.email === email)) {
        throw new Error('Questo indirizzo email è già registrato.');
      }

      const isFirst = users.length === 0;
      const newUser = {
        id: generateUUID(),
        email,
        password, // Solo mock, in produzione non salvato in chiaro!
        first_name: firstName,
        last_name: lastName,
        is_approved: isFirst, // Il primo utente è auto-approvato
        is_admin: isFirst,    // Il primo utente è admin
        created_at: new Date().toISOString()
      };

      users.push(newUser);
      setLocalData('genealogy_users', users);
      // Salva come utente corrente
      setLocalData('genealogy_current_user', newUser);
      return { user: newUser };
    }
  },

  async signIn(email, password) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      return data;
    } else {
      // Local Mock
      const users = getLocalData('genealogy_users');
      const user = users.find(u => u.email === email && u.password === password);
      if (!user) {
        throw new Error('Credenziali non valide. Riprova.');
      }
      setLocalData('genealogy_current_user', user);
      return { user };
    }
  },

  async signOut() {
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } else {
      localStorage.removeItem('genealogy_current_user');
    }
  },

  async getCurrentUser() {
    if (isSupabaseConfigured) {
      // Prende la sessione da auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      // Prende il profilo da public.profiles
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (error) {
        // Se il profilo non esiste ancora (es. ritardo del trigger) restituiamo i dati di auth temporanei
        return {
          id: session.user.id,
          email: session.user.email,
          first_name: session.user.user_metadata?.first_name || '',
          last_name: session.user.user_metadata?.last_name || '',
          is_approved: false,
          is_admin: false
        };
      }

      return {
        ...profile,
        email: session.user.email
      };
    } else {
      // Local Mock
      return getLocalData('genealogy_current_user', null);
    }
  },

  async getPendingUsers() {
    const currentUser = await this.getCurrentUser();
    if (!currentUser?.is_admin) {
      throw new Error('Solo un amministratore può visualizzare gli utenti in attesa.');
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_approved', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    } else {
      // Local Mock
      const users = getLocalData('genealogy_users');
      return users.filter(u => !u.is_approved);
    }
  },

  async approveUser(userId) {
    const currentUser = await this.getCurrentUser();
    if (!currentUser?.is_admin) {
      throw new Error('Solo un amministratore può approvare gli utenti.');
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('approve_user', {
        target_user_id: userId
      });
      if (error) throw error;
    } else {
      // Local Mock
      const users = getLocalData('genealogy_users');
      const idx = users.findIndex(u => u.id === userId);
      if (idx !== -1) {
        users[idx].is_approved = true;
        setLocalData('genealogy_users', users);
        
        // Aggiorna l'utente corrente se approva se stesso (anche se l'admin si autoapprova)
        const curr = getLocalData('genealogy_current_user', null);
        if (curr && curr.id === userId) {
          curr.is_approved = true;
          setLocalData('genealogy_current_user', curr);
        }
      }
    }
  },

  async getUsersList() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('is_approved', true);
      if (error) throw error;
      return data;
    } else {
      // Local Mock
      const users = getLocalData('genealogy_users');
      return users
        .filter(u => u.is_approved)
        .map(u => ({ id: u.id, first_name: u.first_name, last_name: u.last_name }));
    }
  },

  // ----------------------------------------
  // 2. GESTIONE ALBERI (TREES)
  // ----------------------------------------

  async getTrees() {
    const user = await this.getCurrentUser();
    
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('trees')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data; // RLS gestisce la visibilità automatica in lettura su Supabase!
    } else {
      // Local Mock
      const trees = getLocalData('genealogy_trees');
      const editors = getLocalData('genealogy_tree_editors');
      
      // RLS manuale per Mock
      return trees.filter(tree => {
        // 1. Pubblico
        if (tree.visibility === 'public') return true;
        // 2. Riservato (solo se loggato e approvato)
        if (tree.visibility === 'restricted' && user && user.is_approved) return true;
        // 3. Privato (solo proprietario o admin)
        if (tree.owner_id === (user?.id || '')) return true;
        if (user?.is_admin) return true;
        // 4. Se è un editore specifico dell'albero
        const isEditor = editors.some(e => e.tree_id === tree.id && e.user_id === (user?.id || ''));
        if (isEditor) return true;
        
        return false;
      });
    }
  },

  async createTree(name, description, visibility = 'public', editPermission = 'owner', healthPermission = 'owner', linkPermission = 'moderated') {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Devi essere autenticato per creare un albero.');
    if (!user.is_approved) throw new Error('Il tuo account è in attesa di approvazione da parte di un amministratore.');

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('trees')
        .insert({
          name,
          description,
          visibility,
          edit_permission: editPermission,
          health_permission: healthPermission,
          link_permission: linkPermission,
          owner_id: user.id
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      // Local Mock
      const trees = getLocalData('genealogy_trees');
      const newTree = {
        id: generateUUID(),
        name,
        description,
        visibility,
        edit_permission: editPermission,
        health_permission: healthPermission,
        link_permission: linkPermission,
        owner_id: user.id,
        created_at: new Date().toISOString()
      };
      trees.push(newTree);
      setLocalData('genealogy_trees', trees);
      return newTree;
    }
  },

  async updateTree(treeId, name, description, visibility, editPermission, healthPermission = 'owner', linkPermission = 'moderated') {
    if (!await this.canManageTree(treeId)) {
      throw new Error('Solo il proprietario o un amministratore può modificare le impostazioni dell’albero.');
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('trees')
        .update({
          name,
          description,
          visibility,
          edit_permission: editPermission,
          health_permission: healthPermission,
          link_permission: linkPermission
        })
        .eq('id', treeId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const trees = getLocalData('genealogy_trees');
      const idx = trees.findIndex(t => t.id === treeId);
      if (idx !== -1) {
        trees[idx] = {
          ...trees[idx],
          name,
          description,
          visibility,
          edit_permission: editPermission,
          health_permission: healthPermission,
          link_permission: linkPermission
        };
        setLocalData('genealogy_trees', trees);
        return trees[idx];
      }
      throw new Error('Albero non trovato.');
    }
  },

  async deleteTree(treeId) {
    if (!await this.canManageTree(treeId)) {
      throw new Error('Solo il proprietario o un amministratore può eliminare l’albero.');
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('trees')
        .delete()
        .eq('id', treeId);
      if (error) throw error;
    } else {
      // Local Mock
      let trees = getLocalData('genealogy_trees');
      trees = trees.filter(t => t.id !== treeId);
      setLocalData('genealogy_trees', trees);

      // Cancella cascata
      let people = getLocalData('genealogy_people');
      people = people.filter(p => p.tree_id !== treeId);
      setLocalData('genealogy_people', people);

      let unions = getLocalData('genealogy_unions');
      unions = unions.filter(u => u.tree_id !== treeId);
      setLocalData('genealogy_unions', unions);

      let editors = getLocalData('genealogy_tree_editors');
      editors = editors.filter(e => e.tree_id !== treeId);
      setLocalData('genealogy_tree_editors', editors);
    }
  },

  async getTreeEditors(treeId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tree_editors')
        .select('user_id')
        .eq('tree_id', treeId);
      if (error) throw error;
      return data.map(e => e.user_id);
    } else {
      const editors = getLocalData('genealogy_tree_editors');
      return editors.filter(e => e.tree_id === treeId).map(e => e.user_id);
    }
  },

  async setTreeEditors(treeId, userIds) {
    if (!await this.canManageTree(treeId)) {
      throw new Error('Solo il proprietario o un amministratore può gestire gli editor dell’albero.');
    }

    if (isSupabaseConfigured) {
      // 1. Cancella vecchi editori
      const { error: delErr } = await supabase
        .from('tree_editors')
        .delete()
        .eq('tree_id', treeId);
      if (delErr) throw delErr;

      // 2. Aggiunge nuovi editori
      if (userIds.length > 0) {
        const rows = userIds.map(uid => ({ tree_id: treeId, user_id: uid }));
        const { error: insErr } = await supabase
          .from('tree_editors')
          .insert(rows);
        if (insErr) throw insErr;
      }
    } else {
      // Local Mock
      let editors = getLocalData('genealogy_tree_editors');
      editors = editors.filter(e => e.tree_id !== treeId);
      
      userIds.forEach(uid => {
        editors.push({ tree_id: treeId, user_id: uid });
      });
      setLocalData('genealogy_tree_editors', editors);
    }
  },

  // Controlla se l'utente corrente ha i permessi di scrittura sull'albero
  async canWriteTree(treeId) {
    const user = await this.getCurrentUser();
    if (!user) return false;
    if (user.is_admin) return true;

    if (isSupabaseConfigured) {
      // Esegue la RPC o scarica l'albero e controlla
      const { data: tree, error } = await supabase
        .from('trees')
        .select('owner_id, edit_permission')
        .eq('id', treeId)
        .single();
      
      if (error || !tree) return false;
      if (tree.owner_id === user.id) return true;
      if (tree.edit_permission === 'auth' && user.is_approved) return true;

      // Controlla tabella tree_editors
      const { data: isEditor } = await supabase
        .from('tree_editors')
        .select('*')
        .eq('tree_id', treeId)
        .eq('user_id', user.id);
      
      return isEditor && isEditor.length > 0;
    } else {
      const trees = getLocalData('genealogy_trees');
      const tree = trees.find(t => t.id === treeId);
      if (!tree) return false;
      if (tree.owner_id === user.id) return true;
      if (tree.edit_permission === 'auth' && user.is_approved) return true;

      const editors = getLocalData('genealogy_tree_editors');
      return editors.some(e => e.tree_id === treeId && e.user_id === user.id);
    }
  },

  async canProposeTree(treeId) {
    const user = await this.getCurrentUser();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('can_propose_tree', { target_tree_id: treeId });
      return !error && data === true;
    }
    const tree = getLocalData('genealogy_trees').find(t => t.id === treeId);
    return !!tree && (
      tree.edit_permission === 'public_moderated'
      || (tree.edit_permission === 'auth_moderated' && user?.is_approved)
    );
  },

  async submitChangeRequest(treeId, operations, proposerName = '') {
    const user = await this.getCurrentUser();
    if (!await this.canProposeTree(treeId)) throw new Error('Non puoi proporre modifiche a questo albero.');
    if (!user && proposerName.trim().length < 2) throw new Error('Inserisci il tuo nome.');
    const request = {
      id: generateUUID(), tree_id: treeId, proposer_id: user?.id || null,
      proposer_name: user ? null : proposerName.trim(), operations,
      status: 'pending', created_at: new Date().toISOString()
    };
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('change_requests').insert(request);
      if (error) throw error;
      return request;
    }
    const requests = getLocalData('genealogy_change_requests');
    requests.push(request);
    setLocalData('genealogy_change_requests', requests);
    return request;
  },

  async getChangeRequests(treeId) {
    if (!await this.canManageTree(treeId)) throw new Error('Non puoi gestire le richieste di questo albero.');
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('change_requests')
        .select('*, proposer:profiles!proposer_id(first_name,last_name)')
        .eq('tree_id', treeId).eq('status', 'pending').order('created_at');
      if (error) throw error;
      return data;
    }
    const users = getLocalData('genealogy_users');
    return getLocalData('genealogy_change_requests').filter(r => r.tree_id === treeId && r.status === 'pending')
      .map(r => ({ ...r, proposer: users.find(u => u.id === r.proposer_id) || null }));
  },

  async reviewChangeRequest(requestId, approve) {
    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('review_change_request', { request_id: requestId, approve });
      if (error) throw error;
      return;
    }
    const requests = getLocalData('genealogy_change_requests');
    const request = requests.find(r => r.id === requestId && r.status === 'pending');
    if (!request || !await this.canManageTree(request.tree_id)) throw new Error('Richiesta non disponibile.');
    if (approve) {
      for (const op of request.operations) {
        if (op.action === 'add_person') await this.addPerson({ ...op.data, id: op.id, tree_id: request.tree_id });
        if (op.action === 'update_person') await this.updatePerson(op.id, { ...op.data, tree_id: request.tree_id });
        if (op.action === 'delete_person') await this.deletePerson(op.id);
        if (op.action === 'add_union') await this.addUnion({ ...op.data, id: op.id, tree_id: request.tree_id });
        if (op.action === 'update_union') await this.updateUnion(op.id, { ...op.data, tree_id: request.tree_id });
        if (op.action === 'delete_union') await this.deleteUnion(op.id);
      }
    }
    request.status = approve ? 'approved' : 'rejected';
    request.reviewed_at = new Date().toISOString();
    setLocalData('genealogy_change_requests', requests);
  },

  // I dati clinici hanno una visibilità propria, distinta da quella dell'albero:
  // è governata dal campo health_permission impostabile dalle Impostazioni Albero.
  async canViewHealthTree(treeId) {
    if (!treeId) return false;
    const user = await this.getCurrentUser();

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('can_view_health_tree', { target_tree_id: treeId });
      if (!error) return data === true;

      // Fallback se la migrazione non è ancora stata eseguita: solo proprietario/admin.
      console.warn('can_view_health_tree non disponibile, fallback al proprietario:', error.message);
      return this.canManageTree(treeId);
    }

    const tree = getLocalData('genealogy_trees').find(t => t.id === treeId);
    if (!tree) return false;
    if (user?.is_admin) return true;
    if (tree.owner_id === user?.id) return true;

    const permission = tree.health_permission || 'owner';
    if (permission === 'all') return true;
    if (permission === 'auth') return !!user?.is_approved;
    if (permission === 'editors') return this.canWriteTree(treeId);
    return false;
  },

  async canManageTree(treeId) {
    const user = await this.getCurrentUser();
    if (!user) return false;
    if (user.is_admin) return true;

    if (isSupabaseConfigured) {
      const { data: tree, error } = await supabase
        .from('trees')
        .select('owner_id')
        .eq('id', treeId)
        .single();
      return !error && tree?.owner_id === user.id;
    }

    const trees = getLocalData('genealogy_trees');
    return trees.some(tree => tree.id === treeId && tree.owner_id === user.id);
  },

  // ----------------------------------------
  // 3. GESTIONE PERSONE (PEOPLE)
  // ----------------------------------------

  async getPeople(treeId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('tree_id', treeId);
      if (error) throw error;
      return data;
    } else {
      const people = getLocalData('genealogy_people');
      return people.filter(p => p.tree_id === treeId);
    }
  },

  async addPerson(personData) {
    const canWrite = await this.canWriteTree(personData.tree_id);
    if (!canWrite) throw new Error('Non hai i permessi per modificare questo albero.');

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('people')
        .insert({
          tree_id: personData.tree_id,
          first_name: personData.first_name,
          last_name: personData.last_name || '',
          gender: personData.gender || 'M',
          birth_date: personData.birth_date || '',
          death_date: personData.death_date || '',
          birth_place: personData.birth_place || '',
          illnesses: personData.illnesses || [],
          notes: personData.notes || '',
          avatar_url: personData.avatar_url || ''
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const people = getLocalData('genealogy_people');
      const newPerson = {
        id: personData.id || generateUUID(),
        ...personData,
        first_name: personData.first_name,
        last_name: personData.last_name || '',
        gender: personData.gender || 'Other',
        birth_date: personData.birth_date || '',
        death_date: personData.death_date || '',
        birth_place: personData.birth_place || '',
        illnesses: personData.illnesses || [],
        notes: personData.notes || '',
        avatar_url: personData.avatar_url || '',
        created_at: new Date().toISOString()
      };
      people.push(newPerson);
      setLocalData('genealogy_people', people);
      return newPerson;
    }
  },

  async updatePerson(personId, personData) {
    const canWrite = await this.canWriteTree(personData.tree_id);
    if (!canWrite) throw new Error('Non hai i permessi per modificare questo albero.');

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('people')
        .update({
          first_name: personData.first_name,
          last_name: personData.last_name || '',
          gender: personData.gender || 'M',
          birth_date: personData.birth_date || '',
          death_date: personData.death_date || '',
          birth_place: personData.birth_place || '',
          illnesses: personData.illnesses || [],
          notes: personData.notes || '',
          avatar_url: personData.avatar_url || ''
        })
        .eq('id', personId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const people = getLocalData('genealogy_people');
      const idx = people.findIndex(p => p.id === personId);
      if (idx !== -1) {
        people[idx] = {
          ...people[idx],
          ...personData
        };
        setLocalData('genealogy_people', people);
        return people[idx];
      }
      throw new Error('Persona non trovata.');
    }
  },

  async deletePerson(personId) {
    // Prima carica la persona per sapere a quale albero appartiene
    let treeId = null;
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('people')
        .select('tree_id')
        .eq('id', personId)
        .single();
      if (data) treeId = data.tree_id;
    } else {
      const people = getLocalData('genealogy_people');
      const person = people.find(p => p.id === personId);
      if (person) treeId = person.tree_id;
    }

    if (!treeId) throw new Error('Persona non trovata.');
    
    const canWrite = await this.canWriteTree(treeId);
    if (!canWrite) throw new Error('Non hai i permessi per modificare questo albero.');

    if (isSupabaseConfigured) {
      // children_ids non ha un vincolo FK: va ripulito esplicitamente prima
      // della cancellazione, altrimenti rimangono riferimenti orfani.
      const { data: childUnions, error: childLookupError } = await supabase
        .from('unions')
        .select('*')
        .eq('tree_id', treeId)
        .contains('children_ids', [personId]);
      if (childLookupError) throw childLookupError;

      for (const union of childUnions || []) {
        const { error: cleanupError } = await supabase
          .from('unions')
          .update({
            children_ids: union.children_ids.filter(childId => childId !== personId)
          })
          .eq('id', union.id);
        if (cleanupError) throw cleanupError;
      }

      const { error } = await supabase
        .from('people')
        .delete()
        .eq('id', personId);
      if (error) throw error;
    } else {
      // Local Mock
      let people = getLocalData('genealogy_people');
      people = people.filter(p => p.id !== personId);
      setLocalData('genealogy_people', people);

      // Pulisce le unioni in cui la persona compare come partner
      let unions = getLocalData('genealogy_unions');
      
      // Elimina le unioni in cui era partner1 o partner2
      unions = unions.filter(u => u.partner1_id !== personId && u.partner2_id !== personId);
      
      // Rimuove la persona dagli array children_ids di altre unioni
      unions.forEach(u => {
        u.children_ids = u.children_ids.filter(cid => cid !== personId);
      });
      setLocalData('genealogy_unions', unions);
    }
  },

  // ----------------------------------------
  // 4. GESTIONE UNIONI / RELAZIONI (UNIONS)
  // ----------------------------------------

  async getUnions(treeId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('unions')
        .select('*')
        .eq('tree_id', treeId);
      if (error) throw error;
      return data;
    } else {
      const unions = getLocalData('genealogy_unions');
      return unions.filter(u => u.tree_id === treeId);
    }
  },

  async addUnion(unionData) {
    const canWrite = await this.canWriteTree(unionData.tree_id);
    if (!canWrite) throw new Error('Non hai i permessi per modificare questo albero.');

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('unions')
        .insert({
          tree_id: unionData.tree_id,
          partner1_id: unionData.partner1_id,
          partner2_id: unionData.partner2_id || null,
          children_ids: unionData.children_ids || [],
          type: unionData.type || 'relationship'
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const unions = getLocalData('genealogy_unions');
      const newUnion = {
        id: unionData.id || generateUUID(),
        ...unionData,
        partner2_id: unionData.partner2_id || null,
        children_ids: unionData.children_ids || [],
        type: unionData.type || 'relationship',
        created_at: new Date().toISOString()
      };
      unions.push(newUnion);
      setLocalData('genealogy_unions', unions);
      return newUnion;
    }
  },

  async updateUnion(unionId, unionData) {
    const canWrite = await this.canWriteTree(unionData.tree_id);
    if (!canWrite) throw new Error('Non hai i permessi per modificare questo albero.');

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('unions')
        .update({
          partner1_id: unionData.partner1_id,
          partner2_id: unionData.partner2_id || null,
          children_ids: unionData.children_ids || [],
          type: unionData.type || 'relationship'
        })
        .eq('id', unionId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const unions = getLocalData('genealogy_unions');
      const idx = unions.findIndex(u => u.id === unionId);
      if (idx !== -1) {
        unions[idx] = {
          ...unions[idx],
          ...unionData,
          partner2_id: unionData.partner2_id || null,
          children_ids: unionData.children_ids || []
        };
        setLocalData('genealogy_unions', unions);
        return unions[idx];
      }
      throw new Error('Unione non trovata.');
    }
  },

  async deleteUnion(unionId) {
    let treeId = null;
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('unions')
        .select('tree_id')
        .eq('id', unionId)
        .single();
      if (data) treeId = data.tree_id;
    } else {
      const unions = getLocalData('genealogy_unions');
      const union = unions.find(u => u.id === unionId);
      if (union) treeId = union.tree_id;
    }

    if (!treeId) throw new Error('Unione non trovata.');

    const canWrite = await this.canWriteTree(treeId);
    if (!canWrite) throw new Error('Non hai i permessi per modificare questo albero.');

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('unions')
        .delete()
        .eq('id', unionId);
      if (error) throw error;
    } else {
      let unions = getLocalData('genealogy_unions');
      unions = unions.filter(u => u.id !== unionId);
      setLocalData('genealogy_unions', unions);
    }
  },

  /**
   * Importa in blocco persone e unioni in un albero esistente.
   * Cancella i vecchi dati se richiesto (overwrite)
   */
  // ----------------------------------------
  // INNESTI FRA ALBERI (tree_links)
  //
  // Un innesto dichiara che una persona del MIO albero è la stessa persona reale di
  // un nodo nell'albero di qualcun altro. I due alberi restano distinti: nessuno
  // scrive sull'albero altrui, la fusione avviene solo in visualizzazione.
  // ----------------------------------------

  async canLinkTree(treeId) {
    if (!treeId) return false;

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('can_link_tree', { target_tree_id: treeId });
      if (!error) return data === true;
      console.warn('can_link_tree non disponibile:', error.message);
      return false;
    }

    const user = await this.getCurrentUser();
    const tree = getLocalData('genealogy_trees').find(t => t.id === treeId);
    if (!tree) return false;
    if (user?.is_admin || tree.owner_id === user?.id) return true;

    const permission = tree.link_permission || 'moderated';
    if (permission === 'none') return false;
    if (permission === 'all') return true;
    return !!user?.is_approved;
  },

  /**
   * Restituisce gli innesti che coinvolgono l'albero indicato, sia come ramo
   * (source) sia come albero principale (target).
   */
  async getTreeLinks(treeId, { status = null } = {}) {
    if (!treeId) return [];

    if (isSupabaseConfigured) {
      let query = supabase
        .from('tree_links')
        .select('*')
        .or(`source_tree_id.eq.${treeId},target_tree_id.eq.${treeId}`);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) {
        console.warn('Lettura innesti non riuscita:', error.message);
        return [];
      }
      return data || [];
    }

    const links = getLocalData('genealogy_tree_links');
    return links.filter(link =>
      (link.source_tree_id === treeId || link.target_tree_id === treeId)
      && (!status || link.status === status)
    );
  },

  /**
   * Richiede l'innesto del proprio ramo su una persona di un altro albero.
   * Lo stato finale (pending o approved) lo decide il database in base al
   * link_permission dell'albero di destinazione.
   */
  async requestTreeLink({ sourceTreeId, sourcePersonId, targetTreeId, targetPersonId, note = '' }) {
    if (!sourceTreeId || !sourcePersonId || !targetTreeId || !targetPersonId) {
      throw new Error('Seleziona la persona del tuo albero e quella dell’albero di destinazione.');
    }
    if (sourceTreeId === targetTreeId) {
      throw new Error('Non puoi innestare un albero su sé stesso.');
    }
    if (!await this.canWriteTree(sourceTreeId)) {
      throw new Error('Puoi proporre un innesto solo da un albero che puoi modificare.');
    }
    if (!await this.canLinkTree(targetTreeId)) {
      throw new Error('Questo albero non accetta innesti.');
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tree_links')
        .insert({
          source_tree_id: sourceTreeId,
          source_person_id: sourcePersonId,
          target_tree_id: targetTreeId,
          target_person_id: targetPersonId,
          note: note || null
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }

    const user = await this.getCurrentUser();
    const links = getLocalData('genealogy_tree_links');
    if (links.some(l => l.source_person_id === sourcePersonId && l.target_person_id === targetPersonId)) {
      throw new Error('Questo innesto esiste già.');
    }

    const targetTree = getLocalData('genealogy_trees').find(t => t.id === targetTreeId);
    const permission = targetTree?.link_permission || 'moderated';
    const autoApprove = targetTree?.owner_id === user?.id || user?.is_admin || permission === 'auth' || permission === 'all';

    const link = {
      id: generateUUID(),
      source_tree_id: sourceTreeId,
      source_person_id: sourcePersonId,
      target_tree_id: targetTreeId,
      target_person_id: targetPersonId,
      note: note || null,
      status: autoApprove ? 'approved' : 'pending',
      requested_by: user?.id || null,
      reviewed_by: autoApprove ? (user?.id || null) : null,
      reviewed_at: autoApprove ? new Date().toISOString() : null,
      created_at: new Date().toISOString()
    };
    links.push(link);
    setLocalData('genealogy_tree_links', links);
    return link;
  },

  async reviewTreeLink(linkId, approve) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('review_tree_link', { link_id: linkId, approve });
      if (error) throw new Error(error.message);
      return data;
    }

    const user = await this.getCurrentUser();
    const links = getLocalData('genealogy_tree_links');
    const index = links.findIndex(l => l.id === linkId);
    if (index === -1) throw new Error('Innesto non trovato.');
    if (!await this.canWriteTree(links[index].target_tree_id)) {
      throw new Error('Non hai i permessi per approvare questo innesto.');
    }

    links[index] = {
      ...links[index],
      status: approve ? 'approved' : 'rejected',
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString()
    };
    setLocalData('genealogy_tree_links', links);
    return links[index];
  },

  async deleteTreeLink(linkId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('tree_links').delete().eq('id', linkId);
      if (error) throw new Error(error.message);
      return true;
    }

    const links = getLocalData('genealogy_tree_links');
    const link = links.find(l => l.id === linkId);
    if (!link) return true;
    const allowed = await this.canWriteTree(link.source_tree_id) || await this.canWriteTree(link.target_tree_id);
    if (!allowed) throw new Error('Non hai i permessi per rimuovere questo innesto.');

    setLocalData('genealogy_tree_links', links.filter(l => l.id !== linkId));
    return true;
  },

  /**
   * Carica l'albero indicato più tutti i rami approvati raggiungibili e ne
   * restituisce il grafo unificato pronto per il disegno.
   */
  async getLinkedGraph(treeId, { maxHops = 3 } = {}) {
    const [homePeople, homeUnions, allLinks, trees] = await Promise.all([
      this.getPeople(treeId),
      this.getUnions(treeId),
      this.getTreeLinks(treeId, { status: 'approved' }),
      this.getTrees()
    ]);

    const treeNameById = new Map(trees.map(tree => [tree.id, tree.name]));
    const homeTree = {
      id: treeId,
      name: treeNameById.get(treeId) || '',
      people: homePeople,
      unions: homeUnions
    };

    // Gli innesti del primo livello bastano a scoprire gli alberi vicini; per i salti
    // successivi occorre interrogare anche i loro collegamenti.
    let knownLinks = [...allLinks];
    let linkedTreeIds = collectLinkedTreeIds(treeId, knownLinks, 1);
    const loadedTrees = [homeTree];
    const visited = new Set([treeId]);

    for (let hop = 0; hop < maxHops && linkedTreeIds.length > 0; hop++) {
      const toLoad = linkedTreeIds.filter(id => !visited.has(id));
      if (toLoad.length === 0) break;

      const loaded = await Promise.all(toLoad.map(async (id) => {
        visited.add(id);
        try {
          const [people, unions, links] = await Promise.all([
            this.getPeople(id),
            this.getUnions(id),
            this.getTreeLinks(id, { status: 'approved' })
          ]);
          return { tree: { id, name: treeNameById.get(id) || 'Albero collegato', people, unions }, links };
        } catch (err) {
          // Un albero può essere diventato invisibile: si ignora senza rompere la vista.
          console.warn(`Albero collegato ${id} non caricabile:`, err.message);
          return null;
        }
      }));

      loaded.filter(Boolean).forEach(entry => {
        loadedTrees.push(entry.tree);
        knownLinks.push(...entry.links);
      });

      // Deduplica i collegamenti raccolti prima di cercare il salto successivo.
      const byId = new Map(knownLinks.map(link => [link.id, link]));
      knownLinks = Array.from(byId.values());
      linkedTreeIds = collectLinkedTreeIds(treeId, knownLinks, hop + 2).filter(id => !visited.has(id));
    }

    const merged = mergeLinkedTrees({ homeTreeId: treeId, trees: loadedTrees, links: knownLinks });

    return {
      ...merged,
      links: knownLinks,
      trees: loadedTrees.map(tree => ({ id: tree.id, name: tree.name, peopleCount: tree.people.length }))
    };
  },

  /**
   * Copia dentro l'albero principale le persone e le unioni di un ramo agganciato.
   * Le persone già condivise tramite innesto NON vengono duplicate: si riusa il nodo
   * esistente. L'albero di origine resta intatto e di proprietà del suo autore.
   */
  async importLinkedBranch(linkId) {
    const allLinks = isSupabaseConfigured
      ? (await supabase.from('tree_links').select('*').eq('id', linkId)).data || []
      : getLocalData('genealogy_tree_links').filter(l => l.id === linkId);

    const target = allLinks[0];
    if (!target) throw new Error('Innesto non trovato.');
    if (target.status !== 'approved') throw new Error('L’innesto non è ancora stato approvato.');
    if (!await this.canWriteTree(target.target_tree_id)) {
      throw new Error('Non hai i permessi per importare in questo albero.');
    }

    const [branchPeople, branchUnions, existingLinks] = await Promise.all([
      this.getPeople(target.source_tree_id),
      this.getUnions(target.source_tree_id),
      this.getTreeLinks(target.target_tree_id, { status: 'approved' })
    ]);

    // Mappa persona-del-ramo -> persona-già-presente-nell'albero-principale
    const reuseByBranchPerson = new Map();
    existingLinks.forEach(existing => {
      if (existing.source_tree_id === target.source_tree_id && existing.target_tree_id === target.target_tree_id) {
        reuseByBranchPerson.set(existing.source_person_id, existing.target_person_id);
      }
    });

    const idMap = new Map();
    const newPeople = [];

    branchPeople.forEach(person => {
      const reused = reuseByBranchPerson.get(person.id);
      if (reused) {
        idMap.set(person.id, reused);
        return;
      }
      const newId = generateUUID();
      idMap.set(person.id, newId);
      newPeople.push({
        id: newId,
        tree_id: target.target_tree_id,
        first_name: person.first_name,
        last_name: person.last_name || '',
        gender: person.gender || 'M',
        birth_date: person.birth_date || '',
        death_date: person.death_date || '',
        birth_place: person.birth_place || '',
        illnesses: person.illnesses || [],
        notes: person.notes || '',
        avatar_url: person.avatar_url || ''
      });
    });

    const resolve = (id) => (id ? idMap.get(id) || null : null);
    const newUnions = branchUnions.map(union => ({
      id: generateUUID(),
      tree_id: target.target_tree_id,
      partner1_id: resolve(union.partner1_id),
      partner2_id: resolve(union.partner2_id),
      children_ids: (union.children_ids || []).map(resolve).filter(Boolean),
      type: union.type || 'relationship'
    })).filter(union => union.partner1_id || union.partner2_id);

    // `overwrite: false` è essenziale: si aggiunge al contenuto esistente.
    await this.importTreeData(target.target_tree_id, newPeople, newUnions, false);

    return { importedPeople: newPeople.length, importedUnions: newUnions.length, reused: reuseByBranchPerson.size };
  },

  async importTreeData(treeId, people, unions, overwrite = true) {
    const canWrite = await this.canWriteTree(treeId);
    if (!canWrite) throw new Error('Non hai i permessi per modificare questo albero.');

    if (isSupabaseConfigured) {
      if (overwrite) {
        // Supabase elimina a cascata persone e unioni se associati a questo tree_id
        const { error: delPErr } = await supabase.from('people').delete().eq('tree_id', treeId);
        if (delPErr) throw delPErr;
      }

      // 1. Inserisce persone
      if (people.length > 0) {
        const { error: pErr } = await supabase.from('people').insert(
          people.map(p => ({ ...p, tree_id: treeId }))
        );
        if (pErr) throw pErr;
      }

      // 2. Inserisce unioni
      if (unions.length > 0) {
        const { error: uErr } = await supabase.from('unions').insert(
          unions.map(u => ({ ...u, tree_id: treeId }))
        );
        if (uErr) throw uErr;
      }
    } else {
      // Local Mock
      let allPeople = getLocalData('genealogy_people');
      let allUnions = getLocalData('genealogy_unions');

      if (overwrite) {
        allPeople = allPeople.filter(p => p.tree_id !== treeId);
        allUnions = allUnions.filter(u => u.tree_id !== treeId);
      }

      const importedPeople = people.map(p => ({
        ...p,
        tree_id: treeId,
        gender: p.gender || 'Other',
        birth_date: p.birth_date || '',
        death_date: p.death_date || '',
        birth_place: p.birth_place || '',
        illnesses: p.illnesses || [],
        notes: p.notes || '',
        avatar_url: p.avatar_url || '',
        created_at: new Date().toISOString()
      }));

      const importedUnions = unions.map(u => ({
        ...u,
        tree_id: treeId,
        partner2_id: u.partner2_id || null,
        children_ids: u.children_ids || [],
        type: u.type || 'relationship',
        created_at: new Date().toISOString()
      }));

      allPeople.push(...importedPeople);
      allUnions.push(...importedUnions);

      setLocalData('genealogy_people', allPeople);
      setLocalData('genealogy_unions', allUnions);
    }
  }
};
