# What makes games fun, for a text-only competition bot

Briefing for the Aalto guild-vs-guild exercise bot (Telegram text and inline buttons, one tier per day, a weekly target, guilds ranked per member, real goal a lasting habit). Grades: **A** peer-reviewed experiment or meta-analysis; **B** large-scale industry data or a published case study with numbers; **C** practitioner consensus (book, talk, interview); **D** blog folklore or an unverifiable secondary claim. Bracketed numbers refer to the source list.

## 1. Theories of fun that survive the loss of graphics

**Self-Determination Theory / PENS (Rigby and Ryan).** Games are enjoyed to the degree they satisfy competence, autonomy and relatedness; Ryan, Rigby and Przybylski's four studies found each need independently predicts enjoyment and intention to keep playing [1, 2] (A for the correlation). Tyack and Mekler's review of 110 CHI papers found most uses of SDT superficial [3, 4]: a checklist, not a formula. The actionable number is Deci, Koestner and Ryan's: verbal praise raises intrinsic motivation (d = +0.33 on free-choice behaviour), informational praise d = +0.66, controlling praise d = -0.44 [5] (A). So: a progress signal after every log (competence), real choices about tier and reminders (autonomy), the guild as the unit that wins (relatedness), and copy that states facts ("4 of 7 days, 20 minutes to target") rather than pressures.

**Lazzaro's four keys.** Hard fun (fiero after struggle), easy fun (curiosity), people fun (competition and cooperation), serious fun (real-world value). Evidence: a 2004 XEODesign study that filmed a few players and coded facial expressions, never peer reviewed [6] (C). Three keys need no graphics: serious fun is the premise (the exercise is real), people fun lives in the guild chat and standings, hard fun is the weekly target as a small honest win-state. Easy fun is what a text bot lacks; its only cheap source is surprise in copy.

**Koster: fun is pattern learning.** An essay; his claim that neuroscience "validated" it is his own, and critics note it ignores social play [7] (C/D). A logging bot has almost no pattern to master, so do not manufacture depth (unlockables, combos); let the weekly rhythm and the standings supply novelty.

**Csikszentmihalyi's flow.** Harris et al.'s meta-analysis of 22 sport and gaming studies finds a medium flow-performance correlation, r = 0.31 (95% CI 0.24 to 0.38), questionnaire-measured, causal direction undetermined [8] (A). Flow needs sustained challenge-skill balance with continuous feedback, which a 15-second log cannot host; it happens in the workout, so the bot must not interrupt: reply within a second, ask one thing, finish (C).

**Nguyen: striving play and value capture.** Philosophy (C), but two ideas fit exactly. Striving play: players temporarily adopt a disposable goal (winning) to get the goods of the struggle, a "motivational two-step" [9]. Value capture: when a rich value (health) meets a simplified metric (steps, minutes), the metric takes over practical reasoning [10]. Keep the game light enough to drop when the semester ends, keep the metric coarse (four tiers, not minutes), and never rank individuals globally, which is where capture bites.

**Juul: the art of failure.** Juul's own survey found players rated a game higher if they had failed at least once and preferred feeling responsible for failure over guaranteed success [11, 12] (C, small self-report). Missing the weekly target must be possible, visible and the player's own doing, with an obvious route back (the weekly reset); do not hide failure and do not punish it.

**Schell and Sylvester.** Schell: "fun is pleasure with surprises", and endogenous value (things matter only inside the game) [13] (C). Sylvester: games generate emotion by changing the state of "human values" (victory/defeat, friend/stranger); elegance is the most emotion per mechanic [14] (C). A text bot's emotional events are state changes (a rank swap, a target hit, a milestone, a teammate logging); announce changes, not states.

## 2. Core loop, session length and juice without pixels

The "core loop" (act, feedback, progress, reason to return) is industry consensus, not a tested theory [18] (C); Hopson's 2001 reinforcement-schedule article is its root and Eyal's Hooked a synthesis with no evidence of its own [19] (D). GameAnalytics' median mobile session is 2.7 to 3.6 minutes, top-quartile games 5 to 7, about 1.7 sessions a day [20] (B); Wordle wanted "three minutes of your time a day" [36]. A 15-second tier log is fine: the reason to return is new information (the standings moved, a teammate logged), not a reward. The goal-gradient effect (people accelerate as a stamp card fills) is field-replicated [77] (A): show the bar and the minutes remaining.

