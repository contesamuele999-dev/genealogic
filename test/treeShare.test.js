import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTreeShareUrl, getTreeIdFromUrl } from '../src/services/treeShare.js';

test('genera e legge il link specifico di un albero', () => {
  const url = buildTreeShareUrl('tree-123', 'https://example.test/ugene/index.html?foo=bar#old');
  assert.equal(url, 'https://example.test/ugene/index.html?foo=bar&tree=tree-123');
  assert.equal(getTreeIdFromUrl(url), 'tree-123');
});
