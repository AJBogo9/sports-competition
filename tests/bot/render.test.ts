import { describe, expect, test } from "bun:test";
import {
  confirmation,
  meMessage,
  mondayPost,
  pinnedStandings,
  progressBlock,
  standingsMessage,
} from "../../src/bot/render.ts";
import {
  BOT_DESCRIPTION,
  BOT_SHORT_DESCRIPTION,
  REMINDER_FOLLOWUP,
  SOMETHING_WRONG,
  TARGET_PROMPT,
  TOAST_ADMINS_ONLY,
  UNDO_SUPERSEDED,
  UNKNOWN_TEXT,
  afterEnd,
  alreadyRegistered,
  beforeStart,
  chatBound,
  moved,
  reminderOff,
  reminderSet,
  stayed,
  targetSet,
  targetStatus,
  toastTargetSet,
  welcome,
} from "../../src/strings.ts";
import {
  COMPETITION_END,
  COMPETITION_START,
  TARGET_OPTIONS,
  TIER_MINUTES,
  WEEKLY_TARGET_MINUTES,
} from "../../src/config.ts";
import type { GuildStanding } from "../../src/db/standings.ts";

/** Phase 5 design 11.1. Mid-competition, so the clock renders. */
const CLOCK = { weekNumber: 5, weekCount: 8, phase: "during" as const };

describe("progressBlock (FR-12)", () => {
  test("shows minutes against the target with a bar, as in the prototype", () => {
    const block = progressBlock(112, 150);
    expect(block).toContain("112 / 150 min");
    expect(block).toContain("███████░░░");
  });

  // FR-12's acceptance test: 45 logged onto a week already holding 67 reads
  // 112 / 150 with a bar filled to roughly three quarters.
  test("the acceptance example reads 112 of 150", () => {
    expect(progressBlock(67 + 45, 150)).toContain("112 / 150 min");
  });

  // FR-10 plus FR-16. On a Monday, "Log yesterday instead" writes to Sunday,
  // which belongs to the week that just ended, so the total that comes back is
  // last week's. Labelling it "This week" printed a filled bar for a week the
  // user had logged nothing in, hours after the Monday post told their guild
  // chat that everyone was back to zero.
  test("names the previous week when the entry landed there", () => {
    const block = progressBlock(195, 150, "previous");
    expect(block).toContain("Last week");
    expect(block).not.toContain("This week");
  });

  // The label sits in a fixed-width column ahead of the minutes, inside a
  // <pre>, so the two labels have to be the same width or the numbers step.
  test("both labels are the same width, so the columns still line up", () => {
    const current = progressBlock(112, 150).split("\n");
    const previous = progressBlock(112, 150, "previous").split("\n");
    expect(previous[0]!.length).toBe(current[0]!.length);
    expect(previous[1]).toBe(current[1]!);
  });
});