"Juice" (Swink's "real-time control of virtual objects in a simulated space, with interactions emphasised by polish" [15]; the 2012 "Juice it or lose it" talk; Vlambeer's screenshake tweaks [16, 17]) has no empirical literature; it is craft (C). About a third translates to text: reply within a second and edit the message in place (the text equivalent of hit-stop), a bar that visibly fills, copy that varies so the tenth confirmation is not the first, an emoji reaction on the user's message, and a rare Telegram effect for the biggest event.

Measured text-copy effects are single-digit: Duolingo's German notification copy raised opt-in 8% and "commit to my goal" beat "continue" [23, 25], and a bandit choosing among notification texts added 0.5% DAU and 2% new-user retention [24] (B). Expect that scale. The peak-end rule replicates, though smaller than folklore says [21] (A for the finding, C for the application): put the best line at the end of each confirmation and of each week.

## 3. What the famous products actually report

**Duolingo** (B unless noted). Leaderboards: +17% learning time, highly engaged learners tripled [22]. Streaks: a 10-day streak "substantially" reduces drop-off (a correlation); over four years current-user retention rose 21% [22]. Streak wager: +14% D7; weekend amulet: +4% return, 5% fewer lost streaks [26]. After 600-plus streak experiments they simplified streaks to "one lesson a day", and they let users opt out of leaderboards [25, 27]. League XP farming is documented by users and denied by Duolingo [28] (D). "Streak freeze cut churn 21%" and "7-day streak means 3.6x retention" have no traceable primary source [29] (D); the famous "these reminders don't seem to be working" notification is called one of their most successful, with no published numbers [30] (C).

**Strava.** A peer-reviewed study of 329 runners in five Dutch clubs' Strava groups over 11 months (modelled to separate selection from influence) found: kudos led runners to run more and more often, runners converged on their kudos-friends' behaviour, and, against expectation, converged more toward friends who ran *less* [31] (A, observational). Larger Strava networks correlate with higher self-efficacy [32] (B); in Strava's survey of 6,990 people, over half are most motivated by friends or family who exercise [33] (B); the "club members twice as likely" and "active 12 months later" figures exist only on secondary stats sites [34] (D).

**Wordle.** 90 players on 1 November 2021, 300,000 by 2 January, 2 million a week later [35] (B). Rationale (interviews, C): one puzzle a day for scarcity, three minutes and no more, and a spoiler-free emoji grid a player invented and Wardle adopted without adding links [36]. One tier per day has the same shape; the shareable artefact is the idea to steal.

**Pokémon Go.** Engaged players added 1,473 steps a day across 30 days [37] (B); a difference-in-differences study of 1,182 players found +955 steps in week one and baseline again by week six [38] (A); a meta-analysis of 17 studies (33,108 people) calls the effect significant but modest [39] (A). Exercise-as-gameplay novelty decays in about six weeks; plan for week seven.

**Zombies, Run!** Interview studies credit narrative immersion [40] (C); the one RCT found no significant advantage and was underpowered [41] (A, small). Narrative is expensive in text; skip it.

**Fitbit and Apple Watch.** No public A/B data on rings, streaks or sharing exists. A pilot RCT deconstructing Fitbit found social comparison and goal setting not significantly better than self-monitoring [42] (A, small); Zuckerman and Gal-Oz found virtual rewards and social comparison no better than plain measurement [47] (A, small).

## 4. Competition design

**Close races.** Berger and Pope's "slightly behind at half-time wins more" (2 to 6 percentage points) [48] failed a 2023 high-powered replication across four sports; the effect survives only in the original NBA sample [49] (A). Do not build on it. What replicates is rank feedback: Gill et al. find a U-shaped response, effort rising most after being ranked first or last and least in the middle [50] (A). So give every guild a local race (the gap up and the gap down), because the middle is where motivation is flattest.

**How many rivals.** The N-effect: competitive motivation falls as competitors multiply; people finished a quiz faster believing they faced 10 rather than 100 rivals [51] (A). A handful of guilds is the right scale; three neighbours is the right within-guild comparison size.

