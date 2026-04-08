/**
 * Local storage utilities using AsyncStorage.
 * Typed wrappers for translation history, settings, and language pack state.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TranslationHistoryItem {
  id: string;
  sourceText: string;
  targetText: string;
  srcLang: string;
  tgtLang: string;
  timestamp: number;
  isFavorite?: boolean;
}

export interface AppSettings {
  lastSrcLang: string;
  lastTgtLang: string;
  ttsEnabled: boolean;
  autoDetectLang: boolean;
  onboardingComplete: boolean;
  installedPacks: string[];   // model direction keys e.g. ['en-indic', 'indic-en']
}

const KEYS = {
  HISTORY: 'bhasha:history',
  SETTINGS: 'bhasha:settings',
  MODEL_VERSIONS: 'bhasha:model_versions',
};

const DEFAULT_SETTINGS: AppSettings = {
  lastSrcLang: 'eng_Latn',
  lastTgtLang: 'hin_Deva',
  ttsEnabled: true,
  autoDetectLang: true,
  onboardingComplete: false,
  installedPacks: [],
};

// ─── Translation History ──────────────────────────────────────────────────────

export async function getHistory(): Promise<TranslationHistoryItem[]> {
  const raw = await AsyncStorage.getItem(KEYS.HISTORY);
  return raw ? (JSON.parse(raw) as TranslationHistoryItem[]) : [];
}

export async function addToHistory(item: Omit<TranslationHistoryItem, 'id' | 'timestamp'>): Promise<void> {
  const history = await getHistory();
  const newItem: TranslationHistoryItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  // Keep last 500 items
  const updated = [newItem, ...history].slice(0, 500);
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
}

export async function toggleFavorite(id: string): Promise<void> {
  const history = await getHistory();
  const updated = history.map((item) =>
    item.id === id ? { ...item, isFavorite: !item.isFavorite } : item,
  );
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.HISTORY);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
  return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) } : DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify({ ...current, ...patch }));
}

// ─── Model versions ───────────────────────────────────────────────────────────

export async function getModelVersion(direction: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(KEYS.MODEL_VERSIONS);
  const versions = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  return versions[direction] ?? null;
}

export async function setModelVersion(direction: string, version: string): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.MODEL_VERSIONS);
  const versions = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  versions[direction] = version;
  await AsyncStorage.setItem(KEYS.MODEL_VERSIONS, JSON.stringify(versions));
}
