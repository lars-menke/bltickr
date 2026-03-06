import { APP_CONFIG } from './config.js';

export const state = {
  currentLeague: APP_CONFIG.defaultLeague,
  favorites: loadFavorites(),
  matches: [],
  table: [],
  group: null,
};

export function loadFavorites() {
  try {
    const raw = localStorage.getItem('bltickr_favorites');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites) {
  localStorage.setItem('bltickr_favorites', JSON.stringify(favorites));
  state.favorites = favorites;
}

export function setLeague(league) {
  state.currentLeague = league;
}

export function setMatches(matches) {
  state.matches = matches;
}

export function setTable(table) {
  state.table = table;
}

export function setGroup(group) {
  state.group = group;
}
