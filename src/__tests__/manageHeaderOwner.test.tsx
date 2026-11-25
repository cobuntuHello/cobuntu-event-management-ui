/**
 * The manage header names the OWNER and the viewer's RELATIONSHIP to the event
 * (T-410), in place of "Live · 48 attendees · EUR 20".
 *
 * Two halves are pinned:
 *
 *   1. The classification. Each case the header words is one assertion, so a
 *      reorder of the rules (a leader who also hosts, a creator who also leads)
 *      fails here rather than on a live page telling a leader they own a
 *      member's event.
 *   2. The drawing. A community is a rounded square with its icon, a person a
 *      circle that walks Cobuntu's avatar library, and the header no longer
 *      carries a status or a count when the apps pass none.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventManageHeader } from "../page/EventManageHeader";
import { ManageOwnerLine, ownerImageCandidates } from "../page/ManageOwnerLine";
import { eventManageOwner, eventManageRelationship } from "../page/manageOwner";

const FSC = { id: "c-fsc", name: "Finance Social Club", communityTag: "fsc", iconUrl: "https://cdn/fsc.png" };
const OTHER = { id: "c-pbn", name: "PBN", communityTag: "pbn", iconUrl: null };

const maria = { id: "u-maria", name: "Maria Silva", usertag: "maria", profileImage: null };

/** A community-owned event: FSC owns it, `hosts` are its host rows. */
function communityEvent(hosts: any[] = [], extra: any = {}) {
  return {
    communityId: FSC.id,
    communities: [{ communityId: FSC.id, community: FSC }],
    hosts,
    ...extra,
  };
}

/** A member's event carried by FSC: Maria created it. */
function memberEvent(hosts: any[] = [{ userId: maria.id, role: "CREATOR", user: maria }], extra: any = {}) {
  return {
    communityId: null,
    createdByUserId: maria.id,
    communities: [{ communityId: FSC.id, community: FSC }],
    hosts,
    ...extra,
  };
}

const leadsFsc = (tag: string) => tag === "fsc";
const leadsNothing = () => false;

describe("eventManageOwner", () => {
  it("a community-owned event is owned by its community, with its icon", () => {
    expect(eventManageOwner(communityEvent())).toEqual({
      kind: "community", id: FSC.id, name: FSC.name, communityTag: "fsc", iconUrl: FSC.iconUrl,
    });
  });

  it("a member's event is owned by its CREATOR host, not the first host", () => {
    const event = memberEvent([
      { userId: "u-co", role: "CO_HOST", user: { id: "u-co", name: "Co Host" } },
      { userId: maria.id, role: "CREATOR", user: maria },
    ]);
    expect(eventManageOwner(event)).toEqual({
      kind: "person", id: maria.id, name: "Maria Silva", usertag: "maria", profileImage: null,
    });
  });

  it("falls back to hostCommunity when the listing rows are trimmed", () => {
    const event = { communityId: FSC.id, communities: [], hostCommunity: FSC };
    expect(eventManageOwner(event)?.name).toBe(FSC.name);
  });

  it("says nothing rather than inventing an owner the payload does not name", () => {
    expect(eventManageOwner({ communityId: "c-x", communities: [] })).toBeNull();
    expect(eventManageOwner({ communityId: null, hosts: [] })).toBeNull();
    expect(eventManageOwner(null)).toBeNull();
  });
});

describe("eventManageRelationship", () => {
  describe("a community-owned event", () => {
    it("a leader of the owning community manages it as a leader", () => {
      expect(eventManageRelationship(communityEvent(), { viewerUserId: "u-lead", leads: leadsFsc, communityTag: "fsc" }))
        .toBe("leaderHosting");
    });

    it("even when that leader is also on the host list", () => {
      const event = communityEvent([{ userId: "u-lead", role: "CREATOR" }]);
      expect(eventManageRelationship(event, { viewerUserId: "u-lead", leads: leadsFsc, communityTag: "fsc" }))
        .toBe("leaderHosting");
    });

    it("a member co-host who leads nothing is a co-host", () => {
      const event = communityEvent([{ userId: "u-co", role: "CO_HOST" }]);
      expect(eventManageRelationship(event, { viewerUserId: "u-co", leads: leadsNothing, communityTag: "fsc" }))
        .toBe("cohost");
    });

    it("a leader whose role cannot edit it is reviewing, not hosting", () => {
      const event = communityEvent([], { viewerCanEdit: false });
      expect(eventManageRelationship(event, { viewerUserId: "u-lead", leads: leadsFsc, communityTag: "fsc" }))
        .toBe("leaderReviewing");
    });

    it("a leader of a community that only carries it is reviewing", () => {
      const event = communityEvent([], { viewerCanEdit: false });
      const leadsPbn = (tag: string) => tag === OTHER.communityTag;
      expect(eventManageRelationship(event, { viewerUserId: "u-pbn", leads: leadsPbn, communityTag: "pbn" }))
        .toBe("leaderReviewing");
    });
  });

  describe("a member's event", () => {
    it("its creator owns it", () => {
      expect(eventManageRelationship(memberEvent(), { viewerUserId: maria.id, leads: leadsNothing, communityTag: "fsc" }))
        .toBe("owner");
    });

    it("its creator owns it even when they also lead the community", () => {
      expect(eventManageRelationship(memberEvent(), { viewerUserId: maria.id, leads: leadsFsc, communityTag: "fsc" }))
        .toBe("owner");
    });

    it("trusts the backend's viewerIsOwner", () => {
      const event = memberEvent([{ userId: maria.id, user: maria }], { createdByUserId: null, viewerIsOwner: true });
      expect(eventManageRelationship(event, { viewerUserId: maria.id, communityTag: "fsc" })).toBe("owner");
    });

    it("another host is a co-host", () => {
      const event = memberEvent([
        { userId: maria.id, role: "CREATOR", user: maria },
        { userId: "u-co", role: "CO_HOST" },
      ]);
      expect(eventManageRelationship(event, { viewerUserId: "u-co", leads: leadsFsc, communityTag: "fsc" }))
        .toBe("cohost");
    });

    it("a leader of the carrying community is reviewing it", () => {
      expect(eventManageRelationship(memberEvent(), { viewerUserId: "u-lead", leads: leadsFsc, communityTag: "fsc" }))
        .toBe("leaderReviewing");
    });
  });

  it("no relationship for staff or an unknown viewer, rather than a false one", () => {
    expect(eventManageRelationship(memberEvent(), { viewerUserId: "u-staff", leads: leadsNothing, communityTag: "fsc" }))
      .toBeNull();
    expect(eventManageRelationship(communityEvent(), { viewerUserId: "u-staff", leads: leadsNothing, communityTag: "fsc" }))
      .toBeNull();
    expect(eventManageRelationship(memberEvent(), { viewerUserId: null, leads: leadsFsc, communityTag: "fsc" }))
      .toBeNull();
  });
});

