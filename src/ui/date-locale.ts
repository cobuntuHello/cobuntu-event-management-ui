import { enUS, pt, ptBR, es, fr, de, it, type Locale } from "date-fns/locale";
import { useEventT } from "../create-wizard/i18n";

/*
 * Month and weekday names follow the host's language.
 *
 * The host translator carries the locale as a message
 * ("eventsUi.manageUi.dateLocale.locale"), so a pt-PT host renders "qua, 3 nov"
 * and a Portuguese calendar with no new prop. Anything unmapped (or a host with
 * no translator) keeps the en-US it always had.
 */
const DATE_LOCALES: Record<string, Locale> = { "en-US": enUS, en: enUS, "pt-PT": pt, pt, "pt-BR": ptBR, es, fr, de, it };

export function useDateFnsLocale(): Locale {
  const t = useEventT("eventsUi.manageUi.dateLocale");
  return DATE_LOCALES[t("locale")] ?? enUS;
}