describe("confirmation (FR-12)", () => {
  test("leads with the minutes just logged", () => {
    expect(confirmation("medium", 112, 150)).toContain("45 min");
  });

  // Phase 5 design 12.3. The day is framed as a contribution to the guild:
  // groupcentric individual goals in interdependent groups carry d = +1.20
  // and egocentric ones d = -1.75 (Kleingeld et al. 2011). Stated as a fact,
  // once, on the head line; a rest day contributes nothing and says nothing.
  test("names the guild the day counted for", () => {
    expect(confirmation("medium", 112, 150, "current", 0, "Prodeko")).toContain("A day for Prodeko.");
    expect(confirmation("short", 22, 150, "current", 0, "Prodeko")).toContain("A day for Prodeko.");
    expect(confirmation("rest", 112, 150, "current", 0, "Prodeko")).not.toContain("A day for");
  });

  test("escapes the guild name on the head line", () => {
    expect(confirmation("medium", 112, 150, "current", 0, "A & B")).toContain("A &amp; B");
  });

  test("says how much is left when the target is not yet met", () => {
    expect(confirmation("short", 67, 150)).toContain("83 minutes to go");
  });

  test("nudges rather than counts when the gap is small", () => {
    expect(confirmation("short", 130, 150)).toContain("One more session");
  });

  test("the nudge fires exactly at a gap of one medium session", () => {
    expect(confirmation("short", 105, 150)).toContain("One more session");   // left = 45
    expect(confirmation("short", 104, 150)).toContain("46 minutes to go");   // left = 46
  });

  test("congratulates once the target is met", () => {
    expect(confirmation("long", 150, 150)).toContain("Target hit");
  });

  // FR-8: a rest day must read as permitted, not as a failure.
  test("a rest day is framed as breaking nothing", () => {
    const message = confirmation("rest", 67, 150);
    expect(message).toContain("Rest days");
    expect(message).not.toContain("0 min.");
  });

  test("contains no dash characters, per the project copy rule", () => {
    expect(confirmation("medium", 112, 150)).not.toMatch(/[—–]/);
  });

  // FR-10. A Monday backdate lands in the week that just ended. The block has
  // to say so, and the forward-looking nudges have to stop: "83 minutes to go"
  // asks for a session that can no longer count toward that week.
  test("a backdated entry in the previous week says so rather than claiming this one", () => {
    const message = confirmation("long", 195, 150, "previous");
    expect(message).toContain("Last week");
    expect(message).not.toContain("This week");
  });

  test("does not ask for more minutes in a week that is already over", () => {
    const message = confirmation("short", 67, 150, "previous");
    expect(message).not.toContain("minutes to go");
    expect(message).not.toContain("One more session");
  });

  test("still congratulates a previous week that met the target", () => {
    expect(confirmation("long", 150, 150, "previous")).toContain("Target hit");
  });

  test("the previous-week copy carries no dashes either", () => {
    expect(confirmation("short", 67, 150, "previous")).not.toMatch(/[—–]/);
  });

  // FR-12 and FR-13, phase 5 design 5.2. The prototype's target line named the
  // streak ("Target hit. Fourth week running.") and the implementation had
  // dropped it. Shown only while intact: a highlighted broken streak is the
  // one streak display with evidence of harm (Silverman and Barasch 2023).
  test("names the streak when the target is met and it is two weeks or more", () => {
    expect(confirmation("long", 150, 150, "current", 3)).toContain("Target hit. 3 weeks in a row.");
  });

  test("a first target week says only that the target was hit", () => {
    const message = confirmation("long", 150, 150, "current", 1);
    expect(message).toContain("Target hit.");
    expect(message).not.toContain("in a row");
  });

  test("never mentions weeks below the target, whatever the streak was", () => {
    expect(confirmation("short", 67, 150, "current", 3)).not.toContain("in a row");
  });

  test("names the streak on a previous-week entry too", () => {
    expect(confirmation("long", 150, 150, "previous", 2)).toContain("2 weeks in a row");
  });

  test("the streak tail carries no dashes either", () => {
    expect(confirmation("long", 150, 150, "current", 3)).not.toMatch(/[—–]/);
  });

  // Phase 5 design 5.3. The head scales with the session, so the tenth
  // confirmation does not read like the first, and the small session is told
  // it counted.
  test("the head is proportional to the tier", () => {
    expect(confirmation("short", 22, 150)).toContain("<b>22 min.</b> Counts.");
    expect(confirmation("medium", 45, 150)).toContain("<b>45 min.</b> Good.");
    expect(confirmation("long", 75, 150)).toContain("<b>75 min.</b> Big one.");
  });
});

describe("meMessage (FR-14)", () => {
  const input = {
    weekMinutes: 112,
    target: 150,
    streak: 3,
    guildName: "Prodeko",
    guildRank: 2,
    guildCount: 9,
    neighbours: [
      { firstName: "Sanna", minutes: 134, isSelf: false },
      { firstName: "Andreas", minutes: 112, isSelf: true },
      { firstName: "Otto", minutes: 98, isSelf: false },
    ],
  };

  test("shows weekly progress, the streak and the guild rank", () => {
    const message = meMessage(input);
    expect(message).toContain("112 / 150 min");
    expect(message).toContain("3 weeks at target");
    expect(message).toContain("Prodeko, 2nd of 9 this week");
  });

  test("renders the user as 'you' rather than by name", () => {
    const message = meMessage(input);
    expect(message).toContain("you");
    expect(message).not.toContain("Andreas");
  });

  test("names the neighbours either side", () => {
    const message = meMessage(input);
    expect(message).toContain("Sanna");
    expect(message).toContain("Otto");
  });

  test("uses the right ordinal for first and third", () => {
    expect(meMessage({ ...input, guildRank: 1 })).toContain("1st of 9");
    expect(meMessage({ ...input, guildRank: 3 })).toContain("3rd of 9");
  });

  test("reads sensibly with no streak yet", () => {
    const message = meMessage({ ...input, streak: 0 });
    expect(message).not.toContain("0 weeks at target");
  });

  test("omits the neighbours block when the user is alone in their guild", () => {
    const alone = { ...input, neighbours: [{ firstName: "Andreas", minutes: 112, isSelf: true }] };
    expect(meMessage(alone)).not.toContain("Around you");
  });

  // Phase 5 design 10.2. Before anyone around the user has logged, the query
  // ranks by first name and the block reads as three strangers at zero, which
  // identifies nobody's contribution (the point of FR-14) and shows the reader
  // their own zero twice. It returns as soon as one of the three has minutes,
  // including when that one is not the reader.
  test("omits the neighbours block while everyone around the user is at zero", () => {
    const quiet = {
      ...input,
      weekMinutes: 0,
      neighbours: [
        { firstName: "Aino", minutes: 0, isSelf: false },
        { firstName: "Andreas", minutes: 0, isSelf: true },
        { firstName: "Bo", minutes: 0, isSelf: false },
      ],
    };
    expect(meMessage(quiet)).not.toContain("Around you");
    const oneLogged = {
      ...quiet,
      neighbours: [
        { firstName: "Aino", minutes: 22, isSelf: false },
        { firstName: "Andreas", minutes: 0, isSelf: true },
        { firstName: "Bo", minutes: 0, isSelf: false },
      ],
    };
    expect(meMessage(oneLogged)).toContain("Around you");
  });
});

