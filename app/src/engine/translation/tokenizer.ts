/**
 * BPE Tokenizer for IndicTrans2
 *
 * IndicTrans2 uses SentencePiece (BPE) with a vocabulary of ~32K tokens,
 * shared across all 22 Indic languages + English. The vocabulary file
 * (vocab.json + merges.txt) is loaded from the downloaded model pack.
 *
 * This is a runtime JS tokenizer — it operates identically to the Python
 * HuggingFace tokenizer, enabling on-device preprocessing without Python.
 */

import * as FileSystem from 'expo-file-system/legacy';

export interface TokenizerConfig {
  vocabPath: string;   // Path to vocab.json
  mergesPath: string;  // Path to merges.txt
  srcLang: string;     // e.g. "eng_Latn"
  tgtLang: string;     // e.g. "hin_Deva"
}

type Vocab = Record<string, number>;
type MergeRanks = Map<string, number>;

/**
 * BPETokenizer — JavaScript port of HuggingFace's BPE tokenizer
 * tailored for IndicTrans2's SentencePiece-style BPE vocabulary.
 */
export class BPETokenizer {
  private vocab: Vocab = {};
  private mergeRanks: MergeRanks = new Map();
  private idToToken: string[] = [];
  private srcLang: string;
  private tgtLang: string;
  private bosTokenId = 2;
  private eosTokenId = 3;
  private padTokenId = 1;
  private unkTokenId = 0;
  private initialized = false;

  constructor(config: TokenizerConfig) {
    this.srcLang = config.srcLang;
    this.tgtLang = config.tgtLang;
  }

  async initialize(vocabJson: string, mergesTxt: string): Promise<void> {
    // Parse vocab
    this.vocab = JSON.parse(vocabJson) as Vocab;
    this.idToToken = new Array(Object.keys(this.vocab).length);
    for (const [token, id] of Object.entries(this.vocab)) {
      this.idToToken[id] = token;
    }

    // Parse merges
    const lines = mergesTxt.split('\n').filter((l) => l && !l.startsWith('#'));
    for (let i = 0; i < lines.length; i++) {
      this.mergeRanks.set(lines[i], i);
    }

    this.initialized = true;
  }

  /**
   * Encode text to token IDs.
   * Prepends src_lang token and appends eos + tgt_lang token per IndicTrans2 format.
   */
  encode(text: string): number[] {
    if (!this.initialized) throw new Error('Tokenizer not initialized. Call initialize() first.');

    const srcLangId = this.vocab[this.srcLang] ?? this.unkTokenId;
    const tgtLangId = this.vocab[this.tgtLang] ?? this.unkTokenId;

    const wordPieces = this.bpeEncode(text);
    const ids = wordPieces.map((piece) => this.vocab[piece] ?? this.unkTokenId);

    // IndicTrans2 format: [src_lang_id, ...token_ids, eos_id]
    // The decoder is primed with [tgt_lang_id] as the first forced token
    return [srcLangId, ...ids, this.eosTokenId];
  }

  /** Decode token IDs back to text. */
  decode(ids: number[], skipSpecialTokens = true): string {
    const specialIds = new Set([this.bosTokenId, this.eosTokenId, this.padTokenId]);
    const tokens = ids
      .filter((id) => !skipSpecialTokens || !specialIds.has(id))
      .map((id) => this.idToToken[id] ?? '<unk>');

    // SentencePiece uses ▁ (U+2581) as word boundary marker
    return tokens.join('').replace(/▁/g, ' ').trim();
  }

  /** Get the token ID for the target language — used as forced BOS for decoding. */
  getTgtLangId(): number {
    return this.vocab[this.tgtLang] ?? this.unkTokenId;
  }

  get eosId(): number { return this.eosTokenId; }
  get padId(): number { return this.padTokenId; }

  // ─── BPE core ─────────────────────────────────────────────────────────────

  private bpeEncode(text: string): string[] {
    // Pre-tokenize: split on whitespace, add ▁ prefix to each word
    const words = text.split(/\s+/).filter(Boolean);
    const result: string[] = [];

    for (const word of words) {
      const prefixed = '▁' + word;
      result.push(...this.bpeEncodeWord(prefixed));
    }

    return result;
  }

  private bpeEncodeWord(word: string): string[] {
    // Start with individual characters
    let symbols: string[] = [...word];

    while (symbols.length > 1) {
      // Find the pair with the lowest merge rank
      let bestRank = Infinity;
      let bestIdx = -1;

      for (let i = 0; i < symbols.length - 1; i++) {
        const pair = `${symbols[i]} ${symbols[i + 1]}`;
        const rank = this.mergeRanks.get(pair);
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) break; // No more merges possible

      // Apply the best merge
      const merged = symbols[bestIdx] + symbols[bestIdx + 1];
      symbols = [
        ...symbols.slice(0, bestIdx),
        merged,
        ...symbols.slice(bestIdx + 2),
      ];
    }

    return symbols;
  }
}

/**
 * Load and initialise a BPETokenizer from a materialised pack directory.
 * Tokenizer files are stored as `vocab.txt` (JSON content) and `merges.txt`
 * because Metro treats `.json` files as JS modules — `.txt` is bundled as
 * a raw asset and read at runtime via FileSystem.
 */
export async function loadTokenizer(
  modelDir: string,
  srcLang: string,
  tgtLang: string,
): Promise<BPETokenizer> {
  const vocabPath = `${modelDir}/vocab.txt`;
  const mergesPath = `${modelDir}/merges.txt`;

  const [vocabJson, mergesTxt] = await Promise.all([
    FileSystem.readAsStringAsync(vocabPath),
    FileSystem.readAsStringAsync(mergesPath),
  ]);

  const tokenizer = new BPETokenizer({ vocabPath, mergesPath, srcLang, tgtLang });
  await tokenizer.initialize(vocabJson, mergesTxt);
  return tokenizer;
}
