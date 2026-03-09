import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

export function createSubscriptionStore(subsFile) {
  let subscriptions = {};
  let _count = 0; // O(1) Counter statt Object.keys() bei jedem Aufruf

  // Write-Guard: verhindert konkurrierende fs.writeFile-Aufrufe
  let saveInProgress = false;
  let savePending = false;

  async function load() {
    try {
      const data = await fs.readFile(subsFile, 'utf8');
      subscriptions = JSON.parse(data);
      _count = Object.keys(subscriptions).length;
      console.log('[store]', _count, 'Subscriptions geladen');
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[store] Ladefehler:', e.message);
    }
  }

  async function save() {
    if (saveInProgress) { savePending = true; return; }
    saveInProgress = true;
    try {
      await fs.mkdir(path.dirname(subsFile), { recursive: true });
      await fs.writeFile(subsFile, JSON.stringify(subscriptions, null, 2));
    } catch (e) {
      console.warn('[store] Speicherfehler:', e.message);
    } finally {
      saveInProgress = false;
      if (savePending) { savePending = false; save(); }
    }
  }

  function makeKey(endpoint) {
    return createHash('sha256').update(endpoint).digest('hex');
  }

  async function add(body) {
    const { favorites: favs, ...pushSub } = body;
    const key = makeKey(pushSub.endpoint);

    const isNew = !subscriptions[key];
    subscriptions[key] = {
      subscription: pushSub,
      favorites: Array.isArray(favs) ? favs : [],
      createdAt: new Date().toISOString(),
    };
    if (isNew) _count++;

    await save();
    return key;
  }

  async function remove(key) {
    if (!subscriptions[key]) return false;
    delete subscriptions[key];
    _count--;
    await save();
    return true;
  }

  function get(key) {
    return subscriptions[key] || null;
  }

  function keys() {
    return Object.keys(subscriptions);
  }

  function count() {
    return _count;
  }

  function listForAdmin() {
    return Object.entries(subscriptions).map(([key, s]) => ({
      key,
      endpoint: s.subscription.endpoint.slice(0, 60) + '…',
      favorites: s.favorites,
      createdAt: s.createdAt,
    }));
  }

  return {
    load,
    save,
    add,
    remove,
    get,
    keys,
    count,
    listForAdmin,
  };
}