**Underdogs and runaways.** The underdog effect raises performance through the wish to prove doubters wrong, but only when the doubters lack credibility [52] (A). A bot is a low-credibility doubter, so playful underdog framing is safe; an authoritative "you cannot catch them" is not. Runaway leaders are corrosive: with Tiger Woods in the field, rivals scored about 0.8 strokes worse per tournament [53] (B, archival, contested [54]). Per-capita normalisation removes the size-based runaway; reporting the week beside the season gives trailing guilds a race they can still win.

**Free riding and contribution.** Social loafing is among psychology's most reliable effects (78 studies, d = -0.44), reduced when individual output is identifiable, the task matters and groups are small [55] (A). Kerr and Bruun: effort drops as members feel dispensable, and capable members cut effort when they see others free ride (the sucker effect) [56] (A). The reverse is the Köhler effect: the weaker member works harder when indispensable and the partner is moderately, not vastly, better; Feltz, Kerr and Irwin got significantly longer plank holds with a virtual partner at 1.4x the participant's ability [57] (A). Per-member scoring makes nobody dispensable; the "around you" block should show moderately better neighbours, not the top.

**Competition versus support.** Zhang, Brackbill, Yang and Centola (n = 790 students): competitive 6-person networks raised exercise class attendance 90% over conditions without comparison; supportive team chat did nothing (p = 0.68) [43] (A). Patel et al. (n = 304, 4-person teams): a team-only reward did no better than control (0.17 vs 0.18 of days), the combined individual-plus-team reward did best (0.35), nothing persisted at follow-up [44] (A). STEP UP (n = 602): competition +920 steps a day, support +689, collaboration +637; only competition stayed significant 12 weeks after the programme (+569) [45] (A). A meta-analysis of 16 gamification RCTs: g = 0.42 during interventions, 0.15 at 14-week follow-up [46] (A). The pinned standings, not the chat's encouragement, carries the effect, and each person's contribution must count on its own as well as through the guild.

**Descriptive norms.** Schultz et al.: telling below-average households the neighbourhood average cut consumption, telling above-average households the same made them regress, and an injunctive smiley removed the boomerang [58] (A). A small RCT found descriptive-plus-injunctive feedback raised steps within a week [59] (A, n = 111), and the Strava study shows the downward pull among runners [31]. Publish norms only when high, pair them with approval, and never print "only 20% of your guild logged today", which is a norm too.

**What disengages.** Bottom-of-leaderboard positions produce competence frustration and withdrawal [60] (B). Sandbagging has thin evidence; the closest data are Duolingo's XP farming [28] and Snapchat's content-free "streak snaps" [72] (B). Expect the light tier to be gamed at the margin; a coarse tier makes that harmless.

**Timing.** The fresh start effect: gym visits, diet searches and goal commitments rise after temporal landmarks such as the start of a week [61] (A, archival). Monday is the right moment for the standings post.

## 5. Dark patterns and what to avoid

Zagal, Björk and Lewis define a dark game design pattern as one "used intentionally by a game creator to cause negative experiences for players that are against their best interests and likely to happen without their consent", listing temporal (grinding, playing by appointment), monetary (pay to skip, pre-delivered content, monetized rivalries) and social-capital patterns (social pyramid schemes, impersonation) [62] (C). The live risk here is playing by appointment (a hard one-day window plus a daily reminder); a backdate to yesterday is the mitigation, and impersonation means never posting in the group on a user's behalf.

**Loot boxes and variable rewards.** Loot-box spending correlates with problem gambling (eta squared about 0.05, replicated), direction unknown [63, 64] (A for the correlation). Nothing here needs randomising; the standings already vary.

**Overjustification.** Expected tangible rewards reduce free-choice intrinsic motivation (d = -0.36), unexpected rewards do not, and praise helps [5] (A). Exercise is a special case: Charness and Gneezy paid people to visit a gym eight times in a month and attendance stayed about twice as high after payment stopped, entirely among prior non-attendees [65] (A); Milkman's megastudy of 61,293 gym members found 45% of 54 four-week programmes raised visits 9 to 27%, only 8% showed effects afterwards, and the best paid micro-rewards for returning after a missed workout [66] (A); Cerasoli's meta-analysis finds incentives predict quantity, intrinsic motivation quality [67] (A). Nudges can seed an exercise habit; keep them small, informational and aimed at the return after a miss rather than at the streak.

