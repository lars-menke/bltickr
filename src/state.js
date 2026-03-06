import { APP_CONFIG } from './config.js';

const FAVORITES_KEY = 'bl_favorites';
const LEAGUE_KEY = 'bl_league';

export const state = {
  currentLeague: loadLeague(),
  favorites: loadFavorites(),
  matches: [],
  table: [],
  group: null,
};

export function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  state.favorites = favorites;
}

export function loadLeague() {
  const raw = localStorage.getItem(LEAGUE_KEY);
  return APP_CONFIG.supportedLeagues.includes(raw) ? raw : APP_CONFIG.defaultLeague;
}

export function setLeague(league) {
  localStorage.setItem(LEAGUE_KEY, league);
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
