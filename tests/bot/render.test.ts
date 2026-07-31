import { describe, expect, test } from "bun:test";
import {
  confirmation,
  meMessage,
  mondayPost,
  pinnedStandings,
  progressBlock,
  standingsMessage,
} from "../../src/bot/render.ts";
import { reminderOff, reminderSet, welcome } from "../../src/strings.ts";
import { WEEKLY_TARGET_MINUTES } from "../../src/config.ts";
import type { GuildStanding } from "../../src/db/standings.ts";

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
});

describe("confirmation (FR-12)", () => {
  test("leads with the minutes just logged", () => {
    expect(confirmation("medium", 112, 150)).toContain("45 min");
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
        { firstName: "<b>Evil</b>", minutes: 100, isSelf: false },
        { firstName: "Andreas", minutes: 112, isSelf: true },
      ],
    });
    expect(message).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(message).not.toContain("<b>Evil</b>");
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
    { slug: "inkubio", name: "Inkubio", minutes: 9640, perMember: 24.1 },
    { slug: "prodeko", name: "Prodeko", minutes: 14820, perMember: 22.8 },
  ];
  const season = [
    { slug: "prodeko", name: "Prodeko", minutes: 54730, perMember: 84.2 },
    { slug: "inkubio", name: "Inkubio", minutes: 30560, perMember: 76.4 },
  ];

  test("puts the weekly table first, so last place is never permanent", () => {
    const message = standingsMessage({ week, season });
    expect(message.indexOf("This week")).toBeLessThan(message.indexOf("Season"));
  });

  test("renders both tables in one message", () => {
    const message = standingsMessage({ week, season });
    expect(message).toContain("Inkubio");
    expect(message).toContain("Prodeko");
    expect(message).toContain("24.1");
    expect(message).toContain("84.2");
  });

  test("states that the denominator is the whole roster", () => {
    expect(standingsMessage({ week, season })).toContain("Everyone in the guild counts");
  });

  test("numbers the rows in rank order", () => {
    const message = standingsMessage({ week, season });
    expect(message).toMatch(/1\s+Inkubio/);
    expect(message).toMatch(/2\s+Prodeko/);
  });

  // /standings is the most-used message in the product and renders every
  // guild's name, so one bad character in config would break it for
  // everyone at once. Guild names come from config.ts and are trusted
  // today; escaped defensively regardless (security).
  test("escapes an ampersand in a guild name, which would otherwise trigger Telegram's silent 400 for everyone", () => {
    const message = standingsMessage({
      week: [{ slug: "amp", name: "A & B", minutes: 1000, perMember: 10 }],
      season: [{ slug: "amp", name: "A & B", minutes: 5000, perMember: 50 }],
    });
    expect(message).toContain("A &amp; B");
    expect(message).not.toMatch(/&(?!amp;)/);
  });
});

describe("registration copy", () => {
  test("the registration copy quotes the configured target, not a literal", () => {
    expect(reminderSet(20, "Prodeko")).toContain(`${WEEKLY_TARGET_MINUTES} minutes a week`);
    expect(reminderOff("Prodeko")).toContain(`${WEEKLY_TARGET_MINUTES} minutes a week`);
  });

  // /remind does not exist until Phase 3. Directing a user to it now would
  // point them at a command that silently does nothing.
  test("Phase 1 copy never points at the not-yet-existing /remind command", () => {
    expect(reminderSet(20, "Prodeko")).not.toContain("/remind");
    expect(reminderOff("Prodeko")).not.toContain("/remind");
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
    expect(reminderSet(20, "A & B")).toContain("A &amp; B");
    expect(reminderOff("A & B")).toContain("A &amp; B");
  });
});

const WEEK: GuildStanding[] = [
  { slug: "inkubio", name: "Inkubio", minutes: 9640, perMember: 24.1 },
  { slug: "prodeko", name: "Prodeko", minutes: 14820, perMember: 22.8 },
];

