# Team scoring rules for a large-guild activity competition: evidence briefing

Date: 2026-09-08. Question under review: replace the guild score "minutes per member" with
"active days per member" (one point per person per day logged as anything but rest, at most 7 a
week, shown per 100 members, minutes per member as tiebreaker).

Grades: A = meta-analysis or replicated RCT; B = single RCT or controlled experiment; C =
observational, secondary or archival analysis; D = self-report or anecdote. Where I could not
confirm a figure from the primary record, the text says so.

## 1. Summary

1. Group motivation gains for weaker members (the Köhler effect) are real (g = .60 over 17 studies) but require three things a 500-member guild cannot provide under any scoring rule: knowing you are the weaker member, a contribution the group cannot do without, and feedback on it.
2. Across 622 effect sizes, teamwork raises effort when one's contribution is indispensable and lowers it when dispensable; a mean or a sum over hundreds of people is the dispensable case, and changing the unit from minutes to days does not change that.
3. The randomised trials that made competition work (Patel's STEP UP and BE FIT, Zhang 2016) scored bounded units, goal-days or class visits, in teams of 3 to 6; the volume-scored programmes (step sums) are observational and weaker evidence.
4. A pure weakest-member (conjunctive) rule failed in the one field RCT that tried it in 4-person teams (Patel 2016), so the proposal is right not to go there.
5. No trial compares days scoring with volume scoring head to head; the case for days rests on mechanism and on which currency the successful trials used.
6. Self-reported activity is inflated relative to devices and inflation is bigger when activity is the thing being judged; a bounded, binary unit limits both the size and the value of a lie.
7. Group size evidence: every effective team trial used 2 to 11 people; in a pure competition the winner's effort rises with the field while the last-placed person's falls.
8. Verdict: adopt days scoring with tweaks. Keep the 15-minute threshold, keep the 7-day cap, rank per member but display the gap in raw days, add a specific weekly guild target, and frame the personal target as a contribution to the guild.
9. The scoring change cannot substitute for small-group structure; that is the missing ingredient and belongs in a separate feature decision.

## 2. Findings by question

### Q1. Köhler gains, task structure, social loafing, and the exercise experiments

**What the Köhler effect needs.** Weber and Hertel's meta-analysis (17 studies, N = 2,240) puts the motivation gain of inferior group members at g = .60, moderated by task structure, performance information, physical presence, gender and task type [A] (Weber and Hertel 2007). Hertel, Kerr and Messé found the gain under conjunctive demands (group score = weakest member) but not additive ones (group score = sum) [B] (Hertel et al. 2000). Kerr et al. 2007 showed both mechanisms operate, social comparison more for men and indispensability more for women [B]. Kerr et al. 2005 found the gain survives delayed feedback but disappears when neither partner can tell who quit first or how long either persisted [B]. Kerr and Hertel's review puts the optimum at a moderate ability gap; search summaries of its body say social comparison should weaken in larger groups while indispensability could grow, but I read only its abstract, and I could not verify a g = 0.72 figure quoted on a repository page (the primary abstract says .60).

**The largest synthesis.** Torka, Mazei and Hüffmeier (622 effect sizes, N = 320,632) found no main effect of teamwork on effort. Indispensable contribution: gains (intercept 0.59, k = 197); dispensable: losses (0.35, k = 357); moderate: neither (0.08, ns, k = 26). Social comparison possible: gains (0.33, k = 299); not possible: losses (0.40, k = 256). Self-reports registered gains but not losses [A] (Torka et al. 2021).

**Loafing and free riding.** Karau and Williams' meta-analysis of 78 studies found social loafing moderate and general, reduced by evaluation potential (identifiability), task meaningfulness and low expected co-worker effort, and increased by group size [A]. The only copy I reached is a scan, so the exact coefficients (the mean effect is usually quoted as about d = 0.44) are unconfirmed here. Kerr and Bruun's free-rider experiments (groups of 2, 4 and 8): under additive demands ability did not shape effort, under conjunctive demands the weak member worked harder, and effort fell as interdependent groups grew even though every member stayed identifiable [B] (Kerr and Bruun 1983).

**Exercise experiments (all dyads with a superior partner).** Irwin et al.: 58 women cycling on six days; conjunctive partner 21.89 min (SD 10.08) versus coactive 19.77 (SD 9.00) versus alone 10.6 (SD 5.84), p < .05 [B] (Irwin et al. 2012). Feltz, Kerr and Irwin (plank exergame): every partnered condition beat solo, and conjunctive was no better than additive or coactive [B] (Feltz et al. 2011). Feltz, Irwin and Kerr: moderate discrepancy (51.36 s) beat low (22.52 s) and high (26.89 s), an inverted U [B] (Feltz et al. 2012). A software partner works, a believed-human one better [B] (Feltz et al. 2014). Encouragement from the stronger partner cut persistence by 31.14 s [B] (Irwin et al. 2013). An extrinsic incentive shrank the gain from 43% to 26% [B] (Kerr et al. 2013). Over 12 sessions a fatiguing partner helped men (d = 1.09) but not women [B] (Max et al. 2016); middle-aged adults gained d = .62 to .76 on persistence [B] (Samendinger et al. 2017) but showed no gain on cycling intensity [B, null] (Samendinger et al. 2019). The exercise meta-analysis (19 studies, N = 1,912) reports a significant overall gain in conjunctive dyads; I did not retrieve its point estimate [A, partial] (Samendinger et al. 2023). In real relays (additive scoring) the inferior member gained most and superior members tended to slow, not significantly [C] (Osborn et al. 2012); in Beijing 2008 the last swimmer gained most [C] (Hüffmeier and Hertel 2011).

**What this says about scoring rules.** Every demonstrated gain is in dyads or small groups where the weak member knows their status, sees the partner, and holds the team's fate. A sum, a mean, or a days count over 350 to 700 people is additive and dispensable for every member, which Torka's model places in the loss region. A days rule changes the *weight* of a newcomer's contribution (1 of 7 instead of 22 of 525 minutes) but not its *dispensability* (1 of roughly 2,000 possible guild-days a week). Identifiability is what curbs loafing, and in this bot it exists only in `/me`'s neighbours block, which the proposal leaves unchanged.

### Q2. Group goals

Kleingeld, van Mierlo and Arends (k = 49): specific difficult group goals beat nonspecific ones, d = 0.80 (k = 23); all group goals d = 0.56; task interdependence, complexity and participation did not moderate. "Egocentric" individual goals (maximise my own performance) hurt group performance, d = -1.75 (k = 6); "groupcentric" individual goals (maximise my contribution to the group) helped, d = 1.20 (k = 4) [A] (Kleingeld et al. 2011). Locke and Latham's review is the base for specific difficult goals generally [A-level review] (Locke and Latham 2002).

Application: today the guild has no goal, only a rank. A weekly guild target ("beat last week's 412 active days") is the cheapest change with A-grade support. The personal minute target is egocentric relative to a days-scored guild; it should be framed as a contribution ("that day counts for the guild") rather than replaced.

### Q3. How the field trials scored teams

| Study | Design, n | Team size | Scoring rule (exact) | Outcome measured | Result | Grade |
|---|---|---|---|---|---|---|
| STEP UP, Patel et al. 2019 | RCT, 602 | 3 | 70 points on Monday, minus 10 per day the personal goal (+33/40/50% over baseline) is missed. Collaboration: one member drawn daily, team keeps points if that member hit goal. Competition: weekly leaderboard of the 3 on cumulative points. Support: sponsor gets weekly report. | Device steps | Competition +920 (95% CI 513 to 1328), support +689 (267 to 977), collaboration +637 (258 to 1017); only competition held in follow-up, +569 (142 to 996) | B |
| BE FIT, Patel et al. 2017 | RCT, 200 in 94 families | family | Same points; member drawn daily represents family | Participant-days at goal; steps | 0.53 vs 0.32 (diff 0.27, CI 0.20 to 0.33); steps +953 (505 to 1401) | B |
| Patel et al. 2016 | RCT, 304 | 4 | Lottery; individual: $50 if I hit 7,000; team: $50 only if all four did; combined: $20 + $10 per teammate | Days at 7,000 | Combined 0.35 vs 0.18 (CI 0.07 to 0.28); team-only 0.17, null; individual 0.25, ns | B |
| Zhang et al. 2016 | RCT, 790 students | 6 | Reward on my total classes (individual) or the team's average classes per member; competitive arms saw rankings | Class attendance | Comparison arms 90% higher (1.9 vs 1.0 per week); team vs individual incentive no difference | B |
| Zhang et al. 2015 | RCT, 217 | 4 to 6 peers | Anonymous peers' progress visible, no team score | Enrolments; self-reported days | 6.3 vs 4.5 enrolments; +1.6 vs +0.8 days/week | B |
| Wang et al. 2023 | Micro-randomised, 1,779 interns | 5 or more | Weekly team average steps vs a random opponent team | Device steps | +105.8 steps/day (CI 35.6 to 176.0), fading 14.5 per week | B |
| Pearson et al. 2020 | Matched cohort, 61,170 | 2 | Pair earns $0.40 when its combined goal-days reach 10 in a week | Phone steps | +537 steps/day | C |
| Leahey et al. 2012 (SURI) | Cohort, 3,330 in 987 teams | 5 to 11 | Divisions: weight loss, activity minutes, pedometer steps; ranking rule not stated; self-entered | Weight, self-reported activity | Weight loss clustered in teams, ICC 0.10 | C |
| Walk Kansas, Estabrooks et al. 2008 | Pre-post | 6 | Members log minutes, 15 min = 1 mile, team sum toward 423 miles in 8 weeks | Self-reported minutes | Inactive and insufficiently active raised moderate and vigorous PA (p < .001), held at 6 months | C |
| Walk Across Texas, Faries et al. 2019 | Pre-post, 11,116 | team | Team sum of self-reported miles, minimum 832 | Self-reported miles, days | +4.89 miles/week; inactive +5.48 | C |
| GCC, Stone et al. 2023 | Cohort, 716 | 7 | Team steps combined on a world map; self-entered pedometer steps | Psychological distress | K10 fell 0.5 at 4 months, 0.7 at 12 | C |
| Scottish Step Count Challenge, Niven et al. 2021 | Pre-post, 10,183 | 5 | Collective team steps on a national leaderboard; self-entered | Self-entered steps | +906 steps/day by week 8; values over 30,000 truncated | C |
| Stepathlon, Ganesan et al. 2016 | Pre-post, 69,219 | worksite teams | Team race on pedometer steps (rule not in abstract) | Self-reported steps, days | +3,519 steps/day; +0.89 exercise days | C |
| Safi et al. 2024 | Pre-post, 49 | 3 or more | 1 point per day the team hits 10,000, 3 for a weekly match win | Accelerometer | +4,799 steps/day | C |
| Chen and Pu 2014 | Field experiment, 18 dyads | 2 | Cooperation, competition, hybrid | Phone steps | +21%, +8%, +18% respectively | C |
| Shameli et al. 2017 | Archival, ~2,500 competitions | 3 or more | Most steps over the period wins | App steps | Average +23%; winner +25%, last place -4% | C |

"Walking for Wellbeing in the West" is an individual pedometer trial with no team scoring, so I did not analyse it.

Reading the table: the randomised designs with durable or large effects scored a bounded daily unit (a goal-day, a class visit) in groups of 3 to 6 with every member's daily result visible. The step-sum programmes report large pre-post gains but are uncontrolled, self-entered, and select for the already active (Niven's week-1 counts were above 10,000). Zhang's null difference between team-average and individual incentives, next to her large effect of visible comparison, is the closest thing to a scoring-rule comparison: the rule mattered less than the visibility.

