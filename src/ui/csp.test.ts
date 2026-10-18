import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// The webview Content-Security-Policy lives in tauri.conf.json and is only enforced by the
// real webview, never by this test runner. These checks pin the directives the preview
// player depends on so a tightening of the policy can't silently mute it again:
// Tone.js runs its clock in a blob: Worker, and its Karplus-Strong lute voice runs a comb
// filter as an AudioWorklet whose source is fetched from, then loaded as, a blob: URL.
type Csp = Record<string, string>;
const conf = JSON.parse(readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const policies: Record<string, Csp> = { csp: conf.app.security.csp, devCsp: conf.app.security.devCsp };

const sources = (csp: Csp, directive: string) => (csp[directive] ?? "").split(/\s+/).filter(Boolean);

describe.each(Object.entries(policies))("%s", (_label, csp) => {
  test("keeps the baseline lockdown", () => {
    expect(sources(csp, "default-src")).toEqual(["'self'"]);
    expect(sources(csp, "connect-src")).toContain("ipc:");
    expect(sources(csp, "connect-src")).toContain("http://ipc.localhost");
  });

  test("lets Tone.js start its blob: worker and audio worklet", () => {
    expect(sources(csp, "worker-src")).toContain("blob:");
    expect(sources(csp, "connect-src")).toContain("blob:");
    expect(sources(csp, "script-src")).toContain("blob:");
  });

  test("never opens script execution to inline or remote code", () => {
    const script = sources(csp, "script-src");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(script.filter((s) => /^https?:/.test(s))).toEqual([]);
  });
});