**Streaks.** Silverman and Barasch (seven studies): a highlighted intact streak increases continuation, a highlighted broken one decreases it, the drop is worse when people blame themselves, and repairability blunts it [68] (A). A Peruvian RCT with 60,000 pupils found streak-highlighting messages beat generic reminders and raised maths scores 0.13 to 0.17 SD [69] (A). Habits take a median 59 to 66 days to feel automatic, range 4 to 335, and half of Lally's participants had no habit after 84 days [70, 71] (A): a two-to-three-month competition can seed a habit but will not finish one. Streak anxiety has adolescent Snapchat evidence [72, 73] (B) and otherwise blog folklore (D). If streaks are shown, make them repairable (Duolingo's amulet) or coarse (weeks with the target hit, which one missed day cannot break).

**Notification fatigue.** The quoted industry thresholds (one weekly push makes 10% disable, 3 to 6 a week make 40% opt out) come from an uncited compilation [74] (D). Trials are calmer: a micro-randomised trial found a tailored push raises engagement within 24 hours, best at midday on weekends [75] (A); a 77-person trial found daily notifications did not deter use [76] (A, small). Duolingo sends at most one a day at the user's habitual hour and stops when ignored [24, 30] (B/C). One per day at a chosen hour, with an auto-stop after a few ignores.

## 6. What a text bot can still do, and cannot

**Can do:** a one-tap daily loop under 15 seconds with in-place feedback; a progress bar and weekly target; local races; visible personal contribution inside a guild; a Monday fresh start; informational praise; varied copy with occasional surprise; a shareable weekly artefact (a Wordle-style grid of seven tiers); one well-timed, stoppable reminder; real opt-outs; a rare effect for the biggest events; a repairable or coarse streak.

**Cannot do:** flow (no continuous input); easy fun from spectacle; affordable narrative immersion; game feel in Swink's sense (no real-time control); variable reward without drifting into dark patterns; identity or avatar expression; anything that asks the user to watch rather than glance. It cannot escape the six-week novelty decay or the 8% persistence of nudges; the honest goal is carrying students to the two-month mark where a habit can stand on its own.

## Sources

