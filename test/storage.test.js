import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  #data = new Map();

  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }

  setItem(key, value) {
    this.#data.set(key, String(value));
  }

  removeItem(key) {
    this.#data.delete(key);
  }
}

globalThis.localStorage = new MemoryStorage();
const { storage } = await import('../src/services/storage.js');

test('il fallback locale mantiene integre persone, relazioni e permessi', async () => {
  await storage.signUp('admin@example.test', 'secret', 'Admin', 'Test');
  const tree = await storage.createTree('Albero Test', 'Debug');
  const parent = await storage.addPerson({ tree_id: tree.id, first_name: 'Parent' });
  const child = await storage.addPerson({ tree_id: tree.id, first_name: 'Child' });
  const union = await storage.addUnion({
    tree_id: tree.id,
    partner1_id: parent.id,
    children_ids: [child.id]
  });

  await storage.deletePerson(child.id);
  assert.deepEqual((await storage.getUnions(tree.id))[0].children_ids, []);

  await storage.deletePerson(parent.id);
  assert.deepEqual(await storage.getUnions(tree.id), []);

  await storage.signUp('guest@example.test', 'secret', 'Guest', 'Test');
  await assert.rejects(
    () => storage.updateTree(tree.id, 'Tentativo', '', 'public', 'owner'),
    /Solo il proprietario o un amministratore/
  );

  await storage.signIn('admin@example.test', 'secret');
  await storage.approveUser((await storage.getPendingUsers())[0].id);
  assert.equal((await storage.getUsersList()).length, 2);

  // Verifica anche che l'unione creata fosse quella attesa prima della pulizia.
  assert.ok(union.id);
});