// Telegram first names are attacker-controlled, and the neighbours block is
// the one place another user's name reaches your own /me output. The Guild
// line's name comes from config.ts and is trusted today, but is escaped
// defensively for the same reason as the guild-name functions in strings.ts.
describe("meMessage name escaping (security)", () => {
  const input = {
    weekMinutes: 112,
    target: 150,
    streak: 3,
    guildName: "Prodeko",
    guildRank: 2,
    guildCount: 9,
    neighbours: [
      { firstName: "Sanna", minutes: 134, isSelf: false },
      { firstName: "Andreas", minutes: 112, isSelf: true },
      { firstName: "Otto", minutes: 98, isSelf: false },
    ],
  };

  test("escapes a tag in a neighbour's name rather than rendering it live", () => {
    const message = meMessage({
      ...input,
      neighbours: [
        { firstName: "<b>Eve</b>", minutes: 100, isSelf: false },
        { firstName: "Andreas", minutes: 112, isSelf: true },
      ],
    });
    expect(message).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(message).not.toContain("<b>Eve</b>");
  });

  // The column cut (phase 5 design 13.3) happens on the raw name, so a tag
  // split by the cut is still escaped, never rendered.
  test("a tagged name longer than the column is cut and still escaped", () => {
    const message = meMessage({
      ...input,
      neighbours: [
        { firstName: "<b>Evil</b>", minutes: 100, isSelf: false },
        { firstName: "Andreas", minutes: 112, isSelf: true },
      ],
    });
    expect(message).toContain("&lt;b&gt;Evil&lt;/b ");
    expect(message).not.toContain("<b>Evil");
    expect(message).not.toContain("Evil</b");
  });

  test("escapes a bare ampersand, which would otherwise make Telegram reject the whole message", () => {
    const message = meMessage({
      ...input,
      neighbours: [
        { firstName: "A & B", minutes: 100, isSelf: false },
        { firstName: "Andreas", minutes: 112, isSelf: true },
      ],
    });
    expect(message).toContain("A &amp; B");
  });

  test("a name of </pre> does not close the surrounding pre block early", () => {
    const message = meMessage({
      ...input,
      neighbours: [
        { firstName: "</pre>", minutes: 100, isSelf: false },
        { firstName: "Andreas", minutes: 112, isSelf: true },
      ],
    });
    // Exactly the two legitimate closes (the header block and the
    // neighbours block); an unescaped name would add a third.
    const closingTags = message.match(/<\/pre>/g) ?? [];
    expect(closingTags.length).toBe(2);
  });

  // Phase 5 design 13.3. A name longer than the column stepped the minutes
  // out of line; it is cut to the column width before padding.
  test("cuts a long name to the column so the minutes still line up", () => {
    const message = meMessage({
      ...input,
      neighbours: [
        { firstName: "Maximiliana-Fredrika", minutes: 134, isSelf: false },
        { firstName: "Andreas", minutes: 112, isSelf: true },
        { firstName: "Otto", minutes: 98, isSelf: false },
      ],
    });
    const rows = message
      .split("<b>Around you</b>")[1]!
      .replaceAll("<pre>", "")
      .replaceAll("</pre>", "")
      .split("\n")
      .filter((line) => line.includes(" min"));
    const columns = rows.map((row) => row.indexOf(" min"));
    expect(new Set(columns).size).toBe(1);
    expect(message).toContain("Maximilian");
    expect(message).not.toContain("Maximiliana-");
  });

  test("pads the raw name before escaping, so the minutes column still lines up", () => {
    const rawName = "<b>";
    // Computed independently of src/html.ts: pad the raw 3-character name to
    // width 10 first, then escape. If escaping happened before padding,
    // "&lt;b&gt;" (already 9 characters) would only gain one more space, and
    // this exact fragment would not appear.
    const paddedThenEscaped = rawName
      .padEnd(10)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const message = meMessage({
      ...input,
      neighbours: [
        { firstName: rawName, minutes: 5, isSelf: false },
        { firstName: "Andreas", minutes: 112, isSelf: true },
      ],
    });
    expect(message).toContain(`  ${paddedThenEscaped}   5 min`);
  });

  test("escapes an ampersand in the guild name on the Guild line too", () => {
    const message = meMessage({ ...input, guildName: "A & B" });
    expect(message).toContain("A &amp; B");
  });
});

