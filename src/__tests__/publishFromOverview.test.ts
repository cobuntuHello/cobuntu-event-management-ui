import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MANAGE_ACTION_EVENT } from "../page/sections/EventActionsBar";

const src = readFileSync(resolve(__dirname, "../page/sections/EventActionsBar.tsx"), "utf8");

/**
 * The Overview asks for Publish through a window event, because the host app
 * renders it in a slot and cannot reach the bar's state. The bar must own the
 * dialog (one place) and ignore the request for an event already on a shelf.
 */
describe("publish asked for from the Overview", () => {
  it("uses one agreed event name", () => {
    expect(MANAGE_ACTION_EVENT).toBe("cobuntu:manage-action");
  });
  it("opens the publish dialog only for an event that is not published", () => {
    expect(src).toMatch(/detail\?\.action === "publish" && !isPublished\) setModal\("publish"\)/);
  });
  it("cleans its listener up", () => {
    expect(src).toContain("removeEventListener(MANAGE_ACTION_EVENT");
  });
});
