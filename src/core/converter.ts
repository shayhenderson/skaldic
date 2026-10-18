import type { Partition, Track, Note } from "./types";
import type { ParsedMidi, RawNote } from "./midi";
import { instrumentById } from "./instruments";
import { removeDrums } from "./transforms/drums";
import { fitToInstrument, clampToInstrument } from "./transforms/range";
import { thinNotes } from "./transforms/thin";
import { capGaps } from "./transforms/gaps";

/** track index → instrument id, or null = off */
export type Assignment = Record<number, 0 | 1 | null>;

export interface ConvertOptions {
  cooldownTicks?: number;
  maxPerChord?: number;
  maxGapSec?: number;
  offsets?: Record<number, number>; // track index → octave shift, applied before range-fitting
  fold?: boolean; // octave-fold out-of-range notes (default true); false = clamp to range
}

export function convert(
  midi: ParsedMidi,
  assignment: Assignment,
  name: string,
  opts: ConvertOptions = {},
): Partition {
  const cooldownTicks = opts.cooldownTicks ?? 0; // default: rely on in-game cooldown; tune later
  const maxPerChord = opts.maxPerChord ?? 3;
  // A degenerate tempo (0/NaN/Infinity bpm, or ppq 0) must not reach the output:
  // it propagates into every tick and the |name;tempo| header, and can hang the game.
  const rawTempo = midi.tempos.length
    ? Math.round(60_000_000 / midi.tempos[0].bpm / midi.ppq)
    : 1000;
  const tempo = Number.isFinite(rawTempo) && rawTempo > 0 ? rawTempo : 1000;
  const assignedTracks = removeDrums(midi.tracks).filter(
    (rt) => assignment[rt.index] === 0 || assignment[rt.index] === 1,
  );

  // Position each note by its real start time at the constant header tempo. @tonejs/midi's
  // n.time already honours the MIDI tempo map, so this bakes any tempo changes into the
  // tick positions (we emit no inline tempo events) — multi-tempo songs then play at the
  // right speed throughout. For a single-tempo song this equals the raw ticks. (Synthetic
  // test fixtures without timeSec fall back to raw ticks.)
  const ptick = (n: RawNote) =>
    n.timeSec !== undefined ? Math.round((n.timeSec * 1_000_000) / tempo) : n.ticks;

  // Drop any note whose position or length isn't a finite number. A NaN or Infinity
  // here would be written verbatim into the partition (e.g. `#0;NaN-36-1-NaN`), which
  // LuteMod can't play; parseMidi rejects the known cause (a bad time division), and
  // this keeps any other malformed input from reaching the output.
  const playable = (n: RawNote) => Number.isFinite(ptick(n)) && Number.isFinite(n.durationSec);
  const assigned = assignedTracks.map((rt) => ({ ...rt, notes: rt.notes.filter(playable) }));

  // Normalize so the earliest note sits at tick 0 — Mordhau needs a note near tick 0 to
  // start playing; a track that begins seconds in would play late, or not at all.
  let offset = Infinity;
  for (const rt of assigned)
    for (const n of rt.notes) {
      const p = ptick(n);
      if (p < offset) offset = p;
    }
  if (!isFinite(offset)) offset = 0;
  const shift = (tick: number) => Math.max(0, tick - offset);

  // No tempo events in the note stream: the header tempo drives playback, and a
  // type-2 event sharing tick 0 with the first note makes Mordhau play only that note.
  const tracks: Track[] = [];
  for (const rt of assigned) {
    const id = assignment[rt.index] as 0 | 1;
    const inst = instrumentById(id);
    const semis = 12 * (opts.offsets?.[rt.index] ?? 0);
    const place = opts.fold === false ? clampToInstrument : fitToInstrument;
    const onNotes: Note[] = rt.notes.map((n) => ({
      tick: shift(ptick(n)),
      tone: place(n.midi + semis, inst),
      type: 1,
      duration: Math.round(n.durationSec * 1000) / 1000, // ms precision; avoids 17-digit floats in output
    }));
    const thinned = thinNotes(onNotes, { cooldownTicks, maxPerChord });
    const notes = thinned.slice().sort((a, b) => a.tick - b.tick);
    tracks.push({ instrumentId: id, notes });
  }

  // Mordhau stops playback when it hits a very long silent gap; cap gaps in the
  // combined timeline so the song runs end-to-end and later notes (e.g. a flute
  // that enters late) are reached. Both tracks shift together, staying in sync.
  const maxGapTicks = Math.max(1, Math.round(((opts.maxGapSec ?? 1.0) * 1_000_000) / tempo));
  capGaps(tracks, maxGapTicks);

  return { name, tempo, tracks };
}
