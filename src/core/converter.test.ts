import { test, expect } from "vitest";
import { convert } from "./converter";
import { parseMidi, type ParsedMidi } from "./midi";
import { serializePartition } from "./serializer";
import { readFileSync } from "node:fs";

const raw: ParsedMidi = {
  ppq: 480,
  tempos: [{ ticks: 0, bpm: 120 }],
  tracks: [
    {
      index: 0, name: "a", channel: 0, isPercussion: false, pitchRange: [60, 62],
      notes: [
        { ticks: 0, midi: 60, durationTicks: 240, durationSec: 0.5 },
        { ticks: 480, midi: 62, durationTicks: 240, durationSec: 0.5 },
      ],
    },
    {
      index: 1, name: "b", channel: 1, isPercussion: false, pitchRange: [48, 48],
      notes: [{ ticks: 0, midi: 48, durationTicks: 240, durationSec: 0.5 }],
    },
  ],
};

test("assigns tracks to instruments and fits range (notes only, no tempo events)", () => {
  const p = convert(raw, { 0: 0, 1: 1 }, "Test");
  expect(p.name).toBe("Test");
  expect(p.tracks.map((t) => t.instrumentId)).toEqual([0, 1]);
  const lute = p.tracks[0];
  expect(lute.notes.every((n) => n.type === 1)).toBe(true);
  expect(lute.notes.map((n) => n.tone)).toEqual([60 - 24, 62 - 24]);
  expect(p.tracks[1].notes.map((n) => n.tone)).toEqual([48 - 36]);
});

test("off tracks are skipped", () => {
  const p = convert(raw, { 0: 0, 1: null }, "Test");
  expect(p.tracks.length).toBe(1);
});

test("normalizes ticks so the earliest note starts at 0", () => {
  const m: ParsedMidi = {
    ppq: 480,
    tempos: [{ ticks: 0, bpm: 120 }],
    tracks: [
      {
        index: 0, name: "a", channel: 0, isPercussion: false, pitchRange: [60, 62],
        notes: [
          { ticks: 6000, midi: 60, durationTicks: 240, durationSec: 0.5 },
          { ticks: 6480, midi: 62, durationTicks: 240, durationSec: 0.5 },
        ],
      },
    ],
  };
  const p = convert(m, { 0: 0 }, "Shifted");
  const ons = p.tracks[0].notes.filter((n) => n.type === 1);
  expect(ons.map((n) => n.tick)).toEqual([0, 480]); // 6000→0, 6480→480
});

test("applies a per-track octave offset before fitting to range", () => {
  const p = convert(raw, { 0: 0 }, "Off", { offsets: { 0: 1 } });
  // raw track 0 notes are midi 60 & 62; +1 octave → 72 & 74; lute tone = midi − 24
  expect(p.tracks[0].notes.map((n) => n.tone)).toEqual([72 - 24, 74 - 24]);
});

test("positions notes by real time so tempo changes are baked in (multi-tempo)", () => {
  const m: ParsedMidi = {
    ppq: 1000,
    tempos: [{ ticks: 0, bpm: 60 }], // header tempo = 60e6/60/1000 = 1000 µs/tick
    tracks: [
      {
        index: 0, name: "a", channel: 0, isPercussion: false, pitchRange: [60, 62],
        notes: [
          { ticks: 0, midi: 60, durationTicks: 100, durationSec: 0.1, timeSec: 0 },
          // raw ticks say 480, but the tempo map puts this at 2.0s — real time wins:
          { ticks: 480, midi: 62, durationTicks: 100, durationSec: 0.1, timeSec: 2 },
        ],
      },
    ],
  };
  // Large maxGapSec so the gap-cap doesn't compress the 2s gap — we're isolating positioning.
  const p = convert(m, { 0: 0 }, "Tempo", { maxGapSec: 1000 });
  expect(p.tracks[0].notes.map((n) => n.tick)).toEqual([0, 2000]); // timeSec * 1e6 / 1000
});

