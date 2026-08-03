export function getTreeIdFromUrl(currentUrl = window.location.href) {
  return new URL(currentUrl).searchParams.get('tree') || '';
}

export function buildTreeShareUrl(treeId, currentUrl = window.location.href) {
  const url = new URL(currentUrl);
  url.searchParams.set('tree', treeId);
  url.hash = '';
  return url.toString();
}

export function replaceTreeInUrl(treeId) {
  window.history.replaceState({}, '', buildTreeShareUrl(treeId));
}

