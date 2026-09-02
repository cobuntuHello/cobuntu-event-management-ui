import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The description is read and edited in place.
 *
 * Client feedback: "a descrição do evento faz sentido aparecer em baixo em vez
 * de ali, é chato termos de carregar sempre para visualizar. Os outros podem
 * ser assim pequenos porque vê-se logo tudo in one-go."
 *
 * The distinction they drew is the whole design: the short fields — a date, a
 * price, a slug — fit in a compact row completely, so a row is right for them.
 * A description is paragraphs, so a truncated one-line row showed almost
 * nothing and amounted to a permanent instruction to click.
 */

const section = readFileSync(resolve(__dirname, "../page/sections/DescriptionSection.tsx"), "utf8");
const details = readFileSync(resolve(__dirname, "../page/views/DetailsView.tsx"), "utf8");
const card = readFileSync(resolve(__dirname, "../page/sections/EventCard.tsx"), "utf8");

describe("the description has its own section", () => {
    it("renders below the card", () => {
        expect(details).toContain("<DescriptionSection");
    });

    it("edits inline rather than opening a modal", () => {
        expect(section).toContain("<RichTextEditor");
        expect(details).not.toContain('modal === "description"');
    });

    it("no longer offers a truncated row to click", () => {
        /*
         * Both halves matter. Leaving the row would give two ways to edit one
         * field, and the row's own truncation is what the client objected to.
         */
        expect(card).not.toContain("onEditDescription");
        expect(details).not.toContain("onEditDescription");
    });

    it("drops 'description' from the modal union", () => {
        // A dead variant invites someone to wire it back up.
        expect(details).not.toMatch(/EventModal = [^;]*"description"/);
    });

    it("leaves the SHORT fields as rows", () => {
        // The client was explicit that those are fine — they are readable at a
        // glance, which is exactly what a compact row is for.
        for (const row of ["onEditName", "onEditDateTime", "onEditPrice", "onEditSlug", "onEditTags"]) {
            expect(card).toContain(row);
        }
    });
});

describe("unsaved work is visible and survives a refetch", () => {
    it("only enables Save once the content differs", () => {
        /*
         * A permanently live Save asks "did I change something?" every time it
         * is seen. Enabling it on a real difference makes the button the
         * answer, and is the unsaved-work indicator this page would otherwise
         * lack — a modal at least announced itself by being open.
         */
        expect(section).toContain("const dirty = content !== saved;");
        expect(section).toContain("disabled={!dirty || saving}");
    });

    it("adopts a new server value ONLY when nothing is being typed", () => {
        /*
         * The bug this avoids: the page refetches the event while someone is
         * mid-paragraph, and the editor silently resets to the stored text.
         * Comparing against what was last seeded says "untouched since it
         * matched the server", which is exactly when adopting is safe.
         */
        expect(section).toContain("const seededFrom = useRef(saved);");
        expect(section).toContain("prev === seededFrom.current ? saved : prev");
    });
});

describe("permissions and read-only", () => {
    it("uses the view's own permission hook, not a prop", () => {
        // A carrying community's leader can see a host's event and must not
        // rewrite it. One gate, so the two surfaces cannot disagree.
        expect(section).toContain('from "../../lib/manageAccess"');
        expect(section).toContain("const canEdit = useCanEdit();");
    });

    it("hides Save entirely when the viewer cannot edit", () => {
        expect(section).toContain("{canEdit && (");
    });

    it("does not re-render stored HTML itself", () => {
        /*
         * dangerouslySetInnerHTML would mean parsing someone's stored markup
         * on a surface it was never rendered on before, for no gain — the
         * editor already displays exactly this content.
         */
        // The USAGE, not the word — the comment above it explains why we do
        // not do this, and an earlier version of this assertion caught its own
        // rationale.
        expect(section).not.toMatch(/dangerouslySetInnerHTML=\{/);
        expect(section).toContain("inert");
    });
});