1. Ryan, Rigby, Przybylski 2006, The motivational pull of video games: https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf
2. Przybylski, Rigby, Ryan 2010, A motivational model of video game engagement: https://selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf
3. Tyack, Mekler 2020, SDT in HCI games research (CHI): https://dl.acm.org/doi/abs/10.1145/3313831.3376723
4. Tyack, Mekler 2024, Unfulfilled promises and unquestioned paradigms (TOCHI): https://dl.acm.org/doi/10.1145/3673230
5. Deci, Koestner, Ryan 2001 (reprise of the 1999 meta-analysis, with effect-size tables): https://www.selfdeterminationtheory.org/SDT/documents/2001_DeciKoestnerRyan.pdf
6. Lazzaro, GDC 2004, Why we play games (report): https://www.gamedeveloper.com/marketing/postcard-from-gdc-2004-why-we-play-games-the-four-keys-to-player-experience
7. Koster's Theory of Fun, ten years on: https://www.gamedeveloper.com/design/raph-koster-s-theory-of-fun-ten-years-on
8. Harris, Allen, Vine, Wilson 2021, flow states and performance meta-analysis: https://www.tandfonline.com/doi/full/10.1080/1750984X.2021.1929402
9. Nguyen, Précis of Games: Agency as Art: https://philpapers.org/archive/NGUPOG.pdf
10. Nguyen, Value Capture: https://philpapers.org/archive/NGUVCH.pdf
11. Juul 2009, Fear of Failing?: https://jesperjuul.net/text/fearoffailing/
12. Juul, The Art of Failure (MIT Press): https://mitpress.mit.edu/9780262529952/the-art-of-failure/
13. Schell, The Art of Game Design, quotes: https://www.goodreads.com/work/quotes/3436929
14. Sylvester, Designing Games: https://tynansylvester.com/book/
15. Swink, Game Feel, chapter 1: http://mycours.es/gamedesign2014/files/2014/10/Game-Feel-Steve-Swink-chapter-1.pdf
16. Nijman (Vlambeer), The Art of Screenshake, notes: https://theengineeringofconsciousexperience.com/jan-willem-nijman-vlambeer-the-art-of-screenshake/
17. Squeezing more juice out of your game design: https://www.gamedeveloper.com/design/squeezing-more-juice-out-of-your-game-design-
18. The compulsion loop explained: https://www.gamedeveloper.com/business/the-compulsion-loop-explained
19. Review of Eyal's Hooked, An incomplete loop: https://bigthink.com/wikimind/an-incomplete-loop-a-review-of-hooked-by-nir-eyal/
20. GameAnalytics 2025 mobile gaming benchmarks: https://www.gameanalytics.com/reports/2025-mobile-gaming-benchmarks
21. Meta-analysis of the peak-end rule and duration neglect (2022): https://www.sciencedirect.com/science/article/abs/pii/S0749597822000334
22. Mazal, How Duolingo reignited user growth: https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth
23. Duolingo, copy testing experiments: https://blog.duolingo.com/copy-testing-experiments
24. Yancey, Settles 2020, A sleeping, recovering bandit for recurring notifications (KDD): https://research.duolingo.com/papers/yancey.kdd20.pdf
25. Shuttleworth, Behind the product: Duolingo streaks: https://www.lennysnewsletter.com/p/behind-the-product-duolingo-streaks
26. Duolingo, How streaks keep learners committed: https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/
27. Duolingo, leagues and leaderboards: https://blog.duolingo.com/duolingo-leagues-leaderboards/
28. Kotaku, Duolingo league cheating: https://kotaku.com/duolingo-app-cheats-hacks-leagues-xp-why-duohacker-1850506482
29. Orizon (unsourced 21% streak-freeze claim): https://www.orizon.co/blog/duolingos-gamification-secrets
30. Sherwood, Duolingo notifications (Kansu quote): https://sherwood.news/tech/duolingo-q2-earnings-monthly-active-users-milestone/
31. Kudos make you run! How runners influence each other on Strava (Social Networks, 2023): https://www.sciencedirect.com/science/article/pii/S0378873322000909
32. Motivational dynamics and Strava use in club runners (2026): https://doi.org/10.3390/bs16020224
33. Strava Year in Sport 2023 press release: https://press.strava.com/articles/strava-releases-year-in-sport-trend-report
34. Secondary Strava statistics (unverified): https://sqmagazine.co.uk/strava-statistics/
35. Wordle player numbers (The Conversation): https://theconversation.com/wordle-how-a-simple-game-of-letters-became-part-of-the-new-york-times-business-plan-176299
36. Wardle reflects on Wordle's road to success: https://www.gamedeveloper.com/marketing/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success
37. Althoff, White, Horvitz 2016, Pokémon Go and physical activity (JMIR): https://www.jmir.org/2016/12/e315/
38. Howe et al. 2016, Pokémon GO difference-in-differences (BMJ): https://pubmed.ncbi.nlm.nih.gov/27965211/
39. Khamzina et al. 2020, Pokémon Go meta-analysis (AJPM): https://www.ajpmonline.org/article/S0749-3797(19)30410-6/abstract
40. Zombies, Run! users' engagement, qualitative study: https://pubmed.ncbi.nlm.nih.gov/34813376/
41. The ZOMBIE trial: https://www.researchgate.net/publication/282501013_Exergame_Apps_and_Physical_Activity_The_Results_of_the_ZOMBIE_Trial
42. Deconstructing Fitbit, pilot RCT: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11282379/
43. Zhang, Brackbill, Yang, Centola 2016, Support or competition?: https://www.sciencedirect.com/science/article/pii/S2211335516300936
44. Patel et al. 2016, Individual versus team-based financial incentives (JGIM): https://link.springer.com/article/10.1007/s11606-016-3627-0
45. Patel et al. 2019, STEP UP trial (JAMA Internal Medicine): https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2749761
46. Mazeas et al. 2022, gamification and physical activity meta-analysis (JMIR): https://www.jmir.org/2022/1/e26779
47. Zuckerman, Gal-Oz 2014, Deconstructing gamification: https://link.springer.com/article/10.1007/s00779-014-0783-2
48. Berger, Pope 2011, Can losing lead to winning?: https://pubsonline.informs.org/doi/10.1287/mnsc.1110.1328
49. Does losing lead to winning? Four sports (Management Science 2023): https://ideas.repec.org/a/inm/ormnsc/v69y2023i1p513-532.html
50. Gill, Kissová, Lee, Prowse 2019, First-place loving and last-place loathing: https://pubsonline.informs.org/doi/10.1287/mnsc.2017.2907
51. Garcia, Tor 2009, The N-effect: https://journals.sagepub.com/doi/10.1111/j.1467-9280.2009.02385.x
52. Nurmohamed 2020, The underdog effect (AMJ): https://journals.aom.org/doi/10.5465/amj.2017.0181
53. Brown 2011, Quitters never win (JPE): https://www.journals.uchicago.edu/doi/full/10.1086/663306
54. Connolly, Rendleman, re-examination of the superstar effect: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2533537
55. Karau, Williams 1993, Social loafing meta-analysis: http://www.psych.purdue.edu/~willia55/392F-'06/KarauWilliamsMetaAnalysisJPSP.pdf
56. Kerr, Bruun 1983, Dispensability of member effort: https://www.semanticscholar.org/paper/Dispensability-of-member-effort-and-group-losses:-Kerr-Bruun/cfd58c982f140a5b8c5dae00cf0df8afd3337f70
57. Feltz, Kerr, Irwin 2011, Buddy up: the Köhler effect applied to health games: https://www.researchgate.net/publication/51539278_Buddy_Up_The_Kohler_Effect_Applied_to_Health_Games
58. Schultz et al. 2007, The constructive, destructive, and reconstructive power of social norms: https://journals.sagepub.com/doi/10.1111/j.1467-9280.2007.01917.x
59. RCT of social norm interventions to increase physical activity: https://pubmed.ncbi.nlm.nih.gov/28213634/
60. How leaderboard positions shape motivation (Internet Research 2023): https://www.emerald.com/intr/article/33/7/1/178330/How-leaderboard-positions-shape-our-motivation-the
61. Dai, Milkman, Riis 2014, The fresh start effect: https://pubsonline.informs.org/doi/10.1287/mnsc.2014.1901
62. Zagal, Björk, Lewis 2013, Dark patterns in the design of games: http://www.fdg2013.org/program/papers/paper06_zagal_etal.pdf
63. Zendle, Cairns 2018, loot boxes and problem gambling: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0206767
64. Zendle, Cairns 2019, replication: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0213194
65. Charness, Gneezy 2009, Incentives to exercise (Econometrica): https://onlinelibrary.wiley.com/doi/abs/10.3982/ECTA7416
66. Milkman et al. 2021, Megastudies improve the impact of applied behavioural science (Nature): https://www.nature.com/articles/s41586-021-04128-4
67. Cerasoli, Nicklin, Ford 2014, 40-year meta-analysis: https://pubmed.ncbi.nlm.nih.gov/24491020/
68. Silverman, Barasch 2023, On or off track: how (broken) streaks affect consumer decisions (JCR): https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414
69. Aulagnon, Cristia, Cueto, Malamud, Streaks to success (Economics of Education Review 2025): https://www.sciencedirect.com/science/article/abs/pii/S0272775725001013
70. Lally et al. 2010, How are habits formed: https://onlinelibrary.wiley.com/doi/abs/10.1002/ejsp.674
71. Singh et al. 2024, Time to form a habit, meta-analysis: https://pubmed.ncbi.nlm.nih.gov/39685110/
72. Hristova et al. 2020, Snapchat streaks: how adolescents metagame gamification: https://ceur-ws.org/Vol-2637/paper13.pdf
73. Snapchat streaks, problematic smartphone use and FoMO (2023): https://www.sciencedirect.com/science/article/pii/S2772503023000476
74. Business of Apps push notification statistics (uncited compilation): https://www.businessofapps.com/marketplace/push-notifications/research/push-notifications-statistics/
75. Bidargaddi et al. 2018, To prompt or not to prompt (JMIR mHealth): https://mhealth.jmir.org/2018/11/e10123/
76. Morrison et al. 2017, Timing and frequency of push notifications (PLoS One): https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0169162
77. Kivetz, Urminsky, Zheng 2006, The goal-gradient hypothesis resurrected (also discusses endowed progress): https://home.uchicago.edu/ourminsky/Goal-Gradient_Illusionary_Goal_Progress.pdf
