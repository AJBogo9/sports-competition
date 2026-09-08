# Behaviour-change evidence for a text-only guild sports bot

Briefing for the design of a Telegram bot running a guild-vs-guild student sports competition (one exercise tier per day, a weekly minutes target, guilds ranked by minutes per member, a pinned standings message, a Monday result post, a daily private-chat reminder with one-tap answers and an auto-stop after five ignored reminders). The stated goal is a lasting exercise habit; the competition is the nudge. Compiled 2026-09-07 from web sources; nothing here was read from the repository.

Grades: **A** = randomised trial or meta-analysis, **B** = large observational dataset or quasi-experiment, **C** = expert consensus or well-known book, **D** = blog folklore. Where a famous claim is weaker than its reputation, the grade says so. Source numbers refer to the list at the end.

## 1. Gamification: what the trials actually show

The University of Pennsylvania group (Patel, Volpp, Asch) ran the only sizeable programme of randomised trials of gamified physical activity, and the same recipe appears in all of them: every Monday the participant receives 70 points (10 per day); a missed daily step goal costs 10 points (loss framing); the week starts fresh (fresh-start effect); points retained decide movement between five levels (blue, bronze, silver, gold, platinum), with a signed precommitment pledge at enrolment. The social layer is the variable that changed between trials.

| Trial | n | Social design | Effect during intervention (steps/day vs control) | After it ended |
|---|---|---|---|---|
| BE FIT 2017, families [2] | 200 in 94 families | one family member drawn each day decides the family's points; five "lifelines" for unavoidable misses | +953; goal met on 53% vs 32% of days | +494 over the next 12 weeks, still significant |
| STEP UP 2019, employees [1] | 602 | support = a named sponsor emailed weekly; collaboration = teams of 3 strangers, one member drawn daily; competition = groups of 3 with a weekly leaderboard | support +689, collaboration +637, competition +920 | competition +569 (p=.009), support +428 (p=.04), collaboration +126 (ns) |
| iDiabetes 2021, type 2 diabetes [4] | 361 | same three arms, 12 months | support +503, competition +606, collaboration +280 (ns); no effect on weight or HbA1c | not reported |
| Veterans 2021 [3] | 180 | gamification + support partner, with or without a loss-framed $120 deposit | gamification alone +433 (ns); with money +1,224 | neither arm significant at 8 weeks |
| ENGAGE 2021 [5] | 500 | gamification with four goal-setting variants | only self-chosen goal started immediately: +1,384; assigned or gradual goals about +500 to +600 (ns) | +1,391, still significant |
| BE ACTIVE 2024, cardiac risk [6] | 1,062 | 12 months; gamification with support partner, with or without money | gamification +538, money +492, both +868 | at 6 months: gamification +460, both +576 |

