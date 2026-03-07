import { APP_CONFIG } from './config.js';
import {
  state,
  loadFavorites,
  saveFavorites,
  loadLeague,
  setLeague,
  setMatches,
  setTable,
  setGroup
} from './state.js';
import {
  fetchJson,
  fetchCurrentGroup,
  fetchMatchData,
  fetchTable,
  subscribePush
} from './api.js';
import {
  registerServiceWorker,
  requestNotificationPermission,
  ensurePushSubscription,
  renewExistingSubscription
} from './push.js';
import {
  loadTeamIconsForLeague,
  getResolvedTeamIcon
} from './teamIcons.js';

window.BLTICKR = {
  APP_CONFIG,
  state,
  loadFavorites,
  saveFavorites,
  loadLeague,
  setLeague,
  setMatches,
  setTable,
  setGroup,
  fetchJson,
  fetchCurrentGroup,
  fetchMatchData,
  fetchTable,
  subscribePush,
  registerServiceWorker,
  requestNotificationPermission,
  ensurePushSubscription,
  renewExistingSubscription,
  loadTeamIconsForLeague,
  getResolvedTeamIcon,
};
