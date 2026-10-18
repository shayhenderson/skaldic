import { readFile, writeFile, exists, remove, copyFile } from "@tauri-apps/plugin-fs";
import { localDataDir, join, resolveResource } from "@tauri-apps/api/path";
import type { Partition } from "../core/types";
import { buildSavChunks, readSavContent } from "../core/sav";
import { parseIndex, serializeIndex } from "../core/index-file";
import { serializePartition } from "../core/serializer";
import { INDEX_NAME, isReservedName, withSong, withoutSong } from "./index-ops";
import type { SaveGamesApi } from "./types";

const INDEX = INDEX_NAME;
const HEADER_LEN = 1235;

/** Default Mordhau SaveGames folder: %LOCALAPPDATA%\Mordhau\Saved\SaveGames */
export async function defaultSaveDir(): Promise<string> {
  return join(await localDataDir(), "Mordhau", "Saved", "SaveGames");
}

/** Whether the Mordhau SaveGames folder exists (i.e. Mordhau is installed and has run once). */
export async function saveDirExists(dir: string): Promise<boolean> {
  return exists(dir);
}

let HEADER: Uint8Array | null = null;
/** The fixed 1235-byte GVAS header, read once from the bundled template .sav. */
export async function loadHeader(): Promise<Uint8Array> {
  if (HEADER) return HEADER;
  const path = await resolveResource("resources/template.sav");
  HEADER = (await readFile(path)).subarray(0, HEADER_LEN);
  return HEADER;
}

const savPath = (dir: string, base: string, i: number) => `${dir}\\${base}[${i}].sav`;

async function readChunks(dir: string, base: string): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  for (let i = 0; await exists(savPath(dir, base, i)); i++) {
    chunks.push(await readFile(savPath(dir, base, i)));
  }
  return chunks;
}

async function clearChunks(dir: string, base: string): Promise<void> {
  for (let i = 0; await exists(savPath(dir, base, i)); i++) {
    await remove(savPath(dir, base, i));
  }
}

async function writeContent(dir: string, base: string, content: string): Promise<void> {
  const header = await loadHeader();
  await clearChunks(dir, base);
  const chunks = buildSavChunks(content, header);
  for (let i = 0; i < chunks.length; i++) {
    await writeFile(savPath(dir, base, i), chunks[i]);
  }
}

/** A song named after the index would overwrite the menu index's own .sav files. */
function assertSongName(name: string): void {
  if (isReservedName(name)) throw new Error(`"${name}" is reserved for the song index; pick another name.`);
}

async function backupIndex(dir: string): Promise<void> {
  for (let i = 0; await exists(savPath(dir, INDEX, i)); i++) {
    await copyFile(savPath(dir, INDEX, i), savPath(dir, INDEX, i) + ".bak");
  }
}

/** List the songs currently in the in-game menu. */
export async function listSongs(dir: string): Promise<string[]> {
  const header = await loadHeader();
  const chunks = await readChunks(dir, INDEX);
  return chunks.length ? parseIndex(readSavContent(chunks, header)) : [];
}

/** Write a song's .sav chunks and merge it into the menu index (non-destructive; backs up index). */
export async function addSong(dir: string, name: string, p: Partition): Promise<void> {
  assertSongName(name);
  await backupIndex(dir);
  await writeContent(dir, name, serializePartition({ ...p, name }));
  const names = withSong(await listSongs(dir), name);
  await writeContent(dir, INDEX, serializeIndex(names));
}

/** Delete a song's .sav chunks and drop it from the menu index (backs up index). */
export async function removeSong(dir: string, name: string): Promise<void> {
  assertSongName(name);
  await backupIndex(dir);
  await clearChunks(dir, name);
  const names = withoutSong(await listSongs(dir), name);
  await writeContent(dir, INDEX, serializeIndex(names));
}

/** Rename a song: move its .sav chunks, fix the partition's internal name, update the index. */
export async function renameSong(dir: string, oldName: string, newName: string): Promise<void> {
  assertSongName(oldName);
  assertSongName(newName);
  if (oldName === newName) return;
  await backupIndex(dir);
  const header = await loadHeader();
  const content = readSavContent(await readChunks(dir, oldName), header);
  const prefix = `|${oldName};`;
  const renamed = content.startsWith(prefix) ? `|${newName};${content.slice(prefix.length)}` : content;
  await writeContent(dir, newName, renamed);
  await clearChunks(dir, oldName);
  const names = (await listSongs(dir)).map((n) => (n === oldName ? newName : n));
  await writeContent(dir, INDEX, serializeIndex(names));
}

/** The Tauri-backed implementation the app uses at runtime. */
export const tauriSaveGames: SaveGamesApi = { defaultSaveDir, listSongs, addSong, removeSong };
