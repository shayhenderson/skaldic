import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, writeFile, exists, remove, mkdir, readDir } from "@tauri-apps/plugin-fs";
import type { ParsedMidi } from "../core/midi";
import type { Assignment } from "../core/converter";
import { isReservedName, sanitizeName } from "./index-ops";

/**
 * A re-editable project: everything needed to rebuild the Add panel for a saved song.
 * Stored as JSON in Skaldic's own app-data folder, separate from Mordhau's SaveGames.
 * (The exported .sav is lossy — lute/flute note streams only — so we keep the source
 * MIDI + the user's choices here to make a song editable again.)
 */
export interface Project {
  name: string; // matches the saved song name (and its .sav base name)
  filename: string; // original MIDI filename, for display
  midi: ParsedMidi;
  assignment: Assignment;
  offsets: Record<number, number>;
}

/** Where Skaldic keeps its project files (no side effects — safe to call for display). */
export async function projectsLocation(): Promise<string> {
  return join(await appDataDir(), "projects");
}

async function projectsDir(): Promise<string> {
  const d = await projectsLocation();
  if (!(await exists(d))) await mkdir(d, { recursive: true });
  return d;
}

const projectPath = async (name: string) => join(await projectsDir(), `${name}.json`);

export async function saveProject(p: Project): Promise<void> {
  await writeFile(await projectPath(p.name), new TextEncoder().encode(JSON.stringify(p)));
}

export async function loadProject(name: string): Promise<Project | null> {
  const path = await projectPath(name);
  if (!(await exists(path))) return null;
  return JSON.parse(new TextDecoder().decode(await readFile(path))) as Project;
}

export async function removeProject(name: string): Promise<void> {
  const path = await projectPath(name);
  if (await exists(path)) await remove(path);
}

export async function renameProject(oldName: string, newName: string): Promise<void> {
  const p = await loadProject(oldName);
  if (!p) return; // a pre-existing song with no project — nothing to rename
  await saveProject({ ...p, name: newName });
  await removeProject(oldName);
}

/** Names of songs that have a re-editable project on disk. */
export async function listProjects(): Promise<string[]> {
  const entries = await readDir(await projectsDir());
  return entries
    .filter((e) => e.isFile && e.name.endsWith(".json"))
    .map((e) => e.name.replace(/\.json$/, ""));
}

/** Write a project to an arbitrary file path (for sharing or backup). */
export async function writeProjectFile(path: string, project: Project): Promise<void> {
  await writeFile(path, new TextEncoder().encode(JSON.stringify(project, null, 2)));
}

const INVALID = "Not a valid Skaldic project file.";

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Check an imported project before any of it is used. A project file can come from
 * anyone, and its name ends up in .sav filenames and the in-game menu index, whose
 * format uses `|`, `;` and `@` as delimiters — so the name goes through the same
 * sanitizeName as every other entry point, and the MIDI data must be real numbers
 * (a NaN note time would be written straight into the partition).
 */
function validateProject(raw: unknown): Project {
  if (!isObject(raw)) throw new Error(INVALID);

  const name = sanitizeName(String(raw.name ?? ""));
  if (!name || isReservedName(name)) throw new Error(INVALID);

  const midi = raw.midi;
  if (!isObject(midi)) throw new Error(INVALID);
  if (!isFiniteNumber(midi.ppq) || midi.ppq <= 0) throw new Error(INVALID);
  if (!Array.isArray(midi.tempos) || !Array.isArray(midi.tracks)) throw new Error(INVALID);
  for (const track of midi.tracks) {
    if (!isObject(track) || !Array.isArray(track.notes)) throw new Error(INVALID);
    for (const n of track.notes) {
      if (!isObject(n) || !isFiniteNumber(n.midi) || !isFiniteNumber(n.timeSec) || !isFiniteNumber(n.durationSec))
        throw new Error(INVALID);
    }
  }

  // Track index → instrument (0 lute, 1 flute, null off), as the Add panel writes it.
  if (!isObject(raw.assignment)) throw new Error(INVALID);
  const assignment: Assignment = {};
  for (const [k, v] of Object.entries(raw.assignment)) {
    if (!/^\d+$/.test(k) || !(v === 0 || v === 1 || v === null)) throw new Error(INVALID);
    assignment[Number(k)] = v;
  }

  // Track index → octave shift; the Add panel's stepper allows -3..3.
  const rawOffsets = raw.offsets ?? {};
  if (!isObject(rawOffsets)) throw new Error(INVALID);
  const offsets: Record<number, number> = {};
  for (const [k, v] of Object.entries(rawOffsets)) {
    if (!/^\d+$/.test(k) || !Number.isInteger(v) || (v as number) < -3 || (v as number) > 3)
      throw new Error(INVALID);
    offsets[Number(k)] = v as number;
  }

  return {
    name,
    filename: String(raw.filename ?? ""),
    midi: midi as unknown as ParsedMidi,
    assignment,
    offsets,
  };
}

/** Read a project from an arbitrary file path; throws if it isn't a valid project. */
export async function readProjectFile(path: string): Promise<Project> {
  const text = new TextDecoder().decode(await readFile(path));
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(INVALID);
  }
  return validateProject(raw);
}
