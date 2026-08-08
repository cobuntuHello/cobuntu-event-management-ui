"use client";

import { useState } from "react";
import { Check, ChevronRight, FolderTree } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";

export interface CategoryOption {
  id: string;
  name: string;
  subcategories?: { id: string; name: string }[];
}

export interface CategoryPickerRowProps {
  categories: CategoryOption[];
  categoryId: string | null;
  subCategoryId: string | null;
  onChange: (next: { categoryId: string | null; subCategoryId: string | null }) => void;
  /** "product" | "event" — only used in the dialog copy. */
  noun?: string;
}

/**
 * Detail row + dialog for picking a community category and sub-category.
 *
 * PICK ONLY. A community's taxonomy is managed by its admins in the admin app;
 * a member choosing where to file their listing has no way to add to it from
 * here, and the backend rejects an id that is not already in the community's
 * list. There is deliberately no "create new" affordance to explain away.
 *
 * The options are a PROP, not a fetch. EventForm and ProductForm run the create
 * wizard against a stub config with an empty apiBaseUrl — the whole draft path
 * makes zero API calls, which is what lets consumers embed the form without
 * wiring a provider. Fetching here would quietly break that; the consumer
 * already knows the community tag and holds the auth, so it loads the list.
 *
 * Renders NOTHING when the community has no categories. An empty picker is
 * worse than no picker: it implies the member forgot to do something, when in
 * fact their community's admins have not set any up.
 */
export function CategoryPickerRow({
  categories, categoryId, subCategoryId, onChange, noun = "listing",
}: CategoryPickerRowProps) {
  const [open, setOpen] = useState(false);
  // Staged inside the dialog so Cancel actually cancels — committing on every
  // tap would make the row change under a user who then backs out.
  const [draftCat, setDraftCat] = useState<string | null>(categoryId);
  const [draftSub, setDraftSub] = useState<string | null>(subCategoryId);

  if (categories.length === 0) return null;

  const selected = categories.find((c) => c.id === categoryId) ?? null;
  const selectedSub = selected?.subcategories?.find((s) => s.id === subCategoryId) ?? null;
  const summary = selected
    ? selectedSub ? `${selected.name} · ${selectedSub.name}` : selected.name
    : null;

  const draftSubs = categories.find((c) => c.id === draftCat)?.subcategories ?? [];

  function openDialog() {
    setDraftCat(categoryId);
    setDraftSub(subCategoryId);
    setOpen(true);
  }

  function pickCategory(id: string) {
    // Changing the category invalidates the sub-category: sub-categories have
    // exactly one parent, so keeping the old one would submit a pair the
    // backend rejects.
    if (id !== draftCat) setDraftSub(null);
    setDraftCat(id === draftCat ? null : id);
    if (id === draftCat) setDraftSub(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="group w-full flex items-center gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-100/0 px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:ring-zinc-200 hover:shadow-[0_10px_22px_-16px_rgba(60,40,30,0.5)] active:translate-y-0 cursor-pointer"
      >
        {summary ? (
          <span
            className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-white shrink-0"
            style={{ background: "var(--brand-color, #18181b)" }}
          >
            <Check className="h-3 w-3" strokeWidth={3.5} />
          </span>
        ) : (
          <FolderTree className="h-[18px] w-[18px] text-zinc-400 shrink-0 transition-colors group-hover:text-zinc-500" />
        )}
        <span className="flex-1 min-w-0">
          <span className={`block text-sm truncate ${summary ? "font-medium text-zinc-800" : "text-zinc-500"}`}>
            {summary ? "Category" : "Choose a category"}
          </span>
          {summary && <span className="block text-[12.5px] text-zinc-500 truncate">{summary}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-400" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Category</DialogTitle>
            <DialogDescription>
              Choose where this {noun} belongs so people can find it. Your
              community's admins decide the list.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto space-y-4 py-1">
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickCategory(c.id)}
                  aria-pressed={draftCat === c.id}
                  className={`px-3 py-1.5 rounded-lg text-[13px] border transition-colors cursor-pointer ${
                    draftCat === c.id
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {draftCat && draftSubs.length > 0 && (
              <div>
                <p className="text-[12px] font-medium text-zinc-500 mb-2">
                  Sub-category <span className="font-normal">· optional</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {draftSubs.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setDraftSub(draftSub === s.id ? null : s.id)}
                      aria-pressed={draftSub === s.id}
                      className={`px-3 py-1.5 rounded-lg text-[13px] border transition-colors cursor-pointer ${
                        draftSub === s.id
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-[13px] font-medium text-zinc-600 rounded-lg hover:bg-zinc-100 cursor-pointer"
            >
              Cancel
            </button>
            <Button
              type="button"
              onClick={() => {
                // A sub-category without its parent is not a valid pair — the
                // backend refuses it — so clearing the category clears both.
                onChange(
                  draftCat
                    ? { categoryId: draftCat, subCategoryId: draftSub }
                    : { categoryId: null, subCategoryId: null },
                );
                setOpen(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
