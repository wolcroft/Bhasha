/**
 * Audio recording and playback utilities.
 * Wraps expo-av for use in voice and conversation modes.
 */

import { Audio } from 'expo-av';
import type { Recording, Sound } from 'expo-av/build/Audio';

export type RecordingStatus = 'idle' | 'recording' | 'stopped' | 'error';

/** Request microphone permission. Returns true if granted. */
export async function requestMicrophonePermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

/** Configure audio session for recording (ducking other audio, speaker output). */
export async function configureAudioSession(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  });
}

/** Configure audio session for playback (no recording). */
export async function configurePlaybackSession(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  });
}

/** Start a new recording. Returns the Recording object. */
export async function startRecording(): Promise<Recording> {
  await configureAudioSession();
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
  );
  return recording;
}

/** Stop a recording and return the file URI. */
export async function stopRecording(recording: Recording): Promise<string | null> {
  await recording.stopAndUnloadAsync();
  await configurePlaybackSession();
  return recording.getURI() ?? null;
}

/** Play an audio file from a URI. Returns the Sound object for cleanup. */
export async function playAudioFile(uri: string): Promise<Sound> {
  const { sound } = await Audio.Sound.createAsync({ uri });
  await sound.playAsync();
  return sound;
}

/** Convert raw PCM samples to a Float32Array suitable for model inference. */
export function pcmBytesToFloat32(buffer: ArrayBuffer, sampleRate = 16000): Float32Array {
  const int16 = new Int16Array(buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

/** Compute a simple RMS energy level for waveform visualisation (0–1). */
export function computeRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}