Grade A throughout. Three conclusions follow. First, the social structure does the work: competition among a handful of people was the most effective and the most durable arm in STEP UP, while pure collaboration (a team punished for one member's miss) faded fastest. Second, gamification without either social comparison or money can fail outright: the veterans trial's gamification-plus-support arm was null. Third, effects survive the end of the programme at roughly half strength, and only where the social element was present.

Team incentive trials point the same way. Patel 2016 (304 employees in 76 teams of four, a 7,000-step goal) [7]: goal met on 18% of days in control, 25% with an individual $50 reward, 17% with a team-only reward (every member had to hit the goal), and 35% with a combined reward ($20 for yourself plus $10 per teammate who succeeded). Nothing persisted after the money stopped. Kullgren 2013 [9] (105 obese employees) found a $500 monthly pool split among the members of a five-person group who hit their target produced 4.9 kg of weight loss at 24 weeks against 1.7 kg for an equal $100 individual reward and 0.5 kg for control, and the group arm's lead over control survived 12 weeks after the money stopped. The framing trial [8] (281 employees, $1.40 per day) found only the loss-framed version worked: goal met on 45% of days versus 30% control, with gain-framed (35%) and lottery (36%) not significant. Note that loss framing has only been tested with money or with points that carry money or social meaning; nobody has shown that "losing" purely symbolic points does anything on its own.

Meta-analyses. Mazeas et al. 2022 [11] pooled 16 RCTs (2,407 participants): Hedges g = 0.42 overall, 0.58 against inactive controls, 0.23 against an active non-gamified app, and 0.15 at follow-up averaging 14 weeks after the end. No moderator (duration, number of game mechanics, population, device) reached significance; 72% of successful interventions used teams or leagues. Johnson et al. 2016 [12] (grade B: a systematic review of 19 mostly weak studies) found 59% positive, 41% mixed, none negative. Koivisto and Hamari 2019 [13] reviewed 819 gamification studies and concluded results "lean towards positive" but with a remarkable share of mixed findings and little theoretical coherence (grade B). Hamari's 2017 badge study [14] is a pre/post quasi-experiment on a marketplace (1,410 users then 1,579), so grade B; it is not evidence about exercise.

Implication for the bot: the guild-vs-guild ranking with a visible standings table is the right core, because "competition" and "teams or leagues" are the elements with trial support. The elements the bot lacks from the Penn recipe are a named sponsor (durable in two trials) and small teams of three to six; see section 3 on what large guilds cost.

## 2. Habit formation

**How long it takes.** Lally et al. 2010 [16, 17] (grade B: 96 volunteers, self-reported automaticity) found a median of 66 days to plateau, with a range of 18 to 254 days, and only 39 of 82 analysable participants fitting the expected curve at all. Exercise habits took longer (median 91 days, an extrapolation past the 84-day study). Singh et al. 2024 [18] pooled 20 studies (2,601 people): medians of 59 to 66 days, means of 106 to 154, individual range 4 to 335 days (grade B; the studies are observational). The "21 days" figure traces to Maxwell Maltz's 1960 self-help book and has no empirical basis [19] (grade D). Practical reading: a competition of 8 to 12 weeks sits inside the plausible formation window for some people and well short of it for exercise in most.

**Missing a day.** Lally's data showed that a single missed opportunity barely dented automaticity; recovery was quick (grade B). This is the strongest argument against daily streaks as a design primitive (section 4).

**Context cues and friction.** Wendy Wood's work [20, 21] (grade B for the diary studies behind the "43% of daily behaviour is habitual" figure; C for the book's prescriptions) holds that habits form from repetition in a stable context with low friction, and that willpower is the wrong lever. Wood and Neal 2016 cite observational evidence that distance to parks, gyms and shops predicts behaviour (grade B). A text bot cannot move a gym, but it can lower the friction of the one behaviour it owns: the log. One tap is the right size.

**Fogg's B=MAP and Tiny Habits** [22]: grade C. The model (behaviour needs motivation, ability and a prompt at the same moment) is a sensible heuristic and a 2025 scoping review found it widely used, but independent RCTs of Tiny Habits for exercise do not exist; the one RCT found was on gratitude.

**Implementation intentions.** Gollwitzer and Sheeran 2006 [23]: d = 0.65 across 94 tests (grade A). For physical activity specifically the effect is smaller: Bélanger-Gravel et al. 2013 [24] found g = 0.31 after the intervention and 0.24 at follow-up (grade A). A single "when and where will you move this week?" prompt is cheap and does not need to be stored.

**Flexibility beats rigid routine.** Beshears, Lee, Milkman, Mislavsky and Wisdom 2021 [25, 26] (grade A: 2,508 Google employees) paid people either for gym visits inside a fixed daily two-hour window or for visits at any time. The flexible group visited more during the programme and decayed less afterwards (a 5-point drop in weekly attendance versus 10 points for the routine group). Do not prescribe a time of day; a weekly target already embodies this.

**Fresh starts.** Dai, Milkman and Riis 2014 [27] (grade B: archival gym data): visits were 33.4% more likely at the start of a week, 14.4% at a new month, 11.6% at a new year, 47.1% at a new semester and 7.5% after a birthday. The Monday post and the weekly reset already exploit this; the competition's start date should be a semester start.

**Commitment devices.** Royer, Stehr and Sydnor 2015 [28] (grade A): a four-week gym incentive alone left small lasting effects, but offering a self-funded commitment contract afterwards produced attendance gains detectable a year and more later. A guild competition is a soft commitment device; a real one needs stakes, which conflict with minimalism.

**Temptation bundling.** Milkman, Minson and Volpp 2014 [29]: gym visits up 51% initially, decaying by Thanksgiving. Kirgios et al. 2020 [30] (6,792 people): weekly workouts up 10 to 14% for up to 17 weeks, but most of the gain came from the free audiobook, not the bundling advice (grade A). Not implementable in a text bot beyond a line of advice.