describe("standingsMessage (FR-16)", () => {
  const week = [
    { slug: "inkubio", name: "Inkubio", activeDays: 96, minutes: 9640, perMember: 0.24, memberCount: 400 },
    { slug: "prodeko", name: "Prodeko", activeDays: 148, minutes: 14820, perMember: 0.2277, memberCount: 650 },
  ];
  const season = [
    { slug: "prodeko", name: "Prodeko", activeDays: 547, minutes: 54730, perMember: 0.8415, memberCount: 650 },
    { slug: "inkubio", name: "Inkubio", activeDays: 306, minutes: 30560, perMember: 0.765, memberCount: 400 },
  ];

  test("puts the weekly table first, so last place is never permanent", () => {
    const message = standingsMessage({ week, season, ...CLOCK });
    expect(message.indexOf("Week 5 of 8")).toBeLessThan(message.indexOf("Season"));
  });

  // Phase 5 design 11.1. The clock is the visible arc the goal gradient needs:
  // the header names which week of how many, and the unit stays beside it.
  test("the weekly header is the competition clock", () => {
    const message = standingsMessage({ week, season, ...CLOCK });
    expect(message).toContain("<b>Week 5 of 8</b> · active days");
    expect(message).not.toContain("This week");
  });

  // Phase 5 design 12.2. The tables show counts of active days, never the
  // per-member average the ranking uses: an average over the roster is a low
  // descriptive norm broadcast to everyone above it (Chen et al. 2010).
  test("shows active days as whole numbers and never a per-member figure", () => {
    const message = standingsMessage({ week, season, ...CLOCK });
    expect(message).toMatch(/1\s+Inkubio\s+96\b/);
    expect(message).toMatch(/2\s+Prodeko\s+148\b/);
    expect(message).toMatch(/1\s+Prodeko\s+547\b/);
    expect(message).not.toMatch(/\d\.\d/);
    expect(message).not.toContain("minutes per member");
  });

  test("the footer says the ranking is per member of the whole roster", () => {
    const message = standingsMessage({ week, season, ...CLOCK });
    expect(message).toContain("Ranked per member");
    expect(message).toContain("logging or not");
  });

  // Outside the window there is no week to number: /standings is unguarded
  // and can be asked before the start or after the end, and "Week 0 of 8" or
  // "Week 9 of 8" would be a bug on display. The phase decides, not the
  // number, so a competition starting mid-week is right on the Monday and
  // Tuesday before it (phase 5 design 13.2).
  test("before the start the header is This week, whatever the number says", () => {
    const message = standingsMessage({ week, season, weekNumber: 1, weekCount: 8, phase: "before" });
    expect(message).toContain("<b>This week</b> · active days");
    expect(message).not.toContain("of 8");
  });

  // After the end the caller passes the final week's table, and the header
  // says so rather than showing a fresh empty week that contradicts the pin.
  test("after the end the header is Final week", () => {
    const message = standingsMessage({ week, season, weekNumber: 9, weekCount: 8, phase: "after" });
    expect(message).toContain("<b>Final week</b> · active days");
    expect(message).not.toContain("of 8");
  });

  test("renders both tables in one message", () => {
    const message = standingsMessage({ week, season, ...CLOCK });
    expect(message).toContain("Inkubio");
    expect(message).toContain("Prodeko");
    expect(message).toContain("96");
    expect(message).toContain("547");
  });

  test("states that the denominator is the whole roster", () => {
    expect(standingsMessage({ week, season, ...CLOCK })).toContain("Everyone in the guild counts");
  });

  test("numbers the rows in rank order", () => {
    const message = standingsMessage({ week, season, ...CLOCK });
    expect(message).toMatch(/1\s+Inkubio/);
    expect(message).toMatch(/2\s+Prodeko/);
  });

  // /standings is the most-used message in the product and renders every
  // guild's name, so one bad character in config would break it for
  // everyone at once. Guild names come from config.ts and are trusted
  // today; escaped defensively regardless (security).
  test("escapes an ampersand in a guild name, which would otherwise trigger Telegram's silent 400 for everyone", () => {
    const message = standingsMessage({
      week: [{ slug: "amp", name: "A & B", activeDays: 10, minutes: 1000, perMember: 0.1, memberCount: 100 }],
      season: [{ slug: "amp", name: "A & B", activeDays: 50, minutes: 5000, perMember: 0.5, memberCount: 100 }],
      ...CLOCK,
    });
    expect(message).toContain("A &amp; B");
    expect(message).not.toMatch(/&(?!amp;)/);
  });
});

