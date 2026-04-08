/**
 * ModelManager — copies bundled model assets to writable storage.
 *
 * v1.0 of Bhasha bundles all 3 model directions in the app binary (no CDN).
 * On first launch, this module:
 *   1. Iterates BUNDLED_MODELS for each direction
 *   2. Calls Asset.fromModule() + downloadAsync() to materialise each
 *      bundled binary into a local file URI on the device
 *   3. Copies that file URI into FileSystem.documentDirectory/models/<dir>/
 *      so ONNX Runtime and the BPE tokenizer can read them as plain paths
 *
 * The "download" terminology is preserved for the UI but no network is used.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import {
  getPackDirectory,
  isPackInstalled,
  type PackDirection,
  type LanguagePack,
  LANGUAGE_PACKS,
  getEncoderPath,
  getDecoderPath,
  getVocabPath,
  getMergesPath,
} from './LanguagePack';
import { BUNDLED_MODELS } from './bundledAssets';
import { setModelVersion, updateSettings, getSettings } from './storage';

export type DownloadStatus = 'idle' | 'downloading' | 'extracting' | 'installed' | 'error';

export interface PackState {
  id: PackDirection;
  status: DownloadStatus;
  progressFraction: number;
  errorMessage?: string;
}

type ProgressCallback = (state: PackState) => void;

const listeners = new Map<PackDirection, Set<ProgressCallback>>();
const packStates = new Map<PackDirection, PackState>();
const inProgress = new Set<PackDirection>();

function emit(state: PackState): void {
  packStates.set(state.id, state);
  for (const cb of listeners.get(state.id) ?? []) {
    cb(state);
  }
}

export function subscribeToPackState(id: PackDirection, cb: ProgressCallback): () => void {
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id)!.add(cb);
  const current = packStates.get(id);
  if (current) cb(current);
  return () => listeners.get(id)?.delete(cb);
}

export function getPackState(id: PackDirection): PackState {
  return packStates.get(id) ?? { id, status: 'idle', progressFraction: 0 };
}

/** Initialise state for all packs on app launch. */
export async function initModelManager(): Promise<void> {
  for (const pack of LANGUAGE_PACKS) {
    const installed = await isPackInstalled(pack.id);
    emit({
      id: pack.id,
      status: installed ? 'installed' : 'idle',
      progressFraction: installed ? 1 : 0,
    });
  }
}

/**
 * Materialise a bundled model pack into the writable document directory.
 * No network is used — assets are copied from the app bundle.
 */
export async function downloadPack(pack: LanguagePack): Promise<void> {
  const { id, version } = pack;
  if (inProgress.has(id)) return;
  inProgress.add(id);

  emit({ id, status: 'downloading', progressFraction: 0 });

  try {
    const destDir = getPackDirectory(id);
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

    const sources = BUNDLED_MODELS[id];
    const destinations: Record<keyof typeof sources, string> = {
      encoder: getEncoderPath(id),
      decoder: getDecoderPath(id),
      vocab: getVocabPath(id),
      merges: getMergesPath(id),
    };

    const entries = Object.entries(sources) as [keyof typeof sources, number][];
    let copied = 0;

    for (const [key, moduleId] of entries) {
      const asset = Asset.fromModule(moduleId);
      await asset.downloadAsync();

      if (!asset.localUri) {
        throw new Error(`Asset ${id}/${key} could not be materialised`);
      }

      const dest = destinations[key];
      // Remove any stale file at the destination first
      await FileSystem.deleteAsync(dest, { idempotent: true });
      await FileSystem.copyAsync({ from: asset.localUri, to: dest });

      copied += 1;
      emit({
        id,
        status: 'extracting',
        progressFraction: copied / entries.length,
      });
    }

    await setModelVersion(id, version);
    await markPackInstalled(id);

    emit({ id, status: 'installed', progressFraction: 1 });
  } catch (err: any) {
    emit({
      id,
      status: 'error',
      progressFraction: 0,
      errorMessage: err?.message ?? 'Install failed',
    });
  } finally {
    inProgress.delete(id);
  }
}

/** Bundled assets cannot be paused — kept for API compatibility. */
export async function pauseDownload(_id: PackDirection): Promise<void> {
  /* no-op */
}
export async function resumeDownload(_id: PackDirection): Promise<void> {
  /* no-op */
}

/** Delete a materialised pack from local storage. */
export async function deletePack(id: PackDirection): Promise<void> {
  const destDir = getPackDirectory(id);
  await FileSystem.deleteAsync(destDir, { idempotent: true });
  await removePackFromInstalled(id);
  emit({ id, status: 'idle', progressFraction: 0 });
}

/** Get total storage used by all materialised packs in bytes. */
export async function getStorageUsedBytes(): Promise<number> {
  let total = 0;
  for (const pack of LANGUAGE_PACKS) {
    const dir = getPackDirectory(pack.id);
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      total += info.size ?? 0;
    }
  }
  return total;
}

/**
 * Convenience: install all bundled packs in sequence on first launch.
 * Called from the onboarding finish handler.
 */
export async function installAllBundledPacks(): Promise<void> {
  for (const pack of LANGUAGE_PACKS) {
    if (await isPackInstalled(pack.id)) continue;
    await downloadPack(pack);
  }
}

async function markPackInstalled(id: PackDirection): Promise<void> {
  const settings = await getSettings();
  const packs = new Set(settings.installedPacks);
  packs.add(id);
  await updateSettings({ installedPacks: [...packs] });
}

async function removePackFromInstalled(id: PackDirection): Promise<void> {
  const settings = await getSettings();
  await updateSettings({
    installedPacks: settings.installedPacks.filter((p) => p !== id),
  });
}
