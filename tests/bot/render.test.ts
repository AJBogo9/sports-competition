import { describe, expect, test } from "bun:test";
import { confirmation, meMessage, progressBlock, standingsMessage } from "../../src/bot/render.ts";
import { reminderOff, reminderSet } from "../../src/strings.ts";
import { WEEKLY_TARGET_MINUTES } from "../../src/config.ts";

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
});

describe("registration copy", () => {
  test("the registration copy quotes the configured target, not a literal", () => {
    expect(reminderSet(20, "Prodeko")).toContain(`${WEEKLY_TARGET_MINUTES} minutes a week`);
    expect(reminderOff("Prodeko")).toContain(`${WEEKLY_TARGET_MINUTES} minutes a week`);
  });
});
