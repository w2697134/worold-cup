export const ACTIVE_MATCH_STORAGE_KEY = "worldcup-2026-active-match-id";
export const ACTIVE_MATCH_EVENT = "worldcup:active-match-changed";

export const KNOWLEDGE_STORAGE_KEY = "worldcup-2026-knowledge-v1";
export const KNOWLEDGE_UPDATED_EVENT = "worldcup:knowledge-updated";

export const PREDICTION_CACHE_STORAGE_KEY = "worldcup-2026-predictions-v1";

export const AUTH_USERS_STORAGE_KEY = "worldcup-2026-users-v1";
export const AUTH_SESSION_STORAGE_KEY = "worldcup-2026-session-v1";

export interface AuthUser {
  id: string;
  name: string;
  token?: string;
}

export function scopedStorageKey(baseKey: string, userId: string): string {
  return `${baseKey}:${userId}`;
}