describe("registration copy", () => {
  const LINK = "https://t.me/aaltosportsbot?start=prodeko";

  test("the registration copy quotes the configured target, not a literal", () => {
    expect(reminderSet(20, "Prodeko", LINK)).toContain(`${WEEKLY_TARGET_MINUTES} minutes a week`);
    expect(reminderOff("Prodeko", LINK)).toContain(`${WEEKLY_TARGET_MINUTES} minutes a week`);
  });

  // FR-24 requires the control to be discoverable rather than only documented
  // in help text, and this is the moment every user passes through. Phase 1
  // asserted the opposite: /remind did not exist yet, and pointing at a
  // command that silently does nothing is worse than not mentioning it. Phase
  // 3 adds the command, so the restraint inverts into a requirement.
  test("the registration copy points at /remind, which exists now", () => {
    expect(reminderSet(20, "Prodeko", LINK)).toContain("/remind");
    expect(reminderOff("Prodeko", LINK)).toContain("/remind");
  });

  // Phase 5 design 10.2. The rules of the game are stated once, on both
  // branches of the reminder answer, because nothing else in the bot ever
  // says how guilds are scored: "1.8 minutes per member" on the pin means
  // nothing to someone who was never told the roster is the denominator.
  // Phase 5 design 12.2: the rule is stated as a group interest, in active days.
  test("both reminder answers state how guilds are scored", () => {
    for (const message of [reminderSet(20, "Prodeko", LINK), reminderOff("Prodeko", LINK)]) {
      expect(message).toContain("active days per member");
      expect(message).toContain("everyone on the roster counts");
      expect(message).not.toContain("minutes per member");
    }
  });

  // Phase 5 design 12.4. Friendship nomination (Kim et al. 2015): the newcomer
  // is asked, once, to send the guild's own link to someone they know. The
  // link is the FR-1 deep link, so the recruit lands in the right guild with
  // no extra tap, and the bot never posts on anyone's behalf.
  test("both reminder answers ask the reader to send the guild link to someone", () => {
    for (const message of [reminderSet(20, "Prodeko", LINK), reminderOff("Prodeko", LINK)]) {
      expect(message).toContain("Send them the link");
      expect(message).toContain(LINK);
    }
  });

  // Phase 5 design 10.2. "Most people forget by week three" sold the reminder
  // with a descriptive norm about lapsing, and a message that says most people
  // do the undesirable thing also says most people do it (Cialdini 2003,
  // docs/evidence.md 5.2). The reminder is still recommended, without the norm.
  // FR-29 and phase 5 design 11.3. The target is the reader's to raise, and
  // the registration reply is where they learn that.
  test("both reminder answers point at /target", () => {
    expect(reminderSet(20, "Prodeko", LINK)).toContain("/target");
    expect(reminderOff("Prodeko", LINK)).toContain("/target");
  });

  test("the target prompt names the WHO line and the options come from config", () => {
    expect(TARGET_PROMPT).toContain(`${WEEKLY_TARGET_MINUTES}`);
    expect(TARGET_PROMPT).toContain("WHO");
    expect(TARGET_OPTIONS[0]).toBe(WEEKLY_TARGET_MINUTES);
    expect([...TARGET_OPTIONS]).toEqual([...TARGET_OPTIONS].sort((a, b) => a - b));
  });

  // The person raising their target is the one the daily cap frustrates, so
  // the confirmation says what the cap is and why, once, in their own /target
  // reply rather than in a group chat.
  // Phase 5 design 12. The guild counts a day as one active day whatever its
  // length, so the reply says that rather than naming a minute cap.
  test("setting a target states the figure and that the guild counts days, not hours", () => {
    const message = targetSet(300);
    expect(message).toContain("<b>300 minutes a week</b>");
    expect(message).toContain("one active day");
    expect(message).not.toContain(`${TIER_MINUTES.long} minutes`);
    expect(message).not.toMatch(/[–—]/);
  });

  test("welcome() recommends the reminder without saying most people lapse", () => {
    const message = welcome("Andreas", "Prodeko");
    expect(message).toContain("should I?");
    expect(message).not.toMatch(/most people/i);
  });

  // Telegram first names are attacker-controlled (security).
  test("welcome() escapes HTML in the first name rather than rendering it live", () => {
    const message = welcome("<i>Eve</i>", "Prodeko");
    expect(message).toContain("&lt;i&gt;Eve&lt;/i&gt;");
    expect(message).not.toContain("<i>Eve</i>");
  });

  // Guild names come from config.ts and are trusted today; escaped
  // defensively so a future guild named e.g. "X & Y" cannot silently make
  // Telegram reject the whole message with a 400 (security).
  test("escapes an ampersand in the guild name in both reminder messages", () => {
    expect(reminderSet(20, "A & B", LINK)).toContain("A &amp; B");
    expect(reminderOff("A & B", LINK)).toContain("A &amp; B");
  });
});

const WEEK: GuildStanding[] = [
  { slug: "inkubio", name: "Inkubio", activeDays: 96, minutes: 9640, perMember: 0.24, memberCount: 400 },
  { slug: "prodeko", name: "Prodeko", activeDays: 148, minutes: 14820, perMember: 0.2277, memberCount: 650 },
];

