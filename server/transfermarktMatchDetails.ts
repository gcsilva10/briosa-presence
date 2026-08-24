import { load } from "cheerio";

export interface ParsedLineupPlayer {
  teamSide: "home" | "away";
  role: "starter" | "substitute";
  playerId: string | null;
  playerName: string;
  shirtNumber: number | null;
  position: string | null;
  sortOrder: number;
}

export interface ParsedMatchEvent {
  id: string;
  minute: number | null;
  stoppageTime: number | null;
  teamSide: "home" | "away";
  type: "goal" | "substitution" | "yellow" | "second_yellow" | "red";
  playerName: string | null;
  secondaryPlayerName: string | null;
  score: string | null;
  detail: string | null;
  sortOrder: number;
}

export interface ParsedMatchDetails {
  kickoffTime: string | null;
  venue: string | null;
  attendance: number | null;
  referee: string | null;
  homeFormation: string | null;
  awayFormation: string | null;
  status: "complete" | "partial" | "unavailable";
  lineups: ParsedLineupPlayer[];
  events: ParsedMatchEvent[];
}

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

function parseNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

function to24Hour(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const suffix = match[3]?.toUpperCase();
  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function fullNameFromAnchor(text: string, title: string | undefined, href: string | undefined) {
  if (title) return compact(title);
  const slug = href?.split("/").filter(Boolean)[0];
  if (!slug || !slug.includes("-")) return compact(text);
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function timelineMinute(style: string | undefined) {
  const percentage = style?.match(/left:\s*([\d.]+)%/)?.[1];
  return percentage ? Math.max(1, Math.round(Number(percentage) * 0.9)) : null;
}

export function parseTransfermarktMatchDetails(html: string, matchExternalId: string): ParsedMatchDetails {
  const $ = load(html);
  const summaryDate = compact($(".sb-datum").first().text());
  const rawTime = summaryDate.match(/\|\s*(\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)/i)?.[1];
  const info = $(".sb-zusatzinfos").first();
  const venue = compact(info.find("a[href*='/stadion/']").first().text()) || null;
  const referee = compact(info.find("a[href*='/schiedsrichter/']").first().text()) || null;
  const attendanceText = compact(info.text()).match(/Attendance:\s*([\d.,]+)/i)?.[1];
  const attendance = attendanceText ? parseNumber(attendanceText) : null;
  const lineups: ParsedLineupPlayer[] = [];
  const formations: Array<string | null> = [null, null];

  $(".aufstellung-unterueberschrift-mannschaft").each((teamIndex, header) => {
    if (teamIndex > 1) return;
    const side: "home" | "away" = teamIndex === 0 ? "home" : "away";
    const block = $(header).closest(".large-6.columns");
    const formationText = compact(block.find(".formation-subtitle").first().text());
    formations[teamIndex] = formationText.replace(/^Starting Line-up:\s*/i, "") || null;

    block.find(".formation-player-container").each((sortOrder, player) => {
      const anchor = $(player).find(".formation-number-name a[href*='/profil/spieler/']").first();
      const href = anchor.attr("href");
      const name = fullNameFromAnchor(anchor.text(), anchor.attr("title"), href);
      if (!name) return;
      lineups.push({
        teamSide: side,
        role: "starter",
        playerId: href?.match(/\/spieler\/(\d+)/)?.[1] ?? null,
        playerName: name,
        shirtNumber: parseNumber($(player).find(".tm-shirt-number--large").first().text()),
        position: null,
        sortOrder,
      });
    });

    block.find("table.ersatzbank tr").each((sortOrder, row) => {
      const anchor = $(row).find("a[href*='/profil/spieler/']").first();
      const href = anchor.attr("href");
      const name = fullNameFromAnchor(anchor.text(), anchor.attr("title"), href);
      if (!name) return;
      const cells = $(row).find("td");
      lineups.push({
        teamSide: side,
        role: "substitute",
        playerId: href?.match(/\/spieler\/(\d+)/)?.[1] ?? null,
        playerName: name,
        shirtNumber: parseNumber($(row).find(".tm-shirt-number").first().text()),
        position: compact(cells.last().text()) || null,
        sortOrder,
      });
    });
  });

  type EventType = ParsedMatchEvent["type"];
  const timeline = new Map<string, Array<{ id: string; minute: number | null }>>();
  const timelineTypes: Array<[string, EventType]> = [
    ["sb-tor", "goal"],
    ["sb-wechsel", "substitution"],
    ["sb-gelbrot", "second_yellow"],
    ["sb-rot", "red"],
    ["sb-gelb", "yellow"],
  ];

  for (const side of ["home", "away"] as const) {
    const selector = side === "home" ? ".sb-leiste-heim" : ".sb-leiste-gast";
    $(selector).find(".sb-leiste-ereignis").each((index, element) => {
      const classes = $(element).find(".sb-sprite").attr("class") ?? "";
      const type = timelineTypes.find(([className]) => classes.includes(className))?.[1];
      if (!type) return;
      const key = `${side}:${type}`;
      const eventId = $(element).attr("data-content")?.match(/spielbericht\/(\d+)/)?.[1]
        ?? `${matchExternalId}-${side}-${type}-${index}`;
      const entries = timeline.get(key) ?? [];
      entries.push({ id: eventId, minute: timelineMinute($(element).attr("style")) });
      timeline.set(key, entries);
    });
  }

  const events: ParsedMatchEvent[] = [];
  const takeTimeline = (side: "home" | "away", type: EventType, fallbackOrder: number) => {
    const entries = timeline.get(`${side}:${type}`) ?? [];
    return entries.shift() ?? { id: `${matchExternalId}-${type}-${fallbackOrder}`, minute: null };
  };

  $("#sb-tore li").each((index, element) => {
    const side: "home" | "away" = $(element).hasClass("sb-aktion-heim") ? "home" : "away";
    const action = $(element).find(".sb-aktion-aktion").first();
    const anchors = action.find("a.wichtig");
    const timelineEvent = takeTimeline(side, "goal", index);
    events.push({
      id: `transfermarkt:${timelineEvent.id}`,
      minute: timelineEvent.minute,
      stoppageTime: null,
      teamSide: side,
      type: "goal",
      playerName: compact(anchors.eq(0).attr("title") ?? anchors.eq(0).text()) || null,
      secondaryPlayerName: compact(anchors.eq(1).attr("title") ?? anchors.eq(1).text()) || null,
      score: compact($(element).find(".sb-aktion-spielstand b").text()).replace(":", "–") || null,
      detail: compact(action.clone().find("br").replaceWith(" · ").end().text()) || null,
      sortOrder: events.length,
    });
  });

  $("#sb-wechsel li").each((index, element) => {
    const side: "home" | "away" = $(element).hasClass("sb-aktion-heim") ? "home" : "away";
    const incoming = $(element).find(".sb-aktion-wechsel-ein a.wichtig").first();
    const outgoing = $(element).find(".sb-aktion-wechsel-aus a.wichtig").first();
    const timelineEvent = takeTimeline(side, "substitution", index);
    events.push({
      id: `transfermarkt:${timelineEvent.id}`,
      minute: timelineEvent.minute,
      stoppageTime: null,
      teamSide: side,
      type: "substitution",
      playerName: compact(incoming.attr("title") ?? incoming.text()) || null,
      secondaryPlayerName: compact(outgoing.attr("title") ?? outgoing.text()) || null,
      score: null,
      detail: "Substituição",
      sortOrder: events.length,
    });
  });

  $("#sb-karten li").each((index, element) => {
    const side: "home" | "away" = $(element).hasClass("sb-aktion-heim") ? "home" : "away";
    const iconClasses = $(element).find(".sb-aktion-spielstand .sb-sprite").attr("class") ?? "";
    const type: EventType = iconClasses.includes("sb-gelbrot")
      ? "second_yellow"
      : iconClasses.includes("sb-rot") ? "red" : "yellow";
    const anchor = $(element).find(".sb-aktion-aktion a.wichtig").first();
    const timelineEvent = takeTimeline(side, type, index);
    events.push({
      id: `transfermarkt:${timelineEvent.id}`,
      minute: timelineEvent.minute,
      stoppageTime: null,
      teamSide: side,
      type,
      playerName: compact(anchor.attr("title") ?? anchor.text()) || null,
      secondaryPlayerName: null,
      score: null,
      detail: compact($(element).find(".sb-aktion-aktion").text()) || null,
      sortOrder: events.length,
    });
  });

  events.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || a.sortOrder - b.sortOrder);
  events.forEach((event, index) => { event.sortOrder = index; });

  const hasUsefulData = Boolean(rawTime || venue || referee || lineups.length || events.length);
  return {
    kickoffTime: rawTime ? to24Hour(rawTime) : null,
    venue,
    attendance,
    referee,
    homeFormation: formations[0],
    awayFormation: formations[1],
    status: !hasUsefulData ? "unavailable" : lineups.length >= 22 ? "complete" : "partial",
    lineups,
    events,
  };
}

