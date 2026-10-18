import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMidi, pitchRange } from "./midi";

test("parses tracks and notes from a MIDI", () => {
  const bytes = new Uint8Array(readFileSync(new URL("./__fixtures__/two-note.mid", import.meta.url)));
  const m = parseMidi(bytes);
  expect(m.ppq).toBe(480);
  const t = m.tracks.find((t) => t.notes.length === 2)!;
  expect(t).toBeTruthy();
  expect(t.notes.map((n) => n.midi)).toEqual([60, 62]);
  expect(t.notes[0].ticks).toBe(0);
  expect(t.notes[1].ticks).toBe(480);
});

// The header's time-division field is bytes 12-13 of the file.
const withDivision = (hi: number, lo: number) => {
  const bytes = new Uint8Array(readFileSync(new URL("./__fixtures__/two-note.mid", import.meta.url)));
  bytes[12] = hi;
  bytes[13] = lo;
  return bytes;
};

test("rejects a MIDI whose time division is 0 (note times would be NaN)", () => {
  expect(() => parseMidi(withDivision(0x00, 0x00))).toThrow(Error);
});

test("rejects a MIDI with SMPTE time division (note times would be NaN)", () => {
  expect(() => parseMidi(withDivision(0xe7, 0x28))).toThrow(Error);
});

test("pitchRange handles very large note counts without overflowing the stack", () => {
  const notes = Array.from({ length: 200_000 }, (_, i) => ({ midi: 30 + (i % 50) }));
  expect(pitchRange(notes)).toEqual([30, 79]);
  expect(pitchRange([])).toBeNull();
});
