import { parseMidi, type ParsedMidi, type RawTrack } from "../core/midi";
import { convert, type Assignment, type ConvertOptions } from "../core/converter";
import { isDrumTrack } from "../core/transforms/drums";
import { sanitizeName } from "../io/index-ops";
import type { Partition } from "../core/types";

export { parseMidi };
export type { ParsedMidi, RawTrack, Assignment };

export interface PreparedSong {
  name: string;
  partition: Partition;
}

/** Tracks worth offering for lute/flute assignment: non-drum, and actually have notes. */
export function melodicTracks(midi: ParsedMidi): RawTrack[] {
  return midi.tracks.filter((t) => !isDrumTrack(t) && t.notes.length > 0);
}

/** Combine filename + assignment + parsed MIDI into a named, converted partition. */
export function prepareSong(
  midi: ParsedMidi,
  assignment: Assignment,
  filename: string,
  offsets: Record<number, number> = {},
  nameOverride?: string,
  settings: Pick<ConvertOptions, "fold" | "maxPerChord" | "maxGapSec"> = {},
): PreparedSong {
  const name = sanitizeName(nameOverride ?? filename);
  return { name, partition: convert(midi, assignment, name, { offsets, ...settings }) };
}
