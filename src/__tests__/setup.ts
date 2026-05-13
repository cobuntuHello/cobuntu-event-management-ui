import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Default fetch mock — each test that exercises a fetch should override
// with its own implementation. Leaving this unset means a stray fetch
// surfaces loudly instead of silently noop'ing.
beforeEach(() => {
  global.fetch = vi.fn().mockRejectedValue(new Error("fetch not mocked"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
