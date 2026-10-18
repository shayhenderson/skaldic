/**
 * ASCII-safe song name derived from a MIDI filename. LuteMod handles song names as
 * single-byte text, so any non-ASCII character — e.g. the em-dash in an "Artist — Title"
 * MIDI name — corrupts to '?' in-game and stops the song loading (the mangled name no
 * longer matches its .sav file). We transliterate common punctuation and drop the rest,
 * then strip filesystem- and partition-delimiter-illegal characters.
 */
export function sanitizeName(s: string): string {
  return s
    .replace(/\.midi?$/i, "")
    .replace(/[‐-―]/g, "-") // hyphen/figure/en/em dashes → '-'
    .replace(/[‘’‚‛]/g, "'") // smart single quotes → '
    .replace(/[“”„‟]/g, '"') // smart double quotes → " (stripped below)
    .replace(/…/g, "...") // ellipsis → ...
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (é → e)
    .replace(/[^\x20-\x7e]/g, "") // drop any remaining non-ASCII
    .replace(/[@\0]/g, "") // mirror sav.ts readSavContent's strip set: '@' pads chunks and
    // NUL is inert, so either one in a name is indistinguishable from padding on read-back
    // and gets silently dropped — keeping them out of sanitizeName is the single source of truth
    .replace(/[\\/:*?"<>|;[\]()]+/g, "") // ';' would corrupt the |name;tempo| header
    .replace(/\s+/g, " ")
    .trim();
}

/** Base name of the menu index's .sav files (`PartitionIndex[0].sav`, ...). */
export const INDEX_NAME = "PartitionIndex";

/**
 * Whether a song name collides with the menu index's own files. Windows paths are
 * case-insensitive, so a song named "partitionindex" would overwrite the index too.
 */
export function isReservedName(name: string): boolean {
  return name.toLowerCase() === INDEX_NAME.toLowerCase();
}

/** Add a song name to the menu list without duplicating. */
export function withSong(names: string[], name: string): string[] {
  return names.includes(name) ? names : [...names, name];
}

/** Remove a song name from the menu list. */
export function withoutSong(names: string[], name: string): string[] {
  return names.filter((n) => n !== name);
}

/**
 * Match locally-saved projects (raw names, e.g. from project JSON filenames) to the
 * in-game song list (names as read back from the .sav index, which are always already
 * sanitize-clean — see sav.ts readSavContent). Compares sanitized-to-sanitized so a
 * project saved by an older Skaldic version with a since-forbidden character in its name
 * (e.g. '@', pre this fix) still matches its in-game entry instead of showing as a
 * false orphan or losing its "editable" badge.
 */
export function matchProjects(
  songs: string[],
  projects: string[],
): { editable: Set<string>; orphans: string[] } {
  const sanitizedSongs = new Set(songs.map(sanitizeName));
  return {
    editable: new Set(projects.map(sanitizeName)),
    orphans: projects.filter((p) => !sanitizedSongs.has(sanitizeName(p))),
  };
}
