import { test, expect, vi } from "vitest";

const fs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  exists: vi.fn(async () => false),
  remove: vi.fn(),
  copyFile: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => fs);
vi.mock("@tauri-apps/api/path", () => ({ localDataDir: vi.fn(), join: vi.fn(), resolveResource: vi.fn() }));

import { addSong, removeSong, renameSong } from "./savegames";

const partition = { name: "x", tempo: 1000, tracks: [] };

test.each(["PartitionIndex", "partitionindex", "PARTITIONINDEX"])(
  "song operations refuse the index base name %j",
  async (name) => {
    await expect(addSong("dir", name, partition)).rejects.toThrow(/reserved/);
    await expect(removeSong("dir", name)).rejects.toThrow(/reserved/);
    await expect(renameSong("dir", "Song", name)).rejects.toThrow(/reserved/);
    await expect(renameSong("dir", name, "Song")).rejects.toThrow(/reserved/);
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.remove).not.toHaveBeenCalled();
    expect(fs.copyFile).not.toHaveBeenCalled();
  },
);
