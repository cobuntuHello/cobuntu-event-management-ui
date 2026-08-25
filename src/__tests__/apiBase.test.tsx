import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { EventManagementConfigProvider } from "../config";
import { apiBase } from "../page/helpers";

/**
 * Where this package sends its requests, and why it must ask the host.
 *
 * The base was `process.env.NEXT_PUBLIC_API_URL`, read at module scope and so
 * baked into the importing bundle. The two hosts authenticate differently and
 * the base is half of that pair:
 *
 *   - admin sends an ABSOLUTE url and carries a real Bearer;
 *   - the community app sends a RELATIVE url, because its cookie is httpOnly
 *     and host-scoped, and its own handler adds the Bearer server-side. Its
 *     authHeaders() returns {}.
 *
 * Baking the base pinned admin's half into both, so every call from the
 * community app went cross-origin with no cookie and no Bearer: a guaranteed
 * 401 across the event manage surface for three client communities, for a
 * month, until a host tried to change an event photo.
 */

function Base({ onRead }: { onRead: (v: string) => void }) {
  onRead(apiBase());
  return null;
}

const renderWithBase = (apiBaseUrl: string) => {
  let seen = "__unset__";
  render(
    <EventManagementConfigProvider
      value={{ apiBaseUrl, authHeaders: () => ({}) } as any}
    >
      <Base onRead={(v) => { seen = v; }} />
    </EventManagementConfigProvider>,
  );
  return seen;
};

describe("the API base comes from the host, not the bundle", () => {
  it("is the empty string when the host asks for same-origin", () => {
    // The community app. Empty is a REAL answer, not a missing one: it makes
    // every url relative so the browser attaches the httpOnly cookie itself.
    expect(renderWithBase("")).toBe("");
  });

  it("is the absolute origin when the host asks for cross-origin", () => {
    // Admin, which carries its own Bearer and can therefore call the API host.
    expect(renderWithBase("https://api.cobuntu.com")).toBe("https://api.cobuntu.com");
  });

  it("does not fall back to a default when the host says same-origin", () => {
    // The old code's `|| "http://localhost:4000"` would turn "" into localhost,
    // which is the same bug wearing a different url.
    expect(renderWithBase("")).not.toContain("localhost");
  });
});

describe("no module can bake the base back in", () => {
  /*
   * A guard, not a style rule. This bug is only visible in a browser on a
   * deployed host: it typechecks, it builds, it renders, and it fails at the
   * network. The next person to write `process.env.NEXT_PUBLIC_API_URL` in a
   * component would reintroduce it silently, in one file, and nobody would see
   * it until a client did.
   */
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return entry === "__tests__" ? [] : walk(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });

  /* Comments are stripped first: this file and helpers.tsx both NAME the
     variable to explain why it is gone, and a guard that cannot tell an
     explanation from a call would have to be deleted the moment it fires. */
  const codeOnly = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("reads NEXT_PUBLIC_API_URL nowhere in src", () => {
    const offenders = walk(join(__dirname, "..")).filter((f) =>
      codeOnly(readFileSync(f, "utf8")).includes("NEXT_PUBLIC_API_URL"),
    );
    expect(offenders).toEqual([]);
  });
});