### Q4. Days versus volume; very large groups

No study compares "active days" with "minutes" or "steps" as a team currency under otherwise identical conditions. The indirect evidence: (a) goal-days is the currency of the best-designed trials [B]; (b) bounded units cap one member's dominance, which matters because in unbounded contests the winner rises 25% while the last-placed person drops 4%, and each extra competitor adds about 420 steps to the winner's daily effort and nothing to the tail [C] (Shameli et al. 2017); (c) STEP UP's collaboration rule, a probabilistic conjunctive rule on days, was the weakest of its three arms and faded in follow-up, and Patel 2016's strict conjunctive rule was null [B]. Group size: the loafing meta-analysis lists size as a moderator [A]; effort fell from 2 to 8 members even with full identifiability [B] (Kerr and Bruun 1983); the largest effective units in the table are 11 (SURI) and "5 or more" (Wang, the smallest effect). Nothing here tests scoring in groups of hundreds; the guild rank is best read as a rivalry frame, not as a motivator of individual effort.

### Q5. Gaming and honesty

Self-report agrees only weakly with direct measurement: Prince et al.'s systematic review (187 articles) found low-to-moderate correlations, with self-report running both above and below device measures depending on the instrument [A] (Prince et al. 2008). Social desirability pushes self-reported activity upward [C] (Adams et al. 2005), and Torka's meta-analysis found self-reports register effort gains but not losses [A]. Programmes that self-enter steps screen and truncate implausible values [C] (Niven et al. 2021). Mazar, Amir and Ariely's self-concept model predicts many small lies rather than large ones when a rule permits it [C, laboratory]. For this bot: under minutes, one person can add 525 credited minutes a week by tapping the top tier, and a duration lie is cheap and invisible; under days the maximum contribution per person is 7 and the only lie available is "I did 15 minutes", which is bounded, small, and the kind Mazar's model says people tell anyway. The days rule does not remove inflation; it caps its payoff. Neither rule verifies anything, and the SPEC's no-seed rule (NFR-4) is the actual honesty guarantee.

