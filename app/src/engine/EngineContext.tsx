/**
 * EngineContext — single source of truth for the on-device translation engine.
 *
 * Lifecycle:
 *   1. EngineProvider mounts at the root layout
 *   2. On first render, it materialises bundled model packs (if not yet copied)
 *      and initialises the BPE tokenizer + IndicProcessor
 *   3. Screens use `useEngine()` to call `translate(text, src, tgt)` directly
 *   4. The translator caches OnnxTranslator sessions per model direction
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
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { BPETokenizer, loadTokenizer } from './translation/tokenizer';
import { IndicProcessor } from './translation/IndicProcessor';
import {
  OnnxTranslator,
  getTranslator,
  type ModelDirection,
} from './translation/OnnxTranslator';
import {
  initModelManager,
  installAllBundledPacks,
  subscribeToPackState,
  type PackState,
} from '@/models/ModelManager';
import {
  LANGUAGE_PACKS,
  getPackDirectory,
  type PackDirection,
} from '@/models/LanguagePack';
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

export function EngineProvider({ children }: ProviderProps) {
  const [status, setStatus] = useState<EngineStatus>('initializing');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [packStates, setPackStates] = useState<Record<PackDirection, PackState>>({
    'en-indic': { id: 'en-indic', status: 'idle', progressFraction: 0 },
    'indic-en': { id: 'indic-en', status: 'idle', progressFraction: 0 },
    'indic-indic': { id: 'indic-indic', status: 'idle', progressFraction: 0 },
  });

  // Per-direction tokenizer + processor cache
  const tokenizers = useMemo(() => new Map<ModelDirection, BPETokenizer>(), []);
  const processors = useMemo(() => new Map<ModelDirection, IndicProcessor>(), []);

  const initEngine = useCallback(async () => {
    setStatus('initializing');
    setErrorMessage(undefined);

    try {
      // 1. Read on-disk pack state
      await initModelManager();

      // 2. Materialise bundled packs into writable storage if not already
      await installAllBundledPacks();

      // 3. Engine is ready — actual tokenizer/translator load happens lazily
      //    on the first translate() call to keep first paint fast.
      setStatus('ready');
    } catch (err: any) {
      console.error('[Engine] init failed:', err);
      setErrorMessage(err?.message ?? 'Engine initialisation failed');
      setStatus('error');
    }
  }, []);

  // Subscribe to all pack state updates
  useEffect(() => {
    const unsubs = LANGUAGE_PACKS.map((pack) =>
      subscribeToPackState(pack.id, (state) => {
        setPackStates((prev) => ({ ...prev, [pack.id]: state }));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // Initial engine bring-up
  useEffect(() => {
    initEngine();
  }, [initEngine]);

  // ─── Lazy loaders ──────────────────────────────────────────────────────────

  const ensureLoaded = useCallback(
    async (direction: ModelDirection, srcLang: string, tgtLang: string): Promise<OnnxTranslator> => {
      let tokenizer = tokenizers.get(direction);
      let processor = processors.get(direction);

      if (!tokenizer || !processor) {
        const modelDir = getPackDirectory(direction);
        tokenizer = await loadTokenizer(modelDir, srcLang, tgtLang);
        processor = new IndicProcessor(tokenizer);
        tokenizers.set(direction, tokenizer);
        processors.set(direction, processor);
      } else {
        // Update language tags on existing tokenizer
        // (the BPE merges + vocab are shared across directions)
        (tokenizer as any).srcLang = srcLang;
        (tokenizer as any).tgtLang = tgtLang;
      }

      const translator = getTranslator(direction, processor, tokenizer);
      if (!translator.isLoaded) {
        await translator.load(getPackDirectory(direction), direction);
      }
      return translator;
    },
    [tokenizers, processors],
  );

  // ─── translate() ───────────────────────────────────────────────────────────

  const translate = useCallback(
    async (text: string, srcLang: string, tgtLang: string): Promise<TranslateResult> => {
      if (status !== 'ready') {
        throw new Error(`Engine not ready (status: ${status})`);
      }
      if (!isPairSupported(srcLang, tgtLang)) {
        return {
          translation: '[Language pair not supported in v1.0]',
          latencyMs: 0,
        };
      }
      if (srcLang === tgtLang) {
        return { translation: text, latencyMs: 0 };
      }

      const direction = getModelDirection(srcLang, tgtLang);
      const translator = await ensureLoaded(direction, srcLang, tgtLang);
      return translator.translate(text, srcLang, tgtLang, { beamSize: 5 });
    },
    [status, ensureLoaded],
  );

  // ─── value ────────────────────────────────────────────────────────────────

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
