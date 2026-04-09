/**
 * Bundled TTS voice asset registry.
 *
 * Two Piper VITS voice packs ship with the app:
 *   eng_Latn  en_US-amy-low      60 MB  English (US, female)
 *   npi_Deva  ne_NP-google-x_low 26 MB  Nepali  (18 speakers, speakerId 0)
 *
 * Other NE languages (Assamese, Bengali, Manipuri, etc.) have no Piper
 * voice pack; the speak button silently no-ops for those languages.
 *
 * Each pack is two files:
 *   model.onnx      — Piper VITS neural TTS model (~60/26 MB)
 *   model.onnx.json — voice config (sample rate, phoneme map, speaker ids)
 *
 * The ONNX models are large binaries handled via expo-asset (require IDs).
 * The JSON configs are small (4 KB each) so they are inlined here and
 * written to disk by installAllBundledTTS() alongside the model.
 *
 * To update voice packs, replace the .onnx files in app/assets/tts/ and
 * update the inlined config objects below.
 */

export interface BundledTTSVoice {
  /** expo-asset require() ID for the ONNX model binary */
  modelAsset: number;
  /** Inlined voice config — written to model.onnx.json on first launch */
  config: object;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ENG_MODEL = require('../../assets/tts/eng_Latn/model.onnx') as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NPI_MODEL = require('../../assets/tts/npi_Deva/model.onnx') as number;

export const BUNDLED_TTS_VOICES: Record<string, BundledTTSVoice> = {
  eng_Latn: {
    modelAsset: ENG_MODEL,
    config: {"audio":{"sample_rate":16000,"quality":"low"},"espeak":{"voice":"en-us"},"inference":{"noise_scale":0.667,"length_scale":1,"noise_w":0.8},"phoneme_map":{},"phoneme_id_map":{"_":[0],"^":[1],"$":[2]," ":[3],"!":[4],"'":[5],"(":[6],")":[7],",":[8],"-":[9],".":[10],":":[11],";":[12],"?":[13],"a":[14],"b":[15],"c":[16],"d":[17],"e":[18],"f":[19],"h":[20],"i":[21],"j":[22],"k":[23],"l":[24],"m":[25],"n":[26],"o":[27],"p":[28],"q":[29],"r":[30],"s":[31],"t":[32],"u":[33],"v":[34],"w":[35],"x":[36],"y":[37],"z":[38],"\u00e6":[39],"\u00e7":[40],"\u00f0":[41],"\u00f8":[42],"\u0127":[43],"\u014b":[44],"\u0153":[45],"\u01c0":[46],"\u01c1":[47],"\u01c2":[48],"\u01c3":[49],"\u0250":[50],"\u0251":[51],"\u0252":[52],"\u0253":[53],"\u0254":[54],"\u0255":[55],"\u0256":[56],"\u0257":[57],"\u0258":[58],"\u0259":[59],"\u025a":[60],"\u025b":[61],"\u025c":[62],"\u025e":[63],"\u025f":[64],"\u0260":[65],"\u0261":[66],"\u0262":[67],"\u0263":[68],"\u0264":[69],"\u0265":[70],"\u0266":[71],"\u0267":[72],"\u0268":[73],"\u026a":[74],"\u026b":[75],"\u026c":[76],"\u026d":[77],"\u026e":[78],"\u026f":[79],"\u0270":[80],"\u0271":[81],"\u0272":[82],"\u0273":[83],"\u0274":[84],"\u0275":[85],"\u0276":[86],"\u0278":[87],"\u0279":[88],"\u027a":[89],"\u027b":[90],"\u027d":[91],"\u027e":[92],"\u0280":[93],"\u0281":[94],"\u0282":[95],"\u0283":[96],"\u0284":[97],"\u0288":[98],"\u0289":[99],"\u028a":[100],"\u028b":[101],"\u028c":[102],"\u028d":[103],"\u028e":[104],"\u028f":[105],"\u0290":[106],"\u0291":[107],"\u0292":[108],"\u0294":[109],"\u0295":[110],"\u0298":[111],"\u0299":[112],"\u029b":[113],"\u029c":[114],"\u029d":[115],"\u029f":[116],"\u02a1":[117],"\u02a2":[118],"\u02b2":[119],"\u02c8":[120],"\u02cc":[121],"\u02d0":[122],"\u02d1":[123],"\u02de":[124],"\u03b2":[125],"\u03b8":[126],"\u03c7":[127],"\u1d7b":[128],"\u2c71":[129]},"num_symbols":130,"num_speakers":1,"speaker_id_map":{},"piper_version":"0.2.0","language":{"code":"en_US","family":"en","region":"US","name_native":"English","name_english":"English","country_english":"United States"},"dataset":"amy"},
  },
  npi_Deva: {
    modelAsset: NPI_MODEL,
    config: {"audio":{"sample_rate":16000,"quality":"x_low"},"espeak":{"voice":"ne"},"inference":{"noise_scale":0.667,"length_scale":1,"noise_w":0.8},"phoneme_map":{},"phoneme_id_map":{"_":[0],"^":[1],"$":[2]," ":[3],"!":[4],"'":[5],"(":[6],")":[7],",":[8],"-":[9],".":[10],":":[11],";":[12],"?":[13],"a":[14],"b":[15],"c":[16],"d":[17],"e":[18],"f":[19],"h":[20],"i":[21],"j":[22],"k":[23],"l":[24],"m":[25],"n":[26],"o":[27],"p":[28],"q":[29],"r":[30],"s":[31],"t":[32],"u":[33],"v":[34],"w":[35],"x":[36],"y":[37],"z":[38],"\u00e6":[39],"\u00e7":[40],"\u00f0":[41],"\u00f8":[42],"\u0127":[43],"\u014b":[44],"\u0153":[45],"\u01c0":[46],"\u01c1":[47],"\u01c2":[48],"\u01c3":[49],"\u0250":[50],"\u0251":[51],"\u0252":[52],"\u0253":[53],"\u0254":[54],"\u0255":[55],"\u0256":[56],"\u0257":[57],"\u0258":[58],"\u0259":[59],"\u025a":[60],"\u025b":[61],"\u025c":[62],"\u025e":[63],"\u025f":[64],"\u0260":[65],"\u0261":[66],"\u0262":[67],"\u0263":[68],"\u0264":[69],"\u0265":[70],"\u0266":[71],"\u0267":[72],"\u0268":[73],"\u026a":[74],"\u026b":[75],"\u026c":[76],"\u026d":[77],"\u026e":[78],"\u026f":[79],"\u0270":[80],"\u0271":[81],"\u0272":[82],"\u0273":[83],"\u0274":[84],"\u0275":[85],"\u0276":[86],"\u0278":[87],"\u0279":[88],"\u027a":[89],"\u027b":[90],"\u027d":[91],"\u027e":[92],"\u0280":[93],"\u0281":[94],"\u0282":[95],"\u0283":[96],"\u0284":[97],"\u0288":[98],"\u0289":[99],"\u028a":[100],"\u028b":[101],"\u028c":[102],"\u028d":[103],"\u028e":[104],"\u028f":[105],"\u0290":[106],"\u0291":[107],"\u0292":[108],"\u0294":[109],"\u0295":[110],"\u0298":[111],"\u0299":[112],"\u029b":[113],"\u029c":[114],"\u029d":[115],"\u029f":[116],"\u02a1":[117],"\u02a2":[118],"\u02b2":[119],"\u02c8":[120],"\u02cc":[121],"\u02d0":[122],"\u02d1":[123],"\u02de":[124],"\u03b2":[125],"\u03b8":[126],"\u03c7":[127],"\u1d7b":[128],"\u2c71":[129]},"num_symbols":130,"num_speakers":18,"speaker_id_map":{"0546":0,"3614":1,"2099":2,"3960":3,"6834":4,"7957":5,"6329":6,"9407":7,"6587":8,"0258":9,"2139":10,"5687":11,"0283":12,"3997":13,"3154":14,"0883":15,"2027":16,"0649":17},"piper_version":"0.2.0","language":{"code":"ne_NP","family":"ne","region":"NP","name_native":"\u0928\u0947\u092a\u093e\u0932\u0940","name_english":"Nepali","country_english":"Nepal"},"dataset":"google"},
  },
};
