"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";
import { useUpdateEvent } from "../config";
import { useEventT } from "../create-wizard/i18n";

interface Props {
  event: any;
  communityTag: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}

export function NameEditModal({ event, communityTag, onClose, onSaved, showToast }: Props) {
  const updateEvent = useUpdateEvent();
  const t = useEventT("eventsUi.manageUi.nameEditModal");
  const tc = useEventT("eventsUi.manageUi.overviewCommon");
  const [name, setName] = useState(event.name || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateEvent(communityTag, event.id, { name: name.trim() });
      showToast(t("nameUpdated"));
      onSaved();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-4">{t("title")}</h3>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        maxLength={100}
        autoFocus
        className="w-full px-3 py-2.5 text-sm text-zinc-900 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 placeholder:text-zinc-400"
      />
      <p className="text-[11px] text-zinc-400 text-right mt-1">{name.length}/100</p>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">{tc("cancel")}</button>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? tc("savingDots") : tc("save")}
        </button>
      </div>
    </ModalShell>
  );
}