// Phase 5 design 13. The finish pass: the small things that stop the bot
// reading as unfinished. Each is a fact a person hits on a first or second
// contact, so each is pinned.
describe("finish copy (phase 5 design 13)", () => {
  const LINK = "https://t.me/aaltosportsbot?start=prodeko";

  test("the profile texts fit Telegram's limits and say what the bot is", () => {
    expect(BOT_SHORT_DESCRIPTION.length).toBeLessThanOrEqual(120);
    expect(BOT_DESCRIPTION.length).toBeLessThanOrEqual(512);
    expect(BOT_DESCRIPTION).toContain("active days");
    expect(BOT_DESCRIPTION).toContain("visible");
  });

  test("a typed message gets the three commands back", () => {
    for (const command of ["/log", "/me", "/standings"]) expect(UNKNOWN_TEXT).toContain(command);
  });

  test("an error has a reply", () => {
    expect(SOMETHING_WRONG.length).toBeGreaterThan(10);
  });

  test("before the start and after the end the check-in says when, in words", () => {
    expect(beforeStart(COMPETITION_START)).toContain("starts on");
    expect(beforeStart("2026-07-27")).toContain("27 July 2026");
    expect(afterEnd(COMPETITION_END)).toContain("ended on");
    expect(afterEnd("2026-09-20")).toContain("20 September 2026");
  });

  test("the already-counted reply carries the rules and the link, and asks the reminder question only when unasked", () => {
    const unasked = alreadyRegistered("Prodeko", LINK, true);
    expect(unasked).toContain("counted for <b>Prodeko</b>");
    expect(unasked).toContain("should I?");
    expect(unasked).toContain(LINK);
    const asked = alreadyRegistered("Prodeko", LINK, false);
    expect(asked).not.toContain("should I?");
    expect(asked).toContain("active days per member");
  });

  test("moved and stayed ask the reminder question only when the keyboard is there", () => {
    expect(moved("TiK", true)).toContain("should I?");
    expect(moved("TiK", false)).not.toContain("should I?");
    expect(stayed("Prodeko", true)).toContain("should I?");
    expect(stayed("Prodeko", false)).toContain("Staying in <b>Prodeko</b>.");
  });

  test("a superseded undo points at /me, which is where you are", () => {
    expect(UNDO_SUPERSEDED).toContain("/me");
    expect(UNDO_SUPERSEDED).not.toContain("/log");
  });

  test("the follow-up's pronoun matches its buttons", () => {
    expect(REMINDER_FOLLOWUP).toContain("Want them back?");
  });

  test("the binding reply sets the pin expectation", () => {
    expect(chatBound("Prodeko")).toContain("within 15 minutes");
    expect(chatBound("Prodeko")).toContain("permission to pin");
  });

  test("the target copy names nothing the reader has not seen, and shows the way back", () => {
    expect(targetSet(300)).not.toContain("celebration");
    expect(targetSet(300)).toContain("Your bar and your streak");
    expect(targetStatus(300)).toContain(`back to ${WEEKLY_TARGET_MINUTES}`);
  });

  test("toasts share one shape: a unit where there is a number, no full stop", () => {
    expect(toastTargetSet(300)).toBe("Target set to 300 min");
    expect(TOAST_ADMINS_ONLY.endsWith(".")).toBe(false);
  });

  test("the rules say what a tap counts", () => {
    expect(reminderSet(20, "Prodeko", LINK)).toContain(
      `${TIER_MINUTES.short}, ${TIER_MINUTES.medium} or ${TIER_MINUTES.long} minutes`,
    );
  });

  test("/me after the end is labelled as the final week", () => {
    const after = meMessage({
      weekMinutes: 112,
      target: 150,
      streak: 3,
      guildName: "Prodeko",
      guildRank: 2,
      guildCount: 9,
      neighbours: [],
      phase: "after",
    });
    expect(after).toContain("Final week");
    expect(after).not.toContain("This week");
    // Smoke run 2026-09-08: the guild line said "this week" under that label.
    expect(after).toContain("2nd of 9 in the final week");
    expect(after).not.toContain("this week");
  });
});

describe("pinnedStandings (FR-19)", () => {
  test("renders the same tables as /standings", () => {
    const pinned = pinnedStandings({ week: WEEK, season: WEEK, ...CLOCK, pinFailed: false });
    expect(pinned).toBe(standingsMessage({ week: WEEK, season: WEEK, ...CLOCK }));
  });

  // Phase 2 design 3.2. The live number is the valuable part and it works unpinned,
  // so a missing right is one extra line, not a failure state.
  test("adds one line when the bot could not pin", () => {
    const pinned = pinnedStandings({ week: WEEK, season: WEEK, ...CLOCK, pinFailed: true });
    expect(pinned).toStartWith(standingsMessage({ week: WEEK, season: WEEK, ...CLOCK }));
    expect(pinned).toContain("admin");
  });
});