**Progress principle.** Amabile and Kramer [31] analysed 12,000 diary entries from 238 knowledge workers and found daily progress in meaningful work the strongest predictor of positive inner work life (grade B for work; C when extrapolated to exercise). The progress bar in the confirmation message is the analogue.

**Goal gradient and endowed progress.** Kivetz, Urminsky and Zheng 2006 [32] (grade B): café customers bought faster as the free coffee neared, then slumped after each reward ("post-reward resetting"). Nunes and Drèze 2006 [33] (grade A, small field experiment): a 10-stamp card with two free stamps was completed by 34% of customers against 19% for an 8-stamp card needing the same effort. Both are consumer-loyalty findings, transferred to exercise by analogy only. The post-reward slump matters more than the boost: expect Monday to be the weakest day, which the reminder should not be tuned to punish.

**Self-monitoring is the strongest single technique.** Michie et al. 2009 [34] (meta-regression of 122 evaluations, 44,747 participants): interventions with self-monitoring had an effect of 0.42 against 0.26 without, and self-monitoring explained the most between-study variance (grade A, with the reviewers' caveat that quality was not assessed). Harkin et al. 2016 [35] (138 RCTs, 19,951 people): prompting progress monitoring raised goal attainment by d = 0.40, with larger effects when progress was physically recorded and when it was reported to others or made public (grade A). The daily one-tap log is therefore not decoration; it is the most evidence-backed thing the bot does.

## 3. Social mechanisms

**Descriptive norms.** Cialdini's hotel-towel study [36] (grade A) raised reuse from 35.1% (standard appeal) to 44.1% with "most guests reuse" and 49.3% with "most guests in this room". Bohner and Schlüter's German replication [37] (n = 724 and 204) found no advantage for descriptive norms at all, and the provincial norm did worse. Schultz et al. 2007 [38] (grade A) showed the boomerang: households told the neighbourhood average moved toward it from both sides, so low performers improved and high performers got worse, unless an injunctive signal (a smiley) was added. For physical activity the direct evidence is weak: Priebe and Spink 2011 [39] found an effect for mild activity in one sample and none in students; a 1,200-person online experiment [40] moved intention slightly, and equally for "79% are active" and "79% are inactive", which the authors attribute to priming rather than norms (grade B). Design rule: state a norm only when it is true and high, and never publish that most of a guild logged nothing.

**Public commitment and accountability.** Nyer and Dellande 2010 [41] (grade B): weight-loss goals pinned on a gym noticeboard were met more often than private goals, mostly among people high in susceptibility to normative influence. Harkin's moderator (public reporting strengthens monitoring) is the higher-grade support (A). The Penn "sponsor" arm is the trial version: one named person who sees your weekly result was durable in STEP UP and part of the BE ACTIVE recipe.

**Team versus individual competition.** Zhang, Brackbill, Yang and Centola 2016 [15] (grade A: 790 students in groups of six): competitive groups attended 90% more exercise classes than groups without comparison, team competition (your team ranked against five others) did as well as individual competition, and a support-only network did worse than control. STEP UP's competition arm beat its collaboration arm on both effect and durability. Patel's team trial shows the failure mode of collaboration: a reward that depends on every teammate produced nothing, while one that mixed personal and team credit did best. The bot's guild-vs-guild ranking is the Zhang "combined" condition, which is the best-supported form.

**Small groups.** Every positive trial used groups of three to six. Karau and Williams' meta-analysis of social loafing [42] (78 studies, mean effect about d = 0.44, grade A) shows effort in collective tasks falls as groups grow and recovers when individual contributions are identifiable and evaluated. A guild of hundreds ranked by a per-member average is close to the worst case: one person's hour moves the guild's number by a rounding error and nobody sees who moved. The bot's within-guild "neighbours" view is the identifiability lever that keeps the average from dissolving into anonymity; if anything is added, it should be more identifiability at small scale, not another aggregate.

**Does public per-person data motivate or shame?** Patel's social-comparison trial [10] (grade A) is the cleanest test: weekly feedback comparing your team with the 75th percentile, with no incentive, produced the lowest activity of any arm, and comparison to the median without money did nothing. Zuckerman and Gal-Oz 2014 [43] (grade B) found social comparison and virtual rewards added nothing over continuous measurement alone. Jia et al. 2017 [44] (grade B, survey experiment) found rank position drives how the whole app is perceived. The folklore that leaderboards "motivate the top 5% and demotivate the rest" [D] has no measured basis but points the right way: exposure of a named person near the bottom of a list is the one social feature with evidence of harm, and the bot's rule of guild-level rankings plus at most three neighbours is the defensible middle.

## 4. Streaks and reminders

**Streaks.** No RCT tests streak counters for physical activity. Silverman and Barasch 2023 [45] (grade A, seven experiments, mostly online) found that showing a broken streak in a log reduces subsequent engagement even when actual behaviour is held constant; the effect shrinks when the break can be repaired and when it is attributed to outside causes. A 2025 interview study of 17 runners who ended streaks of 100+ days [46] found grief-like reactions and running through injury with "streak saver" one-milers, though all resumed running (grade C). Duolingo's retention lead reports over 600 streak experiments, that retention jumps most between day one and day seven, that two free streak freezes for a new streak was among their biggest wins and a third added nothing, and warns that too much forgiveness makes the streak "mean nothing" [47] (grade D: company self-report). The blog statistics circulating about streak apps (a "2023 npj Digital Medicine" cohort of 1,247, a "2020 CHI" 63% quit figure) [63] could not be traced to any paper and should be treated as fabricated. Lally's finding that one missed day does not damage habit formation is the counterweight to all of this (grade B). Verdict: a daily streak counter is a short-term engagement device with a documented cliff on breaking and no durability evidence; the weekly target is the safer unit, and a "weeks on target" count, if any, should never display a reset.

**Forgiveness.** Milkman et al.'s 2021 megastudy [48] (grade A: 61,293 gym members, 54 four-week programmes) found the single best intervention was a small bonus for returning after a missed workout (+27% weekly visits), but only 8% of programmes had effects measurable after they ended. The bot's yesterday-backdate is the text-only version of this; extending it further (a week of grace) would loosen the data more than it would help.

**Reminder timing and frequency.** Bidargaddi et al. 2018 [49] (grade A, micro-randomised, 1,255 users): a push notification raised the chance of logging within 24 hours by 3.9% overall, by 8.7% at weekends and by 11.8% at 12:30 on weekends, with no decay over 12 weeks. Klasnja et al. 2019 [50] (grade A, HeartSteps): contextual walking suggestions raised steps 66% at first, then decayed by 2% a day to zero by day 28, consistent with habituation. Head et al. 2013 [51] (meta-analysis of 19 RCTs, d = 0.33): programmes with varying or decreasing frequency beat fixed frequency. The Random AIM trial [52] (grade A, within-person randomisation of 0 to 6 texts a day for 180 days): frequency made no difference to steps, but each irrelevant message (inspirational quotes) cut them by 82 to 104. Abroms et al.'s guidance [53] (grade C) recommends tapering, unpredictable timing for some audiences, a STOP keyword and a one-item exit question, and notes "too many messages" is the standard complaint. A reminder that asks a question the user can answer in one tap is the least burdensome design in this literature; keep it once a day at a user-chosen hour, and consider tapering to a few days a week for users who log without prompting.

**Notification fatigue and opt-out.** A 2024 scoping review of 18 studies (525,824 users) [54] found a median 70% abandon lifestyle apps within 100 days, with "annoying notifications" and data-entry burden among the reasons (grade B). No credible published opt-out rate for daily exercise reminders was found; the honest statement is that the bot's own ignore counts will be the first real data.

**Ethics and consent.** Sunstein's criteria for acceptable nudges [55] (grade C) are transparency and cheap exit. The STOP convention is the SMS industry's implementation. Treating five consecutive ignored reminders as withdrawal of consent, with an explicit "keep them" to resume, is stricter than any trial in this review, which all messaged until the end regardless of response; there is no evidence it costs effectiveness and it is the consent-respecting default.

## 5. Motivation quality

Teixeira et al. 2012 [56] reviewed 66 studies (grade A for the review, though the studies are correlational): autonomous motivation predicts exercise consistently, identified regulation ("I value this") predicts adoption, intrinsic motivation ("I enjoy this") predicts long-term adherence, and perceived competence predicts both. Deci, Koestner and Ryan 1999 [57] (128 experiments, grade A): expected tangible rewards undermine free-choice intrinsic motivation (d = -0.40 when contingent on engagement, -0.36 on completion, -0.28 on performance), while positive verbal feedback enhances it. Cerasoli et al. 2014 [58] (183 studies, 212,468 people): intrinsic motivation predicts performance at rho = .21 to .45 and matters less when incentives are tied directly to performance ("crowding out"), and incentives predict quantity while intrinsic motivation predicts quality. Reeve and Deci 1996 [59] and Vansteenkiste and Deci 2003 [60] (lab experiments, grade A): winning raises intrinsic motivation through competence, pressure to win lowers it through lost autonomy, and losers stay motivated if they are given an attainable standard and positive feedback for meeting it. The economics literature is more optimistic about temporary incentives: Charness and Gneezy 2009 [61] found paying for eight gym visits in a month produced persistent attendance among previous non-attenders and no gain (sometimes a loss) among regulars; Acland and Levy 2015 [62] measured +0.19 visits a week after the incentive and found people badly overpredict their own persistence.

Design consequences. Keep rewards symbolic and collective: a guild result, not a personal prize. Make the personal weekly target the "attainable standard with positive feedback" so members of losing guilds still get competence signals ("target hit") every week. Preserve choice: the user picks the tier and the reminder hour, and the competition never prescribes an activity or a time. Avoid pressure copy ("don't let your guild down") in favour of information ("your guild is 12 minutes per member behind"). Expect the newcomers, not the already-active, to be the ones whose habit survives the competition, and write the end-of-competition message for them.

## 6. Summary table

| Mechanism | Grade | Engagement during | Habit durability after | Text-only implementation |
|---|---|---|---|---|
| Daily self-monitoring with a recorded log | A | strong (0.42 vs 0.26; d = 0.40) | moderate; the log outlives the game | the one-tap "did you move yesterday?" answer; keep it |
| Weekly target with a fresh start each Monday | A (points), B (fresh start) | strong in every Penn trial | weak to moderate | weekly bar and Monday post; never carry a deficit into the next week |
| Guild-vs-guild ranking with visible standings | A | strongest social arm; +90% class attendance | best of the social arms (+569 steps at 12 weeks) | pinned standings; per-member average so small guilds can win |
| Small, identifiable groups (3 to 6) | A | required for the row above; loafing grows with size | unknown | the three-row neighbours block; consider sub-squads only if guilds are huge |
| Named sponsor who sees weekly results | A | +689 steps | durable (+428) | optional "ally" who receives the Monday summary; costs lines |
| Loss framing of points | A with money only | strong with money; untested alone | none | do not add; "lost points" without stakes is untested theatre |
| Self-chosen goal, started immediately | A | +1,384 steps | durable (+1,391) | let the user pick the weekly target from two or three options |
| Implementation intention prompt | A (g = 0.31 / 0.24) | moderate | moderate | one "when and where this week?" question; nothing stored |
| Flexible rather than fixed routine | A | equal | better (5 vs 10 point decay) | never suggest a time of day; weekly framing |
| Forgiveness for a missed day | A | +27% | rarely persists | the yesterday backdate; no grace beyond that |
| Daily streak counter | B / D | short-term boost, cliff on breaking | none shown | avoid; at most "weeks on target" with no visible reset |
| Daily reminder at a chosen hour | A | small (+4%, up to +12% midday weekends) | none | keep; one question, one tap; taper for reliable loggers |
| Auto-stop after ignored reminders | C | unknown; no trial did it | none | keep; it is the consent mechanism, with "keep them" to resume |
| Descriptive-norm copy | A elsewhere, B for exercise, failed replication | small | none | only when true and high; never broadcast low participation |
| Public per-person exposure | A (harm) | lowest activity in the 75th-percentile arm | none | never; guild totals and three neighbours only |
| Endowed progress and goal gradient | A / B (consumer settings) | small | none | honest progress bar; expect the Monday slump |
| Tangible prizes | A (negative) | quantity up | crowding out | none; a symbolic guild result at most |
| Competence feedback and attainable standard | A | keeps losers engaged | supports intrinsic motivation | "target hit" every week regardless of guild rank |

## Sources

1. STEP UP trial, JAMA Internal Medicine 2019: https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2749761
2. BE FIT trial, JAMA Internal Medicine 2017: https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2655242
3. Veterans gamification trial, JAMA Network Open 2021: https://pmc.ncbi.nlm.nih.gov/articles/PMC8271358/
4. iDiabetes trial, JAMA Network Open 2021: https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2780065
5. ENGAGE trial, JAMA Cardiology 2021 (corrected 2026-09-07 from "JAMA Network Open" against the PMC record): https://pmc.ncbi.nlm.nih.gov/articles/PMC8411363/
6. BE ACTIVE trial, Circulation 2024: https://pmc.ncbi.nlm.nih.gov/articles/PMC11795842/
7. Patel et al., individual vs team incentives, JGIM 2016: https://pmc.ncbi.nlm.nih.gov/articles/PMC4907949
8. Patel et al., framing financial incentives, Annals of Internal Medicine 2016: https://pubmed.ncbi.nlm.nih.gov/26881417/
9. Kullgren et al., group vs individual incentives, Annals 2013: https://pmc.ncbi.nlm.nih.gov/articles/PMC3994977/
10. Patel et al., social comparison feedback trial, 2016: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6029434/
11. Mazeas et al., gamification meta-analysis, JMIR 2022: https://www.jmir.org/2022/1/e26779
12. Johnson et al., gamification for health and wellbeing, Internet Interventions 2016: https://www.sciencedirect.com/science/article/pii/S2214782916300380
13. Koivisto and Hamari, review of gamification research, 2019: https://www.sciencedirect.com/science/article/pii/S0268401217305169
14. Hamari, badges field experiment, Computers in Human Behavior 2017: https://www.sciencedirect.com/science/article/abs/pii/S0747563215002265
15. Zhang, Brackbill, Yang and Centola, support or competition, Preventive Medicine Reports 2016: https://www.sciencedirect.com/science/article/pii/S2211335516300936
16. Lally et al., how are habits formed, EJSP 2010: https://onlinelibrary.wiley.com/doi/abs/10.1002/ejsp.674
17. Critical summary of Lally et al.: https://www.thebehavioralscientist.com/articles/how-long-to-form-a-habit
18. Singh et al., time to form a habit, Healthcare 2024: https://www.mdpi.com/2227-9032/12/23/2488
19. ScienceDaily on the 21-day myth: https://www.sciencedaily.com/releases/2025/01/250124151347.htm
20. Wood and Neal, Healthy through Habit, Behavioral Science and Policy 2016: https://journals.sagepub.com/doi/10.1177/237946151600200109
21. Wood, Good Habits, Bad Habits (book page): https://dornsife.usc.edu/wendy-wood/good-habits-bad-habits/
22. Scoping review of the Fogg Behavior Model, BMC Public Health 2025: https://link.springer.com/article/10.1186/s12889-025-24525-y
23. Gollwitzer and Sheeran, implementation intentions meta-analysis, 2006: https://www.sciencedirect.com/science/chapter/bookseries/abs/pii/S0065260106380021
24. Bélanger-Gravel et al., implementation intentions and physical activity, Health Psychology Review 2013: https://www.tandfonline.com/doi/abs/10.1080/17437199.2011.560095
25. Beshears et al., flexibility vs routinization, Management Science 2021: https://pubsonline.informs.org/doi/abs/10.1287/mnsc.2020.3706
26. HBS summary of Beshears et al.: https://www.library.hbs.edu/working-knowledge/unexpected-exercise-advice-for-the-super-busy-ditch-the-rigid-routine
27. Dai, Milkman and Riis, the fresh start effect, Management Science 2014: https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf
28. Royer, Stehr and Sydnor, incentives, commitments and habit formation, AEJ Applied 2015: https://www.aeaweb.org/articles?id=10.1257/app.20130327
29. Milkman, Minson and Volpp, temptation bundling, Management Science 2014: https://pubsonline.informs.org/doi/10.1287/mnsc.2013.1784
30. Kirgios et al., teaching temptation bundling, OBHDP 2020: https://www.sciencedirect.com/science/article/pii/S074959782030385X
31. Amabile and Kramer, The Power of Small Wins, HBR 2011: https://hbr.org/2011/05/the-power-of-small-wins
32. Kivetz, Urminsky and Zheng, goal-gradient hypothesis resurrected, JMR 2006: https://home.uchicago.edu/ourminsky/Goal-Gradient_Illusionary_Goal_Progress.pdf
33. Nunes and Drèze, the endowed progress effect, Journal of Consumer Research 2006: https://academic.oup.com/jcr/article-abstract/32/4/504/1787425
34. Michie et al. 2009 meta-regression, DARE critical summary: https://www.ncbi.nlm.nih.gov/books/NBK77075/
35. Harkin et al., monitoring goal progress meta-analysis, Psychological Bulletin 2016: https://pubmed.ncbi.nlm.nih.gov/26479070/
36. Goldstein, Cialdini and Griskevicius, hotel towel norms, JCR 2008: https://academic.oup.com/jcr/article-abstract/35/3/472/1856257
37. Bohner and Schlüter, towel replication, PLOS One 2014: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0104086
38. Schultz et al., constructive, destructive and reconstructive power of social norms, 2007: https://journals.sagepub.com/doi/10.1111/j.1467-9280.2007.01917.x
39. Priebe and Spink, descriptive norms and physical activity, 2011: https://www.sciencedirect.com/science/article/abs/pii/S1469029210001196
40. Normative messages and physical activity intention, BMC Public Health 2014: https://pmc.ncbi.nlm.nih.gov/articles/PMC4139606/
41. Nyer and Dellande, public commitment and weight loss, Psychology and Marketing 2010: https://onlinelibrary.wiley.com/doi/abs/10.1002/mar.20316
42. Karau and Williams, social loafing meta-analysis, JPSP 1993: http://www.psych.purdue.edu/~willia55/392F-'06/KarauWilliamsMetaAnalysisJPSP.pdf
43. Zuckerman and Gal-Oz, deconstructing gamification, Personal and Ubiquitous Computing 2014: https://link.springer.com/article/10.1007/s00779-014-0783-2
44. Jia et al., designing leaderboards for gamification, CHI 2017: https://www.researchgate.net/publication/316651227_Designing_Leaderboards_for_Gamification_Perceived_Differences_Based_on_User_Ranking_Application_Domain_and_Personality_Traits
45. Silverman and Barasch, on or off track: broken streaks, JCR 2023: https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414
46. The dark side of streaking, PLOS One 2025: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0317254
47. Lenny's Podcast, Duolingo streaks (company self-report): https://www.lennysnewsletter.com/p/behind-the-product-duolingo-streaks
48. Milkman et al., megastudies improve applied behavioural science, Nature 2021: https://www.nature.com/articles/s41586-021-04128-4
49. Bidargaddi et al., to prompt or not to prompt, JMIR mHealth 2018: https://pmc.ncbi.nlm.nih.gov/articles/PMC6293241/
50. Klasnja et al., HeartSteps micro-randomised trial, Annals of Behavioral Medicine 2019: https://academic.oup.com/abm/article-abstract/53/6/573/5091257
51. Head et al., text messaging interventions meta-analysis, Social Science and Medicine 2013: https://www.sciencedirect.com/science/article/abs/pii/S0277953613004474
52. Random AIM trial secondary analysis, message relevance and frequency: https://pmc.ncbi.nlm.nih.gov/articles/PMC11113026/
53. Abroms et al., developing a text messaging programme, JMIR mHealth 2015: https://mhealth.jmir.org/2015/4/e107/
54. Scoping review of lifestyle app abandonment, JMIR 2024: https://www.jmir.org/2024/1/e56897
55. Sunstein, The Ethics of Nudging, Yale Journal on Regulation 2015: https://www.yalejreg.com/print/the-ethics-of-nudging/
56. Teixeira et al., exercise and self-determination theory, IJBNPA 2012: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3441783/
57. Deci, Koestner and Ryan, rewards and intrinsic motivation meta-analysis, 1999: https://home.ubalt.edu/tmitch/642/articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf
58. Cerasoli, Nicklin and Ford, intrinsic motivation and extrinsic incentives, Psychological Bulletin 2014: https://selfdeterminationtheory.org/wp-content/uploads/2017/06/2014_Cerasoli_Intrinsic.pdf
59. Reeve and Deci, elements of the competitive situation, PSPB 1996: https://journals.sagepub.com/doi/10.1177/0146167296221003
60. Vansteenkiste and Deci, can losers remain motivated, Motivation and Emotion 2003: https://selfdeterminationtheory.org/wp-content/uploads/2014/04/2003_VansteenkisteDeci_MOEM.pdf
61. Charness and Gneezy, incentives to exercise, Econometrica 2009: https://rady.ucsd.edu/_files/faculty-research/uri-gneezy/incentives-exercise.pdf
62. Acland and Levy, naivete, projection bias and habit formation, Management Science 2015: https://gspp.berkeley.edu/assets/uploads/research/pdf/Acland,_Levy_(2015)_Naivete,_projection_bias,_and_habit_formation_in_gym_attendance.pdf
63. Blog carrying untraceable streak statistics (cited only to flag it): https://lifetips.alibaba.com/tech-efficiency/habit-tracker-vs-streak-app-which-sustains-consistency