## 3. Scoring rules compared

| Rule | Least active member's effort | Most active member's effort | Loafing and free-riding | Gaming risk | Readability | Evidence |
|---|---|---|---|---|---|---|
| Team sum of minutes | Dispensable; nothing pulls them in (Torka losses at dispensability, A) | Rewarded without limit; carries the team (Shameli winner dynamics, C) | High; grows with size (Karau and Williams, A; Kerr and Bruun, B) | Highest: unbounded, duration unverifiable (Prince, A) | Poor across unequal rosters | A for mechanism, C for programmes that used it |
| Mean minutes per member (current) | Same as sum; denominator makes each person 1/500 | Same as sum | High | High | "Minutes per member" is abstract; per-member division hides who moved it | Same as sum |
| Active days per member (proposal) | Weight rises about 20-fold versus minutes; still dispensable; a groupcentric goal ("my day counts") becomes natural (Kleingeld, A) | Capped at 7; status must come from personal tiers and streak, not the guild score | Unchanged by rule; only identifiability changes it | Low: bounded at 1/day; residual "was it 15 min" rounding | Good: "412 active days this week" is concrete | B for currency (STEP UP, BE FIT, Zhang); no direct test |
| Participation rate (share logging) | Same as days but at 1/week granularity | Capped at 1 | Same | Low | Reads as a descriptive norm; at low base rates it broadcasts inactivity (SPEC §8 bars it) | C, and contraindicated by the norm evidence in docs/evidence.md |
| Conjunctive / weakest member | Strong in dyads with feedback (Weber and Hertel, A); null in 4-person field teams (Patel 2016, B) | Suppressed; demoralised when the team fails regardless | Low in dyads; unknown at scale | Low | Unusable at 500: the weakest member is always at zero | A for dyads, B against at team scale |
| Hybrid (days for rank, minutes tiebreak; personal minute tiers) | As days | As days plus personal tiers | As days | As days | Two numbers to explain | Inherits the above |

