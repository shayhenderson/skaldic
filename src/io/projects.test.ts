import { test, expect, vi, beforeEach } from "vitest";

const files = new Map<string, string>();
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: async (path: string) => new TextEncoder().encode(files.get(path) ?? ""),
  writeFile: vi.fn(),
  exists: vi.fn(),
  remove: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
}));
vi.mock("@tauri-apps/api/path", () => ({ appDataDir: vi.fn(), join: vi.fn() }));

import { readProjectFile } from "./projects";
import { parseIndex, serializeIndex } from "../core/index-file";

const validMidi = () => ({
  ppq: 480,
  tempos: [{ ticks: 0, bpm: 120 }],
  tracks: [
    {
      index: 0,
      name: "Piano",
      channel: 0,
      isPercussion: false,
      pitchRange: [60, 62],
      notes: [{ ticks: 0, midi: 60, durationTicks: 480, durationSec: 0.5, timeSec: 0 }],
    },
  ],
});

const project = (over: Record<string, unknown> = {}) => ({
  name: "Song",
  filename: "Song.mid",
  midi: validMidi(),
  assignment: { 0: 0 },
  offsets: {},
  ...over,
});

async function load(p: unknown) {
  files.set("p.json", JSON.stringify(p));
  return readProjectFile("p.json");
}

beforeEach(() => files.clear());

test("a valid project imports unchanged", async () => {
  const p = await load(project({ offsets: { 0: -2 }, assignment: { 0: 1, 1: null } }));
  expect(p.name).toBe("Song");
  expect(p.offsets).toEqual({ 0: -2 });
  expect(p.assignment).toEqual({ 0: 1, 1: null });
  expect(p.midi.tracks[0].notes.length).toBe(1);
});

test("a delimiter-laden name is sanitised and cannot inject extra index entries", async () => {
  const p = await load(project({ name: "Evil|PartitionIndex|;x" }));
  expect(p.name).not.toMatch(/[|;@]/);
  expect(parseIndex(serializeIndex([p.name]))).toEqual([p.name]);
});

test.each(["PartitionIndex", "partitionindex", "PARTITIONINDEX", " Partition|Index "])(
  "the index base name %j is rejected",
  async (name) => {
    await expect(load(project({ name }))).rejects.toThrow("Not a valid Skaldic project file.");
  },
);

test.each([undefined, "", "|;@"])("a name that sanitises to nothing (%j) is rejected", async (name) => {
  await expect(load(project({ name }))).rejects.toThrow("Not a valid Skaldic project file.");
});

test("a non-string name is coerced to text", async () => {
  expect((await load(project({ name: 42 }))).name).toBe("42");
});

test.each([
  ["string timeSec", { timeSec: "1" }],
  ["NaN timeSec", { timeSec: NaN }],
  ["missing durationSec", { durationSec: undefined }],
  ["Infinity midi", { midi: Infinity }],
])("a note with %s is rejected", async (_label, bad) => {
  const midi = validMidi();
  // JSON turns NaN/Infinity into null, which must still be rejected
  Object.assign(midi.tracks[0].notes[0], bad);
  await expect(load(project({ midi }))).rejects.toThrow("Not a valid Skaldic project file.");
});

test.each([
  ["ppq 0", { ppq: 0 }],
  ["ppq string", { ppq: "480" }],
  ["tempos not array", { tempos: {} }],
  ["tracks not array", { tracks: null }],
  ["track without notes", { tracks: [{ index: 0 }] }],
])("a midi block with %s is rejected", async (_label, bad) => {
  await expect(load(project({ midi: { ...validMidi(), ...bad } }))).rejects.toThrow(
    "Not a valid Skaldic project file.",
  );
});

test.each([{ 0: 4 }, { 0: -4 }, { 0: 1.5 }, { 0: "1" }])("out-of-range offsets %j are rejected", async (offsets) => {
  await expect(load(project({ offsets }))).rejects.toThrow("Not a valid Skaldic project file.");
});

test.each([{ 0: 2 }, { 0: "0" }, { 0: true }])("unknown assignment values %j are rejected", async (assignment) => {
  await expect(load(project({ assignment }))).rejects.toThrow("Not a valid Skaldic project file.");
});

test("non-object input is rejected", async () => {
  await expect(load(null)).rejects.toThrow("Not a valid Skaldic project file.");
  await expect(load([1, 2])).rejects.toThrow("Not a valid Skaldic project file.");
});