describe("mondayPost (FR-20)", () => {
  const input = {
    winners: ["Inkubio"],
    guildName: "Prodeko",
    guildRank: 2,
    guildCount: 9,
    guildDays: 148,
    loggers: 52,
    ...CLOCK,
    race: { name: "FK", direction: "up" as const, days: 4 },
  };
  // Phase 5 design 10.1. The season result travels only on the closing post,
  // and a different winner from last week's so the two sentences are told apart.
  const season = { winnerName: "TiK", guildRank: 4 };

  // Phase 5 design 12. Every interpolated value stripped, with explicit (not
  // regex) replacements, so what remains is the sentence skeleton.
  const skeleton = (post: string, v: { name: string; rank: string; days: string; race: string }) =>
    post
      .replaceAll(v.name, "GUILD_NAME")
      .replaceAll(v.rank, "RANK")
      .replaceAll(`${v.days} active days`, "DAYS")
      .replaceAll("52 of you", "PARTICIPATION")
      .replaceAll(v.race, "RACE");

  test("names last week's winner and the reader's own guild, in active days", () => {
    const post = mondayPost(input);
    expect(post).toContain("Last week Inkubio took it.");
    expect(post).toContain("Prodeko finished 2nd of 9 with 148 active days");
  });

  // Phase 5 design 13.1. A shared first place is named as shared, and a week
  // nobody logged is not awarded to anyone.
  test("a shared first place is named as shared", () => {
    const post = mondayPost({ ...input, winners: ["Inkubio", "TiK"] });
    expect(post).toContain("Last week Inkubio and TiK shared it.");
    expect(post).not.toContain("took it");
  });

  test("a week with no active days anywhere has no winner", () => {
    const post = mondayPost({ ...input, winners: [], guildDays: 0 });
    expect(post).toContain("Last week nobody logged a day.");
    expect(post).not.toContain("took it");
  });

  test("escapes every winner name", () => {
    const post = mondayPost({ ...input, winners: ["<b>x</b>", "A & B"] });
    expect(post).toContain("&lt;b&gt;x&lt;/b&gt; and A &amp; B shared it");
  });

  // Phase 5 design 13.1. "1 active days" was reachable for any small guild.
  test("one active day is singular everywhere it appears", () => {
    const post = mondayPost({ ...input, guildDays: 1 });
    expect(post).toContain("with 1 active day and");
    expect(post).toContain("The mark to beat: 1 active day.");
    expect(post).not.toContain("1 active days");
  });

  // Phase 5 design 12.2. No per-member figure is ever displayed: an average
  // over the roster is a low descriptive norm broadcast to everyone above it
  // (Chen et al. 2010, Schultz et al. 2007). The rank carries the
  // normalisation; the numbers are counts.
  test("prints no per-member figure and no decimal anywhere", () => {
    expect(mondayPost(input)).not.toMatch(/\d\.\d/);
    expect(mondayPost(input)).not.toContain("per member");
  });

  // Phase 2 design 3.3 and phase 5 design 5.4. The figure is about the reader's
  // guild, and it is a count of people rather than a share of the roster.
  test("counts the members of the reader's guild who logged, and never prints a share", () => {
    const post = mondayPost(input);
    expect(post).toContain("52 of you");
    expect(post).not.toContain("%");
  });

  // FR-20's acceptance test: it must state that the new week starts at zero.
  test("says the week resets", () => {
    const post = mondayPost(input);
    expect(post).toContain("zero");
    expect(post).toContain("Nothing carries over");
  });

  // Phase 5 design 11.1. The opening carries the clock.
  test("opens with the competition clock", () => {
    expect(mondayPost(input)).toContain("<b>Week 5 of 8. Everyone back to zero.</b>");
    expect(mondayPost(input)).not.toContain("New week.");
  });

  // Phase 5 design 12.3. A specific group goal (Kleingeld et al. 2011,
  // d = 0.80 for specific difficult group goals): last week's own total is
  // the mark to beat, stated as a number and asked for nothing else.
  test("sets last week's own total as the mark to beat", () => {
    expect(mondayPost(input)).toContain("The mark to beat: 148 active days.");
  });

  test("a guild with no active days last week gets no mark to beat", () => {
    const post = mondayPost({ ...input, guildDays: 0 });
    expect(post).not.toContain("mark to beat");
    expect(post).toContain("0 active days");
  });

  // Phase 5 design 11.2 and 12.2. The local race, now in active days, which is
  // the unit a member can act on: one more person logging one more day.
  test("names the guild one place up and the gap to it in active days", () => {
    expect(mondayPost(input)).toContain("FK, one place up, was 4 active days away.");
  });

  test("the winner races the guild one place down", () => {
    const post = mondayPost({ ...input, guildRank: 1, race: { name: "AS", direction: "down", days: 3 } });
    expect(post).toContain("AS, one place down, was 3 active days away.");
  });

  test("one day is singular", () => {
    const post = mondayPost({ ...input, race: { name: "FK", direction: "up", days: 1 } });
    expect(post).toContain("FK, one place up, was 1 active day away.");
  });

  test("a tie reads as level, never as zero days", () => {
    const post = mondayPost({ ...input, race: { name: "FK", direction: "up", days: 0 } });
    expect(post).toContain("FK finished level with you on days.");
    expect(post).not.toContain("0 active day");
  });

  test("with no adjacent guild there is no race sentence", () => {
    const post = mondayPost({ ...input, race: null });
    expect(post).not.toContain("away");
    expect(post).not.toContain("level with");
  });

  test("escapes the adjacent guild's name", () => {
    const post = mondayPost({ ...input, race: { name: "<b>x</b>", direction: "up", days: 2 } });
    expect(post).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  // SPEC.md section 11 rates a guild disengaging from a hopeless position as
  // the top risk, and this post is the fresh start that answers it. Render the
  // post for a guild placed 1st and again for one placed 9th, strip every
  // interpolated value from both, and require the two skeletons to be
  // byte-identical: a rank-conditional aside would survive substring checks
  // and fail this.
  test("reads the same for a guild that finished last as for one that won", () => {
    const first = mondayPost({
      ...input,
      guildName: "Prodeko",
      guildRank: 1,
      guildDays: 148,
      race: { name: "AS", direction: "down", days: 3 },
    });
    const last = mondayPost({
      ...input,
      guildName: "Athene",
      guildRank: 9,
      guildDays: 14,
      race: { name: "FK", direction: "up", days: 40 },
    });
    expect(first).toContain("1st");
    expect(last).toContain("9th");
    expect(last).toContain("Nothing carries over");
    expect(
      skeleton(first, { name: "Prodeko", rank: "1st", days: "148", race: "AS, one place down, was 3 active days" }),
    ).toBe(
      skeleton(last, { name: "Athene", rank: "9th", days: "14", race: "FK, one place up, was 40 active days" }),
    );
  });

  test("renders the winning guild reading its own post", () => {
    const post = mondayPost({ ...input, guildName: "Inkubio", guildRank: 1, guildDays: 96 });
    expect(post).toContain("1st");
  });

  // First names and guild names reach other users, so interpolation is escaped.
  test("escapes a guild name containing markup", () => {
    const post = mondayPost({ ...input, guildName: "<b>x</b>" });
    expect(post).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  test("escapes a winner name containing markup", () => {
    const post = mondayPost({ ...input, winners: ["<b>x</b>"] });
    expect(post).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  // Phase 2 design 4.8. The closing post fires the Monday AFTER the window
  // closes, so the ordinary copy's claims are all false on it.
  test("the closing post does not promise a new week", () => {
    const post = mondayPost({ ...input, final: season });
    expect(post).toContain("That's the competition");
    expect(post).not.toContain("New week");
    expect(post).not.toContain("back to zero");
    expect(post).not.toContain("Nothing carries over");
    expect(post).not.toContain("This week is open");
    expect(post).not.toContain("Week 5 of 8");
    // Phase 5 design 12.3. There is no week left to beat the mark in.
    expect(post).not.toContain("mark to beat");
  });

  // The numbers mean the same thing on the closing post as on any other, so
  // the middle of the message must be untouched by the variant.
  test("the closing post carries the same figures as an ordinary one", () => {
    const post = mondayPost({ ...input, final: season });
    expect(post).toContain("Last week Inkubio took it.");
    expect(post).toContain("Prodeko finished 2nd of 9 with 148 active days");
    expect(post).toContain("52 of you");
    expect(post).toContain("FK, one place up, was 4 active days away.");
  });

  // The same guard as the ordinary post's skeleton test, applied to the variant.
  test("the closing post reads the same for a guild that finished last", () => {
    const first = mondayPost({
      ...input,
      final: { ...season, guildRank: 1 },
      guildName: "Prodeko",
      guildRank: 1,
      guildDays: 148,
      race: { name: "AS", direction: "down", days: 3 },
    });
    const last = mondayPost({
      ...input,
      final: { ...season, guildRank: 9 },
      guildName: "Athene",
      guildRank: 9,
      guildDays: 14,
      race: { name: "FK", direction: "up", days: 40 },
    });
    expect(
      skeleton(first, { name: "Prodeko", rank: "1st", days: "148", race: "AS, one place down, was 3 active days" }),
    ).toBe(
      skeleton(last, { name: "Athene", rank: "9th", days: "14", race: "FK, one place up, was 40 active days" }),
    );
  });

  // Phase 5 design 10.1 and 12.2. The closing post names the season winner and
  // the reader's season rank; no figure, because the only honest one would be
  // a per-member average.
  test("the closing post names the season winner and the reader's season rank", () => {
    const post = mondayPost({ ...input, final: season });
    expect(post).toContain("TiK wins the season, with Prodeko 4th of 9.");
    expect(post).toContain("Last week Inkubio took it.");
  });

  // Smoke run 2026-09-08. The season winner reading its own closing post
  // saw "Prodeko wins the season, with Prodeko 1st of 9." The clause naming
  // the reader's place is dropped when the reader is the winner; the branch
  // is on identity, not on rank, and the skeleton test above keeps one winner
  // for both sides so it still holds.
  test("the season winner's own closing post does not name it twice", () => {
    const post = mondayPost({ ...input, guildName: "TiK", final: { ...season, guildRank: 1 } });
    expect(post).toContain("TiK wins the season.");
    expect(post).not.toContain("with TiK 1st");
    expect(post).toContain("TiK finished 2nd of 9");
  });

  test("escapes a season winner name containing markup", () => {
    const post = mondayPost({ ...input, final: { ...season, winnerName: "<b>x</b>" } });
    expect(post).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  // Phase 5 design 5.5. The last line hands the target back to the reader.
  test("the closing post hands the weekly target back to the reader", () => {
    const post = mondayPost({ ...input, final: season });
    expect(post).toContain("The standings stop here.");
    expect(post).toContain(`${WEEKLY_TARGET_MINUTES} minutes a week is yours to keep.`);
  });
});
