import { Midi } from "@tonejs/midi";

export interface RawNote {
  ticks: number;
  midi: number;
  durationTicks: number;
  durationSec: number;
  timeSec?: number; // absolute start time in seconds (honours the MIDI tempo map)
}

export interface RawTrack {
  index: number;
  name: string;
  channel: number;
  isPercussion: boolean;
  pitchRange: [number, number] | null;
  notes: RawNote[];
}

export interface ParsedMidi {
  ppq: number;
  tempos: { ticks: number; bpm: number }[];
  tracks: RawTrack[];
}

/**
 * Lowest and highest pitch among the notes, or null if there are none. A loop rather
 * than Math.min(...spread): spreading a very large array as call arguments overflows
 * the stack (a dense MIDI can have well over 100k notes in one track).
 */
export function pitchRange(notes: readonly { midi: number }[]): [number, number] | null {
  if (!notes.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) {
    if (n.midi < lo) lo = n.midi;
    if (n.midi > hi) hi = n.midi;
  }
  return [lo, hi];
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function parseMidi(bytes: Uint8Array): ParsedMidi {
  const midi = new Midi(bytes);
  // A time division of 0, or an SMPTE (frames-per-second) division, leaves @tonejs/midi
  // with no usable ticks-per-beat, so every note time comes out NaN or Infinity.
  if (!(midi.header.ppq > 0)) throw new Error("Unsupported MIDI time division (ticks per beat must be positive).");
  const tracks: RawTrack[] = midi.tracks.map((t, index) => {
    const notes: RawNote[] = t.notes.map((n) => ({
      ticks: n.ticks,
      midi: n.midi,
      durationTicks: n.durationTicks,
      durationSec: n.duration,
      timeSec: n.time,
    }));
    return {
      index,
      name: t.name?.trim() || titleCase(t.instrument?.name ?? "") || `Track ${index + 1}`,
      channel: t.channel,
      isPercussion: t.instrument?.percussion ?? t.channel === 9,
      pitchRange: pitchRange(notes),
      notes,
    };
  });
  return {
    ppq: midi.header.ppq,
    tempos: midi.header.tempos.map((x) => ({ ticks: x.ticks, bpm: x.bpm })),
    tracks,
  };
}