describe("ownerImageCandidates", () => {
  it("a person: own photo, then their library avatar, then the campfire", () => {
    expect(ownerImageCandidates({ kind: "person", id: "u1", name: "A", usertag: "a", profileImage: "https://img/a.jpg" }))
      .toEqual([
        "https://img/a.jpg",
        "https://api.cobuntu.com/api/avatars/auto/u1.svg",
        "https://api.cobuntu.com/api/avatars/cobuntu-campfire.svg",
      ]);
  });

  it("a person known only by usertag gets the tag avatar", () => {
    expect(ownerImageCandidates({ kind: "person", id: null, name: "A", usertag: "a", profileImage: null })[0])
      .toBe("https://api.cobuntu.com/api/avatars/tag/a.svg");
  });

  it("a community has only its icon", () => {
    expect(ownerImageCandidates({ kind: "community", id: "c", name: "C", communityTag: "c", iconUrl: null })).toEqual([]);
  });
});

describe("ManageOwnerLine", () => {
  it("draws a community as a rounded square with its icon and name", () => {
    const { container } = render(
      <ManageOwnerLine owner={eventManageOwner(communityEvent())} relationship="You manage this as a community leader" />,
    );
    const mark = container.querySelector("img[data-owner-mark='community']")!;
    expect(mark.getAttribute("src")).toBe(FSC.iconUrl);
    expect(mark.className).toContain("rounded-[5px]");
    expect(screen.getByText("Finance Social Club")).toBeTruthy();
    expect(screen.getByText("You manage this as a community leader")).toBeTruthy();
  });

  it("draws a person as a circle and walks the library when a picture fails", () => {
    const { container } = render(<ManageOwnerLine owner={eventManageOwner(memberEvent())} relationship="You own this" />);
    const mark = () => container.querySelector("img[data-owner-mark='person']")!;
    expect(mark().className).toContain("rounded-full");
    expect(mark().getAttribute("src")).toBe("https://api.cobuntu.com/api/avatars/auto/u-maria.svg");
    fireEvent.error(mark());
    expect(mark().getAttribute("src")).toBe("https://api.cobuntu.com/api/avatars/cobuntu-campfire.svg");
    fireEvent.error(mark());
    // Every picture failed: the initial, so the mark never goes empty.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-owner-mark='person']")!.textContent).toBe("M");
  });

  it("shows the relationship alone when the owner is unknown, and nothing when both are", () => {
    const { container, rerender } = render(<ManageOwnerLine owner={null} relationship="You manage this as a co-host" />);
    expect(screen.getByText("You manage this as a co-host")).toBeTruthy();
    expect(container.querySelector("[data-owner-mark]")).toBeNull();
    rerender(<ManageOwnerLine owner={null} relationship={null} />);
    expect(container.querySelector("[data-testid='manage-owner-line']")).toBeNull();
  });
});

describe("EventManageHeader", () => {
  it("puts the owner and relationship under the title, with no status or count", () => {
    render(
      <EventManageHeader
        breadcrumbs={[{ label: "Events", onClick: vi.fn() }, { label: "Welcome session" }]}
        title="Welcome session"
        owner={eventManageOwner(communityEvent())}
        relationship="You manage this as a community leader"
        onBack={vi.fn()}
        backLabel="Events"
        onPreview={vi.fn()}
        previewLabel="Preview"
      />,
    );
    const line = screen.getByTestId("manage-owner-line");
    expect(line.textContent).toContain("Finance Social Club");
    expect(line.textContent).toContain("You manage this as a community leader");
    expect(document.body.textContent).not.toMatch(/attendees|Live ·/);
  });
});