test("converts a very large track without error", () => {
  const notes = Array.from({ length: 10000 }, (_, i) => ({
    ticks: i * 10, midi: 48 + (i % 24), durationTicks: 5, durationSec: 0.05,
  }));
  const big: ParsedMidi = {
    ppq: 480,
    tempos: [{ ticks: 0, bpm: 120 }],
    tracks: [{ index: 0, name: "big", channel: 0, isPercussion: false, pitchRange: [48, 71], notes }],
  };
  const p = convert(big, { 0: 0 }, "Big");
  expect(p.tracks[0].notes.length).toBeGreaterThan(0);
  expect(p.tracks[0].notes.every((n) => n.type === 1)).toBe(true);
});

test("falls back to the default tempo when the MIDI tempo is degenerate", () => {
  // A zero/NaN bpm or zero ppq would make tempo 0/NaN/Infinity, which propagates
  // into every tick and the |name;tempo| header — the game can freeze on it.
  const cases: ParsedMidi[] = [
    { ...raw, tempos: [{ ticks: 0, bpm: 0 }] },
    { ...raw, tempos: [{ ticks: 0, bpm: NaN }] },
    { ...raw, tempos: [{ ticks: 0, bpm: Infinity }] },
    { ...raw, ppq: 0 },
  ];
  for (const m of cases) {
    const p = convert(m, { 0: 0, 1: 1 }, "Degenerate");
    expect(p.tempo).toBe(1000);
    expect(p.tracks.every((t) => t.notes.every((n) => Number.isFinite(n.tick)))).toBe(true);
  }
});

test("clamps instead of octave-folding when fold is off", () => {
  const m: ParsedMidi = {
    ppq: 480,
    tempos: [{ ticks: 0, bpm: 120 }],
    tracks: [
      {
        index: 0, name: "hi", channel: 0, isPercussion: false, pitchRange: [96, 96],
        notes: [{ ticks: 0, midi: 96, durationTicks: 10, durationSec: 0.1 }],
      },
    ],
  };
  // lute range is midi 24–83; 96 folds down into range by default, clamps to 83 (tone 59) with fold off.
  const folded = convert(m, { 0: 0 }, "F").tracks[0].notes[0].tone;
  const clamped = convert(m, { 0: 0 }, "C", { fold: false }).tracks[0].notes[0].tone;
  expect(clamped).toBe(83 - 24);
  expect(folded).not.toBe(clamped);
});

test("skips notes whose start or duration is not a finite number", () => {
  const midi: ParsedMidi = {
    ppq: 480,
    tempos: [{ ticks: 0, bpm: 120 }],
    tracks: [
      {
        index: 0, name: "a", channel: 0, isPercussion: false, pitchRange: [60, 64],
        notes: [
          { ticks: 0, midi: 60, durationTicks: 240, durationSec: 0.5, timeSec: 0 },
          { ticks: 240, midi: 62, durationTicks: 240, durationSec: 0.5, timeSec: NaN },
          { ticks: 480, midi: 64, durationTicks: 240, durationSec: NaN, timeSec: 0.5 },
          { ticks: 720, midi: 65, durationTicks: 240, durationSec: 0.5, timeSec: Infinity },
        ],
      },
    ],
  };
  const p = convert(midi, { 0: 0 }, "s");
  expect(p.tracks[0].notes.length).toBe(1);
  expect(serializePartition(p)).not.toMatch(/NaN|Infinity/);
});

test("a real MIDI file converts with no NaN in the serialized partition", () => {
  const bytes = new Uint8Array(readFileSync(new URL("./__fixtures__/two-note.mid", import.meta.url)));
  const midi = parseMidi(bytes);
  const idx = midi.tracks.find((t) => t.notes.length)!.index;
  const out = serializePartition(convert(midi, { [idx]: 0 }, "s"));
  expect(out).not.toMatch(/NaN|Infinity/);
  expect(out.startsWith("|s;")).toBe(true);
});
