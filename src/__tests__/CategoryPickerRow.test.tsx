import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryPickerRow } from "../components/CategoryPickerRow";

/**
 * Members PICK from their community's taxonomy; only admins create it. The
 * component has no "add new" affordance, and the backend rejects an id that is
 * not already the community's — these pin the behaviours around that which are
 * easy to get subtly wrong.
 */
const CATS = [
  { id: "c1", name: "Ceramics", subcategories: [{ id: "s1", name: "Mugs" }, { id: "s2", name: "Bowls" }] },
  { id: "c2", name: "Textiles", subcategories: [{ id: "s3", name: "Scarves" }] },
];

function setup(overrides: any = {}) {
  const onChange = vi.fn();
  render(
    <CategoryPickerRow
      categories={CATS}
      categoryId={null}
      subCategoryId={null}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange };
}

describe("CategoryPickerRow", () => {
  it("renders nothing when the community has no categories", () => {
    // An empty picker implies the MEMBER forgot something, when in fact their
    // admins have not set any up. Better to show no row at all.
    const { container } = render(
      <CategoryPickerRow categories={[]} categoryId={null} subCategoryId={null} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers no way to create a category", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /choose a category/i }));

    expect(screen.queryByRole("button", { name: /new|create|add category/i })).toBeNull();
  });

  it("commits the chosen pair only on Done", async () => {
    // Staged inside the dialog so Cancel actually cancels; committing on tap
    // would change the row under a user who then backs out.
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole("button", { name: /choose a category/i }));
    await user.click(screen.getByRole("button", { name: "Ceramics" }));
    await user.click(screen.getByRole("button", { name: "Mugs" }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(onChange).toHaveBeenCalledWith({ categoryId: "c1", subCategoryId: "s1" });
  });

  it("Cancel leaves the selection untouched", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole("button", { name: /choose a category/i }));
    await user.click(screen.getByRole("button", { name: "Ceramics" }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("changing category drops a sub-category from the old one", async () => {
    // A sub-category has exactly one parent, so carrying it across would submit
    // a pair the backend refuses.
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole("button", { name: /choose a category/i }));
    await user.click(screen.getByRole("button", { name: "Ceramics" }));
    await user.click(screen.getByRole("button", { name: "Mugs" }));
    await user.click(screen.getByRole("button", { name: "Textiles" }));
    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(onChange).toHaveBeenCalledWith({ categoryId: "c2", subCategoryId: null });
  });

  it("clearing the category clears the sub-category with it", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ categoryId: "c1", subCategoryId: "s1" });

    await user.click(screen.getByRole("button", { name: /category/i }));
    await user.click(screen.getByRole("button", { name: "Ceramics" })); // toggle off
    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(onChange).toHaveBeenCalledWith({ categoryId: null, subCategoryId: null });
  });

  it("summarises the current selection on the row", () => {
    setup({ categoryId: "c1", subCategoryId: "s2" });
    expect(screen.getByText("Ceramics · Bowls")).toBeTruthy();
  });

  it("sub-categories are optional — a category alone commits", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole("button", { name: /choose a category/i }));
    await user.click(screen.getByRole("button", { name: "Textiles" }));
    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(onChange).toHaveBeenCalledWith({ categoryId: "c2", subCategoryId: null });
  });
});
