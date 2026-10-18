import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMidi, melodicTracks, prepareSong } from "./prepare";

const bytes = new Uint8Array(readFileSync(new URL("../core/__fixtures__/two-note.mid", import.meta.url)));

test("melodicTracks lists non-drum tracks that have notes", () => {
  const tracks = melodicTracks(parseMidi(bytes));
  expect(tracks.length).toBe(1);
  expect(tracks[0].notes.length).toBe(2);
});

test("prepareSong: filename → sanitized name + converted partition", () => {
  const midi = parseMidi(bytes);
  const idx = melodicTracks(midi)[0].index;
  const { name, partition } = prepareSong(midi, { [idx]: 0 }, "Cool Song.mid");
  expect(name).toBe("Cool Song");
  expect(partition.name).toBe("Cool Song");
  expect(partition.tracks.length).toBe(1);
  expect(partition.tracks[0].instrumentId).toBe(0);
  // fitted lute tones (60-24, 62-24) among the type-1 notes
  expect(partition.tracks[0].notes.filter((n) => n.type === 1).map((n) => n.tone)).toEqual([36, 38]);
});

test("prepareSong sanitises a name override too", () => {
  const midi = parseMidi(bytes);
  const idx = melodicTracks(midi)[0].index;
  const { name, partition } = prepareSong(midi, { [idx]: 0 }, "x.mid", {}, "a|b;c@d");
  expect(name).toBe("abcd");
  expect(partition.name).toBe("abcd");
});