## 4. Verdict

In line with the evidence, with these tweaks.

1. **Adopt days per member as the ranking unit.** The mechanism argument holds (bounded contribution, no single carrier, lower gaming payoff) and the randomised trials that worked used goal-days or visits. Do not claim it will make newcomers "worth as much as athletes" in the motivational sense; Köhler gains do not appear at this group size, and no trial has shown days beating minutes.
2. **Keep the active-day threshold at the existing 15-minute tier.** Raising it shrinks exactly the marginal newcomer the change is for, and STEP UP's unit was a personal goal, not a fixed duration. Do not count rest.
3. **Keep the 7-a-week cap** (implicit in one tap a day) and do not add bonuses for consecutive days at guild level; the streak stays personal.
4. **Rank per member, but display the gap in raw days**, not per 100 members. "Guild X is 14 active days behind Guild Y" is actionable ("two people logging every day closes it"), whereas "31 active days per 100 members" is a low descriptive norm broadcast weekly, the pattern docs/evidence.md §5.2 and SPEC.md §8 already reject for shares. Show the guild's weekly total and the gap; keep the per-member normalisation inside the ranking.
5. **Add a specific weekly guild target** to the Monday post, e.g. beat last week's total. Kleingeld's d = 0.80 is the strongest single effect in this briefing and the change is one line. This is the best fit for the ceiling discussion in CLAUDE.md.
6. **Frame the personal target as a contribution.** Keep the WHO minute tiers for `/me`, but the confirmation should say the day counted for the guild. Egocentric individual goals in interdependent groups carried d = -1.75.
7. **Minutes per member as tiebreaker is fine**; it will rarely decide anything and keeps the athletes' volume visible somewhere.
8. **Do not add a conjunctive or weakest-member element.** The one field RCT with an all-must-succeed team rule was null in 4-person teams.
9. **Small-group structure is the missing ingredient and the scoring change does not supply it.** Every effective design in Q3 had 2 to 11 people who could see each other's daily result. If the size ceiling is ever raised, the cheapest evidence-backed form is Pearson's pair rule (a pair's combined goal-days, capped at 14 a week), not a leaderboard. Until then the Monday post's local race is the nearest substitute.

Not verified: the point estimate of Samendinger et al. 2023, Karau and Williams' moderator coefficients, SURI's ranking rule, Stepathlon's team formula. Nothing in the verdict depends on them.

## 5. References

- Adams SA, Matthews CE, Ebbeling CB, et al. (2005). The effect of social desirability and social approval on self-reports of physical activity. American Journal of Epidemiology 161(4):389-398. doi:10.1093/aje/kwi054
- Chen Y, Pu P (2014). HealthyTogether: exploring social incentives for mobile fitness applications. Chinese CHI 2014, 25-34. doi:10.1145/2592235.2592240
- Estabrooks PA, Bradshaw M, Dzewaltowski DA, Smith-Ray RL (2008). Determining the impact of Walk Kansas: applying a team-building approach to community physical activity promotion. Annals of Behavioral Medicine 36(1):1-12. doi:10.1007/s12160-008-9040-0
- Faries MD, Lopez ML, Faries E, Keenan K, Green SD (2019). Evaluation of Walk Across Texas!, a web-based community physical activity program. BMC Public Health 19. doi:10.1186/s12889-019-7918-3
- Feltz DL, Kerr NL, Irwin BC (2011). Buddy up: the Köhler effect applied to health games. Journal of Sport and Exercise Psychology 33(4):506-526. doi:10.1123/jsep.33.4.506
- Feltz DL, Irwin B, Kerr N (2012). Two-player partnered exergame for obesity prevention: using discrepancy in players' abilities as a strategy to motivate physical activity. Journal of Diabetes Science and Technology 6(4):820-827. doi:10.1177/193229681200600413
- Feltz DL, Forlenza ST, Winn B, Kerr NL (2014). Cyber buddy is better than no buddy: a test of the Köhler motivation effect in exergames. Games for Health Journal 3(2):98-105. doi:10.1089/g4h.2013.0088
- Ganesan AN, Louise J, Horsfall M, et al. (2016). International mobile-health intervention on physical activity, sitting, and weight: the Stepathlon Cardiovascular Health Study. Journal of the American College of Cardiology 67(21):2453-2463. doi:10.1016/j.jacc.2016.03.472
- Hertel G, Kerr NL, Messé LA (2000). Motivation gains in performance groups: paradigmatic and theoretical developments on the Köhler effect. Journal of Personality and Social Psychology 79(4):580-601. PMID 11045740
- Hüffmeier J, Hertel G (2011). When the whole is more than the sum of its parts: group motivation gains in the wild. Journal of Experimental Social Psychology 47:455-459. doi:10.1016/j.jesp.2010.12.004
- Irwin BC, Scorniaenchi J, Kerr NL, Eisenmann JC, Feltz DL (2012). Aerobic exercise is promoted when individual performance affects the group: a test of the Köhler motivation gain effect. Annals of Behavioral Medicine 44(2):151-159. doi:10.1007/s12160-012-9367-4
- Irwin BC, Feltz DL, Kerr NL (2013). Silence is golden: effect of encouragement in motivating the weak link in an online exercise video game. Journal of Medical Internet Research 15(6):e104. doi:10.2196/jmir.2551
- Karau SJ, Williams KD (1993). Social loafing: a meta-analytic review and theoretical integration. Journal of Personality and Social Psychology 65(4):681-706. doi:10.1037/0022-3514.65.4.681
- Kerr NL, Bruun SE (1983). Dispensability of member effort and group motivation losses: free-rider effects. Journal of Personality and Social Psychology 44(1):78-94. doi:10.1037/0022-3514.44.1.78
- Kerr NL, Messé LA, Park ES, Sambolec EJ (2005). Identifiability, performance feedback and the Köhler effect. Group Processes and Intergroup Relations 8(4):375-390. doi:10.1177/1368430205056466
- Kerr NL, Messé LA, Seok DH, et al. (2007). Psychological mechanisms underlying the Köhler motivation gain. Personality and Social Psychology Bulletin 33(6):828-841. doi:10.1177/0146167207301020
- Kerr NL, Hertel G (2011). The Köhler group motivation gain: how to motivate the "weak links" in a group. Social and Personality Psychology Compass 5(1):43-55. doi:10.1111/j.1751-9004.2010.00333.x
- Kerr NL, Feltz DL, Irwin BC (2013). To pay or not to pay? Do extrinsic incentives alter the Köhler group motivation gain? Group Processes and Intergroup Relations 16(2):257-268. doi:10.1177/1368430212453632
- Kleingeld A, van Mierlo H, Arends L (2011). The effect of goal setting on group performance: a meta-analysis. Journal of Applied Psychology 96(6):1289-1304. doi:10.1037/a0024315
- Leahey TM, Kumar R, Weinberg BM, Wing RR (2012). Teammates and social influence affect weight loss outcomes in a team-based weight loss competition. Obesity 20(7):1413-1418. doi:10.1038/oby.2012.18
- Locke EA, Latham GP (2002). Building a practically useful theory of goal setting and task motivation: a 35-year odyssey. American Psychologist 57(9):705-717. doi:10.1037/0003-066X.57.9.705
- Max EJ, Samendinger S, Winn B, Kerr NL, Pfeiffer KA, Feltz DL (2016). Enhancing aerobic exercise with a novel virtual exercise buddy based on the Köhler effect. Games for Health Journal 5(4):252-257. doi:10.1089/g4h.2016.0018
- Mazar N, Amir O, Ariely D (2008). The dishonesty of honest people: a theory of self-concept maintenance. Journal of Marketing Research 45(6):633-644. doi:10.1509/jmkr.45.6.633
- Niven A, Ryde GC, Wilkinson G, Greenwood C, Gorely T (2021). The effectiveness of an annual nationally delivered workplace step count challenge on changing step counts: findings from four years of delivery. International Journal of Environmental Research and Public Health 18(10):5140. doi:10.3390/ijerph18105140
- Osborn KA, Irwin BC, Skogsberg NJ, Feltz DL (2012). The Köhler effect: motivation gains and losses in real sports groups. Sport, Exercise, and Performance Psychology 1(4):242-253. doi:10.1037/a0026887
- Patel MS, Asch DA, Rosin R, et al. (2016). Individual versus team-based financial incentives to increase physical activity: a randomized, controlled trial. Journal of General Internal Medicine 31(7):746-754. doi:10.1007/s11606-016-3627-0
- Patel MS, Benjamin EJ, Volpp KG, et al. (2017). Effect of a game-based intervention designed to enhance social incentives to increase physical activity among families: the BE FIT randomized clinical trial. JAMA Internal Medicine 177(11):1586-1593. doi:10.1001/jamainternmed.2017.3458
- Patel MS, Small DS, Harrison JD, et al. (2019). Effectiveness of behaviorally designed gamification interventions with social incentives for increasing physical activity among overweight and obese adults across the United States: the STEP UP randomized clinical trial. JAMA Internal Medicine 179(12):1624-1632. doi:10.1001/jamainternmed.2019.3505
- Pearson E, Prapavessis H, Higgins C, et al. (2020). Adding team-based financial incentives to the Carrot Rewards physical activity app increases daily step count on a population scale: a 24-week matched case control study. International Journal of Behavioral Nutrition and Physical Activity 17:139. doi:10.1186/s12966-020-01043-1
- Prince SA, Adamo KB, Hamel ME, et al. (2008). A comparison of direct versus self-report measures for assessing physical activity in adults: a systematic review. International Journal of Behavioral Nutrition and Physical Activity 5:56. doi:10.1186/1479-5868-5-56
- Safi A, Deb S, Kelly A, Cole M (2024). Incentivised physical activity intervention promoting daily steps among university employees in the workplace through a team-based competition. Frontiers in Public Health 11:1121936. doi:10.3389/fpubh.2023.1121936
- Samendinger S, Forlenza ST, Winn B, et al. (2017). Introductory dialogue and the Köhler effect in software-generated workout partners. Psychology of Sport and Exercise 32:131-137. doi:10.1016/j.psychsport.2017.07.001
- Samendinger S, Hill CR, Kerr NL, et al. (2019). Group dynamics motivation to increase exercise intensity with a virtual partner. Journal of Sport and Health Science 8(3):289-297. doi:10.1016/j.jshs.2018.08.003
- Samendinger S, Hill CR, Ahn S, Feltz DL (2023). The Köhler motivation gain effect with exercise tasks: a meta-analysis. Kinesiology Review 12(3):187-200. doi:10.1123/kr.2022-0047
- Shameli A, Althoff T, Saberi A, Leskovec J (2017). How gamification affects physical activity: large-scale analysis of walking challenges in a mobile application. WWW '17 Companion, 455-463. doi:10.1145/3041021.3054172
- Stone J, Barker SF, Gasevic D, Freak-Poli R (2023). Participation in the Global Corporate Challenge, a four-month workplace pedometer program, reduces psychological distress. International Journal of Environmental Research and Public Health 20(5):4514. doi:10.3390/ijerph20054514
- Torka AK, Mazei J, Hüffmeier J (2021). Together, everyone achieves more, or less? An interdisciplinary meta-analysis on effort gains and losses in teams. Psychological Bulletin 147(5):504-534. doi:10.1037/bul0000251
- Wang J, Fang Y, Frank E, et al. (2023). Effectiveness of gamified team competition as mHealth intervention for medical interns: a cluster micro-randomized trial. npj Digital Medicine 6:4. doi:10.1038/s41746-022-00746-y
- Weber B, Hertel G (2007). Motivation gains of inferior group members: a meta-analytical review. Journal of Personality and Social Psychology 93(6):973-993. doi:10.1037/0022-3514.93.6.973
- Zhang J, Brackbill D, Yang S, Centola D (2015). Efficacy and causal mechanism of an online social media intervention to increase physical activity: results of a randomized controlled trial. Preventive Medicine Reports 2:651-657. doi:10.1016/j.pmedr.2015.08.005
- Zhang J, Brackbill D, Yang S, Becker J, Herbert N, Centola D (2016). Support or competition? How online social networks increase physical activity: a randomized controlled trial. Preventive Medicine Reports 4:453-458. doi:10.1016/j.pmedr.2016.08.008
