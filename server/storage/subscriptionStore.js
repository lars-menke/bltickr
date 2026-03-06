import fs from 'fs';
import path from 'path';

export function createSubscriptionStore(subsFile) {
  let subscriptions = {};

  function load() {
    try {
      if (fs.existsSync(subsFile)) {
        subscriptions = JSON.parse(fs.readFileSync(subsFile, 'utf8'));
        console.log('[store]', Object.keys(subscriptions).length, 'Subscriptions geladen');
      }
    } catch (e) {
      console.warn('[store] Ladefehler:', e.message);
    }
  }

  function save() {
    try {
      fs.mkdirSync(path.dirname(subsFile), { recursive: true });
      fs.writeFileSync(subsFile, JSON.stringify(subscriptions, null, 2));
    } catch (e) {
      console.warn('[store] Speicherfehler:', e.message);
    }
  }

  function makeKey(endpoint) {
    return Buffer.from(endpoint)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 64);
  }

  function add(body) {
    const { favorites: favs, ...pushSub } = body;
    const key = makeKey(pushSub.endpoint);

    subscriptions[key] = {
      subscription: pushSub,
      favorites: Array.isArray(favs) ? favs : [],
      createdAt: new Date().toISOString(),
    };

    save();
    return key;
  }

  function remove(key) {
    if (!subscriptions[key]) return false;
    delete subscriptions[key];
    save();
    return true;
  }

  function get(key) {
    return subscriptions[key] || null;
  }

  function keys() {
    return Object.keys(subscriptions);
  }

  function count() {
    return Object.keys(subscriptions).length;
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