describe("pinnedStandings (FR-19)", () => {
  test("renders the same tables as /standings", () => {
    const pinned = pinnedStandings({ week: WEEK, season: WEEK, pinFailed: false });
    expect(pinned).toBe(standingsMessage({ week: WEEK, season: WEEK }));
  });

  // Phase 2 design 3.2. The live number is the valuable part and it works unpinned,
  // so a missing right is one extra line, not a failure state.
  test("adds one line when the bot could not pin", () => {
    const pinned = pinnedStandings({ week: WEEK, season: WEEK, pinFailed: true });
    expect(pinned).toStartWith(standingsMessage({ week: WEEK, season: WEEK }));
    expect(pinned).toContain("admin");
  });
});

describe("mondayPost (FR-20)", () => {
  const input = {
    winnerName: "Inkubio",
    winnerPerMember: 24.1,
    guildName: "Prodeko",
    guildRank: 2,
    guildCount: 9,
    guildPerMember: 22.8,
    participation: 0.31,
  };

  test("names last week's winner and the reader's own guild", () => {
    const post = mondayPost(input);
    expect(post).toContain("Inkubio");
    expect(post).toContain("24.1");
    expect(post).toContain("Prodeko");
    expect(post).toContain("2nd");
    expect(post).toContain("22.8");
  });

  // Phase 2 design 3.3. The percentage is about the reader's guild, not the winner's.
  test("states the reader's guild participation as a whole percentage", () => {
    expect(mondayPost(input)).toContain("31%");
  });

  // FR-20's acceptance test: it must state that the new week starts at zero.
  test("says the week resets", () => {
    const post = mondayPost(input);
    expect(post).toContain("zero");
    expect(post).toContain("Nothing carries over");
  });

  // SPEC.md section 11 rates a guild disengaging from a hopeless position as
  // the top risk, and this post is the fresh start that answers it. Checking
  // only for "9th" and "Nothing carries over" does not prove the copy is
  // unconditional: a regression that appended rank-conditional text, for
  // example a sympathetic aside shown only when guildRank > 6, would leave
  // both substrings intact and a test that only checked those would still
  // pass. Assert the stronger claim directly instead: render the post for a
  // guild placed 1st and again for a guild placed 9th, with the same winner
  // and the same participation, strip every interpolated value from both
  // with explicit (not regex) replacements, and require the two remaining
  // skeletons to be byte-identical.
  test("reads the same for a guild that finished last as for one that won", () => {
    const first = mondayPost({ ...input, guildName: "Prodeko", guildRank: 1, guildPerMember: 22.8 });
    const last = mondayPost({ ...input, guildName: "Athene", guildRank: 9, guildPerMember: 4.2 });
    expect(first).toContain("1st");
    expect(last).toContain("9th");
    expect(last).toContain("Nothing carries over");

    const firstSkeleton = first
      .replaceAll("Prodeko", "GUILD_NAME")
      .replaceAll("1st", "RANK")
      .replaceAll("24.1", "WINNER_PER_MEMBER")
      .replaceAll("22.8", "GUILD_PER_MEMBER")
      .replaceAll("31%", "PARTICIPATION");
    const lastSkeleton = last
      .replaceAll("Athene", "GUILD_NAME")
      .replaceAll("9th", "RANK")
      .replaceAll("24.1", "WINNER_PER_MEMBER")
      .replaceAll("4.2", "GUILD_PER_MEMBER")
      .replaceAll("31%", "PARTICIPATION");

    // The point of the test: with every interpolated value stripped out,
    // nothing distinguishes the post read by the guild that won from the
    // post read by the guild that finished last.
    expect(firstSkeleton).toBe(lastSkeleton);
  });

  test("renders the winning guild reading its own post", () => {
    const post = mondayPost({ ...input, guildName: "Inkubio", guildRank: 1, guildPerMember: 24.1 });
    expect(post).toContain("1st");
  });

  // First names and guild names reach other users, so interpolation is escaped.
  test("escapes a guild name containing markup", () => {
    const post = mondayPost({ ...input, guildName: "<b>x</b>" });
    expect(post).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  // winnerName is escaped at the same call site and the same risk level as
  // guildName (both are attacker-reachable in a future phase); covered
  // separately so a regression in one escape call cannot hide behind the
  // other's test.
  test("escapes a winner name containing markup", () => {
    const post = mondayPost({ ...input, winnerName: "<b>x</b>" });
    expect(post).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
