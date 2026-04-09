/**
 * EngineContext — single source of truth for the on-device translation engine.
 *
 * Lifecycle:
 *   1. EngineProvider mounts at the root layout.
 *   2. On first render, it materialises bundled model packs (if not yet copied)
 *      to writable storage.
 *   3. Screens use `useEngine()` to call `translate(text, src, tgt)` directly.
 *   4. The translator caches OnnxTranslator sessions per model direction; the
 *      sessions hold the encoder, decoder, tokenizer.onnx, and detokenizer.onnx
 *      for that direction. Switching src/tgt within the same direction reloads
 *      only because the language tag pair is part of OnnxTokenizer's state —
 *      a future optimisation would parameterise that at run() time.
 *
 * Engine state is exposed via `engine.status` so screens can show:
 *   - 'initializing' — first-launch asset copy in progress
 *   - 'ready'        — translator is loaded and usable
 *   - 'error'        — failed to load (missing models, asset error, etc.)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  OnnxTranslator,
  getTranslator,
  type ModelDirection,
  type ModelPaths,
} from './translation/OnnxTranslator';
import {
  initModelManager,
  installAllBundledPacks,
  installAllBundledTTS,
  subscribeToPackState,
  type PackState,
} from '@/models/ModelManager';
import {
  LANGUAGE_PACKS,
  getEncoderPath,
  getDecoderPath,
  getTokenizerPath,
  getDetokenizerPath,
  type PackDirection,
} from '@/models/LanguagePack';
import { BUNDLED_MODELS } from '@/models/bundledAssets';
import { getModelDirection, isPairSupported } from '@/utils/languages';

export type EngineStatus = 'initializing' | 'ready' | 'error' | 'unsupported';

export interface EngineState {
  status: EngineStatus;
  errorMessage?: string;
  /** Per-pack download/install progress for the settings UI. */
  packStates: Record<PackDirection, PackState>;
  /** Translate text from src → tgt, returning translated text + latency. */
  translate: (text: string, srcLang: string, tgtLang: string) => Promise<TranslateResult>;
  /** True if both languages have a working bundled model. */
  isPairSupported: (srcLang: string, tgtLang: string) => boolean;
  /** Force a re-init (used after a delete + redownload). */
  reload: () => Promise<void>;
}

export interface TranslateResult {
  translation: string;
  latencyMs: number;
}

const EngineContext = createContext<EngineState | null>(null);

export function useEngine(): EngineState {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used within EngineProvider');
  return ctx;
}

interface ProviderProps { children: ReactNode; }

function pathsForDirection(direction: ModelDirection): ModelPaths {
  return {
    encoder:     getEncoderPath(direction),
    decoder:     getDecoderPath(direction),
    tokenizer:   getTokenizerPath(direction),
    detokenizer: getDetokenizerPath(direction),
    // tokensMeta is bundled as a JS module — no file IO required.
    tokensMeta:  BUNDLED_MODELS[direction].tokensMeta,
  };
}

export function EngineProvider({ children }: ProviderProps) {
  const [status, setStatus] = useState<EngineStatus>('initializing');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [packStates, setPackStates] = useState<Record<PackDirection, PackState>>(() => {
    const initial = {} as Record<PackDirection, PackState>;
    for (const pack of LANGUAGE_PACKS) {
      initial[pack.id] = { id: pack.id, status: 'idle', progressFraction: 0 };
    }
    return initial;
  });

  const initEngine = useCallback(async () => {
    setStatus('initializing');
    setErrorMessage(undefined);
    try {
      await initModelManager();
      await installAllBundledPacks();
      // TTS voice packs are installed in parallel — not on the critical path.
      installAllBundledTTS().catch((err) =>
        console.warn('[Engine] TTS install failed:', err),
      );
      // Sessions load lazily on the first translate() call to keep first paint fast.
      setStatus('ready');
    } catch (err: any) {
      console.error('[Engine] init failed:', err);
      setErrorMessage(err?.message ?? 'Engine initialisation failed');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const unsubs = LANGUAGE_PACKS.map((pack) =>
      subscribeToPackState(pack.id, (state) => {
        setPackStates((prev) => ({ ...prev, [pack.id]: state }));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    initEngine();
  }, [initEngine]);

  // ─── Lazy loader ───────────────────────────────────────────────────────────

  const ensureLoaded = useCallback(
    async (direction: ModelDirection, srcLang: string, tgtLang: string): Promise<OnnxTranslator> => {
      const translator = getTranslator(direction);
      await translator.load(pathsForDirection(direction), direction, srcLang, tgtLang);
      return translator;
    },
    [],
  );

  // ─── translate() ───────────────────────────────────────────────────────────

  const translate = useCallback(
    async (text: string, srcLang: string, tgtLang: string): Promise<TranslateResult> => {
      if (status !== 'ready') {
        throw new Error(`Engine not ready (status: ${status})`);
      }
      if (!isPairSupported(srcLang, tgtLang)) {
        return { translation: '[Language pair not supported in v1.0]', latencyMs: 0 };
      }
      if (srcLang === tgtLang) {
        return { translation: text, latencyMs: 0 };
      }

      const direction = getModelDirection(srcLang, tgtLang);
      const translator = await ensureLoaded(direction, srcLang, tgtLang);
      return translator.translate(text, { beamSize: 5 });
    },
    [status, ensureLoaded],
  );

  const value: EngineState = {
    status,
    errorMessage,
    packStates,
    translate,
    isPairSupported,
    reload: initEngine,
  };

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}
