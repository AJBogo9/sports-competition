# Evidence base

Primary sources for the design decisions in [the specification](../SPEC.md).

Each entry gives the full citation, what the study actually did, the numbers as reported, what we
changed because of it, and how far it transfers to our context. Section 3 lists claims that did
**not** survive checking, including two I made earlier in this project.

Compiled 2026-07-30. Every citation below was verified against the publisher or PubMed record;
where the primary text was retrieved, quoted figures are taken from it directly.

---

## 1. Load-bearing sources

### 1.1 Competition beats encouragement, and encouragement can do harm

> Zhang J, Brackbill D, Yang S, Becker J, Herbert N, Centola D. **Support or competition? How online
> social networks increase physical activity: A randomized controlled trial.** *Preventive Medicine
> Reports*, 2016;4:453-458.
> DOI [10.1016/j.pmedr.2016.08.008](https://doi.org/10.1016/j.pmedr.2016.08.008) ·
> [open access PDF](https://ndg.asc.upenn.edu/wp-content/uploads/2016/10/Support-or-Competition-pdf.pdf) ·
> trial registration NCT02267369

**Design.** Four-arm randomised controlled trial, 2014, at a US university. n = 790 graduate and
professional students, mean age 25.2. An 11-week programme ("SHAPE-UP") offering 90 exercise
classes, about eight per week. Arms: *social comparison* (six-person competitive networks,
individual incentives), *social support* (six-person teams, team incentives, plus a chat tool),
*combined* (teams that could compare against five other teams), and *control* (individual
incentives, no social features). Gift cards for the top 10% of individuals, or top 5% of teams in
the combined arm.

**Results, verbatim from the abstract.**

> "The mean attendance numbers per week were 35.7, 38.5, 20.3, and 16.8 in the social comparison,
> the combined, the control, and the social support conditions."

> "Attendance numbers were 90% higher in the social comparison and the combined conditions
> (mean = 1.9, SE = 0.2) in contrast to the two conditions without comparison (mean = 1.0,
> SE = 0.2) (p = 0.003)."

> "Social comparison was more effective for increasing physical activity than social support and
> its effects did not depend on individual or team incentives."

**The striking part:** social support (16.8) performed *worse than the control arm* (20.3). Adding
a supportive team and a chat tool made people exercise less than giving them nothing.

**What we changed.** Guild-versus-guild framing kept. Every "encourage your guildmates" or
"cheer each other on" feature rejected. And because comparison worked equally well with individual
or team incentives, the guild structure is justified by identity and by giving us a group chat to
post into, **not** by an assumed team-motivation effect. Do not build team mechanics.

**Transfer to our context.** Close: university students, a similar age, a term-length programme,
social comparison delivered online. Differences to acknowledge if challenged: it used organised
classes with verified attendance rather than self-report, it offered gift-card incentives in every
arm, and it was US rather than Finnish.

---

### 1.2 New weeks restart motivation, and it is strongest in students

> Dai H, Milkman KL, Riis J. **The Fresh Start Effect: Temporal Landmarks Motivate Aspirational
> Behavior.** *Management Science*, 2014;60(10):2563-2582.
> DOI [10.1287/mnsc.2014.1901](https://doi.org/10.1287/mnsc.2014.1901) ·
> [author PDF](https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf)

**Design.** Three archival field studies covering Google search behaviour, university gym
attendance, and commitments made on a goal-pursuit platform.

**Result.** Aspirational behaviour rises after temporal landmarks. Directly relevant: **among
university students, the likelihood of attending the gym increases at the start of a new week,
month and semester, and after term breaks.** The mechanism proposed is that landmarks relegate past
failure to a previous mental accounting period.

**What we changed.** The competition scores the week as well as the season, resetting every Monday,
and the guild-chat post lands Monday morning framed as a fresh start rather than a report card. A
season-only score would throw away six to twelve free restarts.

**Transfer.** Very close: the gym-attendance study population is university students, which is
exactly ours.

---

### 1.3 Gamification works, at a small to moderate effect size

> Mazeas A, Duclos M, Pereira B, Chalabaev A. **Evaluating the Effectiveness of Gamification on
> Physical Activity: Systematic Review and Meta-analysis of Randomized Controlled Trials.**
> *Journal of Medical Internet Research*, 2022;24(1):e26779.
> DOI [10.2196/26779](https://doi.org/10.2196/26779) ·
> [full text](https://www.jmir.org/2022/1/e26779)

**Design.** Systematic review and meta-analysis of randomised controlled trials. 16 RCTs,
2,407 participants.

**Results.** Pooled effect Hedges' g = 0.42, a small to moderate effect. Effects persisted beyond
the follow-up period, which the authors argue means it is not purely novelty. No statistically
significant difference between healthy participants and adults with chronic disease, suggesting the
effect generalises across populations.

**What we use it for.** The base claim that a gamified competition is worth running at all. **Note
carefully what it does not say:** it does not rank individual game elements by effectiveness. See
section 3.2.

---

### 1.4 Team competition raises activity, and the effect decays week by week

> Wang J, Fang Y, Frank E, Walton MA, Burmeister M, Tewari A, Dempsey W, NeCamp T, Sen S, Wu Z.
> **Effectiveness of gamified team competition as mHealth intervention for medical interns: a
> cluster micro-randomized trial.** *npj Digital Medicine*, 2023.
> DOI [10.1038/s41746-022-00746-y](https://doi.org/10.1038/s41746-022-00746-y) ·
> [open access](https://pmc.ncbi.nlm.nih.gov/articles/PMC9834206/)

**Design.** Cluster micro-randomised trial. 1,779 medical interns in 191 teams, smartphone-based
gamified team competition, measuring daily step count and sleep.

**Results, verbatim.**

> "team competition intervention significantly increases the mean daily step count by 105.8 steps
> (SE 35.8, p = 0.03) relative to the no competition arm"

> "the causal effects of competition on daily step count and sleep minutes decreased by 14.5 steps
> (SE 10.2, p = 0.16) and 1.9 minutes (SE 0.6, p = 0.003) for each additional week-in-study"

Moderation analysis: roughly 185 extra steps during competition weeks in week one, about 113 by
week six, about 26 by week twelve.

**Honesty flag for the meeting.** The headline effect is significant (p = 0.03). **The step-count
decay is not** (p = 0.16). The decay is directionally clear and matches the sleep result, which is
significant, but do not present the 14.5 figure as an established effect. State it as suggestive.

**What we changed.** This is the strongest single argument for a shorter competition. If the
benefit of competition is largest in week one and small by week twelve, a six to eight week
competition captures most of the value.

---

### 1.5 The activity target

> Bull FC, Al-Ansari SS, Biddle S, Borodulin K, Buman MP, Cardon G, et al. **World Health
> Organization 2020 guidelines on physical activity and sedentary behaviour.** *British Journal of
> Sports Medicine*, 2020;54(24):1451-1462.
> DOI [10.1136/bjsports-2020-102955](https://doi.org/10.1136/bjsports-2020-102955) ·
> [PubMed 33239350](https://pubmed.ncbi.nlm.nih.gov/33239350/)

**Recommendation for adults 18 to 64.** At least 150 to 300 minutes of moderate-intensity aerobic
activity per week, or 75 to 150 minutes vigorous, or an equivalent combination, plus
muscle-strengthening on two or more days. Risk reduction continues but **starts to plateau beyond
300 minutes per week**.

**What we changed.** The personal weekly target is 150 minutes, cited rather than invented. The
plateau is the justification for capping a single day's contribution: past that range, extra volume
is not the behaviour the competition should be paying for. The cap also bounds dishonesty, since an
inflating user can gain at most about three times an honest one.

**Note it says per week, not per day.** This is why streaks are counted in weeks here. A daily
streak would teach that a rest day is a failure, which the guideline does not support.

---

### 1.6 Notification timing and control

> Bidargaddi N, Almirall D, Murphy S, Nahum-Shani I, Kovalcik M, Pituch T, Maaieh H, Strecher V.
> **To Prompt or Not to Prompt? A Microrandomized Trial of Time-Varying Push Notifications to
> Increase Proximal Engagement With a Mobile Health App.** *JMIR mHealth and uHealth*,
> 2018;6(11):e10123.
> DOI [10.2196/10123](https://doi.org/10.2196/10123) ·
> [PubMed 30497999](https://pubmed.ncbi.nlm.nih.gov/30497999/)

**Design.** Micro-randomised trial of sending versus not sending a contextually tailored push
notification, measuring proximal engagement (self-monitoring in the app).

**Relevant findings.** Prompting increased proximal engagement, and the effect varied with context
and time. Users who had recently disengaged needed longer back-off periods before further
notifications were useful: those inactive 2 to 9 days were unavailable for around 2 days after a
notification, those inactive over 30 days for around 15 days.

**What we changed.** Users choose their reminder hour, reminders go only to people who have not
logged that day, and they stop automatically after five consecutive non-responses. In our case
there is an additional constraint the literature does not face: a Telegram bot cannot message
anyone who has not written to it first, so a user who blocks the bot is **permanently
unreachable**. Being conservative matters more here than in an app.

---

### 1.7 Competition length

> Niven A, Ryde GC, Wilkinson G, Greenwood C, Gorely T. **The Effectiveness of an Annual Nationally
> Delivered Workplace Step Count Challenge on Changing Step Counts: Findings from Four Years of
> Delivery.** *International Journal of Environmental Research and Public Health*,
> 2021;18(10):5140.
> DOI [10.3390/ijerph18105140](https://doi.org/10.3390/ijerph18105140) ·
> [open access](https://www.mdpi.com/1660-4601/18/10/5140)

**Design.** Four years of delivery data (2015 to 2018) from Paths for All's eight-week online
Workplace Step Count Challenge in Scotland. 10,183 participants.

**Result.** Mean difference of **906 steps per day** between week 1 and week 8, ranging 506 to
1,223 across the four years.

**Caveat worth stating.** The paper reports low uptake and poor compliance between survey points:
in one cohort, of 2,042 employees who signed up, baseline data were available for only 246, about
12%. Expect the same. Registration is not participation.

---

### 1.8 Habit formation, used as a caution rather than a goal

> Lally P, van Jaarsveld CHM, Potts HWW, Wardle J. **How are habits formed: Modelling habit
> formation in the real world.** *European Journal of Social Psychology*, 2010;40(6):998-1009.
> DOI [10.1002/ejsp.674](https://doi.org/10.1002/ejsp.674)

**Design.** 96 volunteers chose an eating, drinking or activity behaviour to perform daily in a
consistent context for 12 weeks, completing the Self-Report Habit Index daily.

**Result.** Median time to reach 95% of asymptotic automaticity was **66 days**, with a range of
**18 to 254 days**. Around half of participants did not reach automaticity at all.

**How to present it.** As a reason *not* to promise habit change. The author, Pippa Lally, has
publicly pushed back on the 66-day figure being treated as a rule. No competition of six to twelve
weeks should claim to build lasting habits. Ours is designed to make the competition window work,
and anything that persists afterwards is a bonus.

---

### 1.9 Why comparison alone is not enough

> Ryan RM, Deci EL. **Self-determination theory and the facilitation of intrinsic motivation, social
> development, and well-being.** *American Psychologist*, 2000;55(1):68-78.
> DOI [10.1037/0003-066X.55.1.68](https://doi.org/10.1037/0003-066X.55.1.68) ·
> [PDF](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf)

**The framework.** Three basic psychological needs, competence, autonomy and relatedness. Satisfying
them enhances self-motivation; thwarting them diminishes motivation and wellbeing.

**How it is used here.** As the rationale for the non-comparative weekly target. Purely comparative
feedback offers a competence win only to people who are already winning. A 150-minute weekly goal
is a win available to everyone regardless of rank. The user-chosen reminder hour and the opt-out
serve autonomy.

This is theory, not a trial. Present it as the reasoning behind the design, not as evidence that the
design works.

---

## 2. How each design decision maps to a source

| Decision | Source |
|---|---|
| Guild-versus-guild competition | 1.1 Zhang et al. 2016 |
| No encouragement or support features | 1.1 Zhang et al. 2016 (support arm underperformed control) |
| No investment in team mechanics beyond identity | 1.1 (comparison worked equally with individual or team incentives) |
| Weekly reset alongside the season | 1.2 Dai et al. 2014 |
| Monday post | 1.2 (student gym attendance rises at the start of a week) |
| Running a gamified competition at all | 1.3 Mazeas et al. 2022 |
| 6 to 8 weeks rather than a term | 1.4 Wang et al. 2023, 1.7 Niven et al. 2021 |
| 150 minute weekly target | 1.5 WHO / Bull et al. 2020 |
| Daily contribution capped | 1.5 (benefit plateaus beyond 300 min/week) |
| Streaks counted in weeks, not days | 1.5 (the guideline is weekly) |
| User-chosen reminder hour, auto-stop after five | 1.6 Bidargaddi et al. 2018 |
| Expect low conversion from signup to participation | 1.7 Niven et al. 2021 |
| No promise of lasting habit change | 1.8 Lally et al. 2010 |
| A non-comparative personal target | 1.9 Ryan & Deci 2000 (theory) |
| A symbolic celebration when a week crosses the target, and no prizes (FR-28) | 5.1 Deci, Koestner & Ryan 1999; Vansteenkiste & Deci 2003 |
| Confirmation copy that informs rather than pressures | 5.1 Deci, Koestner & Ryan 1999 |
| The Monday post counts people who logged, never a share | 5.2 Schultz et al. 2007 |
| The streak shown only while intact, never resetting | 5.3 Silverman & Barasch 2023 |
| A local race for every guild (admitted, waiting on NFR-6) | 5.4 Gill et al. 2019 |
| Nothing may add a tap to the log | 5.5 Michie et al. 2009; Harkin et al. 2016 |
| The closing post written for newcomers | 5.6 Charness & Gneezy 2009 |
| The standings stay the core; no sponsor, no collaboration mechanics | 5.7 Patel et al. 2019 |
| A self-chosen weekly target deferred, not rejected | 5.7 Patel et al. 2021 |
| The three-neighbour block is load-bearing | 5.8 Karau & Williams 1993 |
| No motivational filler in reminders | 5.9 Wu et al. 2024 |

---

## 3. Claims that did not survive checking

Presented separately so they are not accidentally repeated. **Two of these are corrections to
things stated earlier in this project.**

### 3.1 "Leaderboards harm the least active in fitness contexts"

**Status: overstated. Do not present as a research finding.**

The macro-versus-micro leaderboard argument comes from:

> Park S, Kim S. **Leaderboard Design Principles to Enhance Learning and Motivation in a Gamified
> Educational Environment: Development Study.** *JMIR Serious Games*, 2021;9(2):e14746.
> DOI [10.2196/14746](https://doi.org/10.2196/14746)

Two problems. First, it is a study of a **gamified educational environment**, not physical activity.
Second, it is a **development study** proposing design principles, not a randomised trial measuring
outcomes.

Its actual argument is reasonable: with a macro leaderboard only, mid and upper ranks experience
success while lower ranks experience failure, and continuous low placement accumulates that failure.
It recommends combining macro with micro leaderboards.

Separately, Mazeas et al. (1.3) found **no statistically significant difference** in gamification
effect between participant populations, which is evidence *against* a strong "harms the least
active" claim.

**How to present it honestly:** as a design principle borrowed from education research and a
plausible risk, not as a demonstrated harm in fitness. The design change it motivated (show
neighbours rather than a global ranking) costs nothing and is defensible on its own terms, so
nothing is lost by stating it modestly.

### 3.2 "Feedback is the most effective gamification element"

**Status: mis-sourced. The ranking comes from preference and frequency studies, not outcomes.**

The element rankings circulating in secondary summaries trace to two different kinds of study:
maximum-difference-scaling work measuring which elements users *say* they prefer, and systematic
reviews counting which elements are *most frequently used*. Neither measures which element produces
the largest behaviour change.

**What is defensible:** goal-setting, progress tracking and feedback are the most commonly
implemented elements and are well regarded by users, and gamification overall produces a small to
moderate effect (1.3). **What is not defensible:** an efficacy ranking among elements.

The design change stands anyway, because a personal target is justified independently by 1.9.

### 3.3 Duolingo streak figures

**Status: company-sourced, not peer reviewed.** Figures such as a 21% churn reduction from streak
freezes, or day-7 retention improving 14% from a streak wager, come from company communications,
conference talks and secondary write-ups. They are plausible and internally consistent but have not
been independently verified.

**Use only the directional lesson:** streaks work through loss aversion and need a forgiveness
mechanism. Do not quote the percentages in a meeting.

### 3.4 "Members of the team support group worked out 16.8 times per week"

**Status: my error, corrected.** This figure appears in press coverage and I repeated it. In the
paper, 16.8 is the **mean attendance number per week for the social support condition as a whole**,
alongside 35.7, 38.5 and 20.3 for the other three arms. It is not a per-person workout count.

The correct per-person comparison is the one the abstract gives: mean 1.9 (SE 0.2) in the two
comparison conditions versus 1.0 (SE 0.2) in the two without, p = 0.003.

### 3.5 "A team slightly behind at half-time is more likely to win"

**Status: failed replication. Do not build on it.** Berger and Pope's 2011 finding (a 2 to 6 point
advantage for being slightly behind) did not survive a 2023 high-powered replication across four
sports (*Management Science* 69(1):513-532); the effect holds only in the original NBA sample. The
"close race" framing in Phase 5 rests on the rank-feedback finding in 5.4 instead.

### 3.6 "It takes 21 days to form a habit"

**Status: no empirical basis.** The figure traces to Maxwell Maltz's 1960 self-help book. Lally et
al. (1.8) is the measured answer: a median of 66 days, a range of 18 to 254, and exercise habits
slower than that.

### 3.7 Streak statistics circulating in blogs

**Status: untraceable, treat as fabricated.** An "npj Digital Medicine 2023" cohort of 1,247 streak
users and a "CHI 2020" figure that 63% quit after a broken streak appear in habit-app blogs and
trace to no paper. The one peer-reviewed result on broken streaks is 5.3.

### 3.8 Push-notification opt-out thresholds

**Status: uncited industry compilation.** "One weekly push makes 10% disable notifications" and
"three to six a week make 40% opt out" come from an aggregator with no primary source. The trial
evidence (1.6, and 5.9) is calmer: frequency alone did not move steps, irrelevant content did.

---

## 4. What no source here covers

Be ready for these, because they are the honest gaps.

- **No study of a Telegram bot as the delivery mechanism.** Everything above uses apps, websites or
  wearables. The delivery channel is an assumption.
- **No study using coarse self-reported tiers as the measure.** Our three buckets are a judgement
  about honest self-report resolution, not a validated instrument. The IPAQ short form does
  categorise self-reported activity into low, moderate and high bands and correlates moderately
  with accelerometer data, but we are not using IPAQ and should not claim its validation.
- **Per-capita scoring against total roster size is untested.** It follows logically from wanting
  breadth rather than depth, but no source here evaluates it.
- **No competition trial used a group anywhere near a guild's size.** Zhang et al. (1.1) compared
  within networks of six; STEP UP's competition arm (5.7) used groups of three; the effort literature
  (5.8) predicts loafing grows with the group. A guild of 350 to 700 ranked on a per-member average
  is outside every trial here. Sub-squads of three to six are scored in the Phase 5 design (AC, 15)
  and are held back by cost, not by evidence; SPEC.md §8's "elaborate team mechanics" row rejects
  team-spirit features, not small groups, and should not be read as settling this.
- **Nothing on Finnish student guild culture.** All of the above is US or UK.
- **Self-report cannot be verified.** No source offers a fix, because there isn't one that does not
  require hardware.

---

## 5. Sources added by the fun pass (Phase 5, 2026-09-07)

Compiled for [the Phase 5 design](superpowers/specs/2026-09-07-telegram-bot-phase-5-design.md) from
three briefings kept in [docs/research/](research/). Only sources that changed a decision are
entered here. Each citation was checked against the publisher, PubMed Central or the Semantic
Scholar record; two are noted where the publisher page refused automated fetching. One correction
found while checking: the ENGAGE trial (5.7) is in *JAMA Cardiology*, not *JAMA Network Open* as
the habit briefing has it.

### 5.1 Praise that informs raises intrinsic motivation; rewards that pressure lower it

> Deci EL, Koestner R, Ryan RM. **A meta-analytic review of experiments examining the effects of
> extrinsic rewards on intrinsic motivation.** *Psychological Bulletin*, 1999;125(6):627-668.
> DOI [10.1037/0033-2909.125.6.627](https://doi.org/10.1037/0033-2909.125.6.627)

> Vansteenkiste M, Deci EL. **Competitively contingent rewards and intrinsic motivation: Can losers
> remain motivated?** *Motivation and Emotion*, 2003;27(4):273-299.
> DOI [10.1023/A:1026259005264](https://doi.org/10.1023/A:1026259005264) (verified through the
> Semantic Scholar record; Springer's page refuses automated fetching)

**Design.** A meta-analysis of 128 experiments on rewards and free-choice intrinsic motivation, and
a laboratory experiment on competition in which losers were or were not given an attainable
standard with positive feedback for meeting it.

**Results.** Expected tangible rewards undermine intrinsic motivation (d = -0.40 when contingent on
engagement, -0.36 on completion, -0.28 on performance). Verbal praise enhances it (d = 0.33 on
free-choice behaviour across the full set), and the split matters: informational praise d = +0.66
and controlling praise d = -0.44, each against a no-feedback control. Those two figures come from
the paper's supplemental analysis (Table 9) of the four studies that manipulated both kinds of
praise, three of them with a control group, so they carry the weight of four experiments, not 128;
re-read from the paper's text on 2026-09-07 after a critic queried them. Losers of a competition
stay motivated when given an attainable standard and positive feedback for meeting it, and lose
motivation under pressure to win.

**What we changed.** FR-28: the one celebration in the product is symbolic (a reaction), fires only
when the personal target is crossed, and there are no prizes. The confirmation heads scale with the
tier and state a fact ("22 min. Counts.") rather than pressing. The personal target is the
attainable standard that keeps a member of the ninth-placed guild in the competition.

**Transfer.** The meta-analysis is broad and robust. The competition study is a laboratory task, not
exercise; use it as the mechanism, not as a measured effect on activity.

### 5.2 A broadcast low norm pulls the people above it down toward it

> Schultz PW, Nolan JM, Cialdini RB, Goldstein NJ, Griskevicius V. **The constructive, destructive,
> and reconstructive power of social norms.** *Psychological Science*, 2007;18(5):429-434.
> DOI [10.1111/j.1467-9280.2007.01917.x](https://doi.org/10.1111/j.1467-9280.2007.01917.x)

> Cialdini RB. **Crafting normative messages to protect the environment.** *Current Directions in
> Psychological Science*, 2003;12(4):105-109.
> DOI [10.1111/1467-8721.01242](https://doi.org/10.1111/1467-8721.01242)

**Design.** Field experiment: 290 households told their neighbourhood's average energy use, half
of them with an added injunctive signal (a smiley or frowning face).

**Result.** Households above the average reduced consumption; households below it **increased**
consumption toward the norm, the boomerang. Adding the injunctive signal removed the boomerang.
Replicated since; the related hotel-towel result failed a German replication, so descriptive norms
are not a reliable lever on their own.

**What we changed.** The Monday post counts the people who logged instead of printing a share of
the roster (FR-20). SPEC.md §1 expects a signup-to-participation base rate near 12%, so the share
would have been a low norm sent to a whole guild chat every Monday. SPEC.md §8 now rejects any "N%
of the guild" or "N logged today" line. The welcome's "Most people forget by week three" went the
same way (Phase 5 design §10.2): Cialdini 2003 is the review that names the trap, a message that
depicts the undesirable behaviour as regrettably common ("many people litter") carries the
descriptive norm "many people do this", and the sentence was that message about lapsing, sent to
every newcomer to sell the reminder. The reminder is still recommended, without the norm.

**Transfer.** Energy use, not exercise, but the mechanism is about the message, not the behaviour,
and the population effect (a whole chat reading one number) is exactly the situation.

### 5.3 A highlighted broken streak reduces engagement

> Silverman J, Barasch A. **On or off track: How (broken) streaks affect consumer decisions.**
> *Journal of Consumer Research*, 2023;49(6):1095-1117.
> DOI [10.1093/jcr/ucac029](https://doi.org/10.1093/jcr/ucac029)

**Design.** Seven experiments, mostly online, holding actual behaviour constant and varying whether
a log highlighted an intact streak, a broken one, or neither.

**Result.** A highlighted intact streak increases continuation; a highlighted broken streak
decreases it, more when people blame themselves for the break, and less when the break can be
repaired or is attributed to outside causes.

**What we changed.** The streak is named on the confirmation only once the target is met and only
from two weeks up, and `/me` omits the line at zero. Nothing in the product ever says a streak
ended. Streaks stay weekly (SPEC.md §8), which is the coarse, repairable form.

**Transfer.** Consumer tasks rather than exercise, but the finding is about the display, and the
display is what this project controls.

### 5.4 Rank feedback is U-shaped

> Gill D, Kissová Z, Lee J, Prowse V. **First-place loving and last-place loathing: How rank in the
> distribution of performance affects effort provision.** *Management Science*, 2019;65(2):494-507.
> DOI [10.1287/mnsc.2017.2907](https://doi.org/10.1287/mnsc.2017.2907) (verified through the
> Semantic Scholar record; INFORMS's page refuses automated fetching)

**Design.** Laboratory experiment with real-effort tasks and rank feedback with no payment attached
to rank.

**Result.** Effort rises most after being ranked first or last and least in the middle of the
distribution: the response to rank is U-shaped.

**What we changed.** A local race for every guild (the gap to the adjacent guild in the Monday
post, in medium sessions over the reader's roster: "FK, one place up, was 3 sessions away.") passed
the admission scale, because the middle of a nine-guild table is where motivation is flattest.
Built 2026-09-08 once the size ceiling was removed (FR-20, Phase 5 design §11.2). The "slightly
behind wins" folklore is not the basis; see 3.5.

**Transfer.** Laboratory, individual effort. The direction is what transfers.

### 5.5 Self-monitoring is the strongest single technique

> Michie S, Abraham C, Whittington C, McAteer J, Gupta S. **Effective techniques in healthy eating
> and physical activity interventions: A meta-regression.** *Health Psychology*, 2009;28(6):690-701.
> DOI [10.1037/a0016136](https://doi.org/10.1037/a0016136)

> Harkin B, Webb TL, Chang BPI, Prestwich A, Conner M, Kellar I, Benn Y, Sheeran P. **Does
> monitoring goal progress promote goal attainment? A meta-analysis of the experimental evidence.**
> *Psychological Bulletin*, 2016;142(2):198-229.
> DOI [10.1037/bul0000025](https://doi.org/10.1037/bul0000025)

**Results.** Interventions with self-monitoring had an effect of 0.42 against 0.26 without, and it
explained the most between-study variance (122 evaluations, 44,747 participants). Prompting progress
monitoring raised goal attainment by d = 0.40 across 138 RCTs, with larger effects when the record
was written down and when it was reported to others.

**What we changed.** Nothing, which is the point: the one-tap log is the most evidence-backed thing
in the product, and Phase 5's admission scale scores any candidate that adds a tap to it at Safety 0.

### 5.6 The habit that survives belongs to the newcomer

> Charness G, Gneezy U. **Incentives to exercise.** *Econometrica*, 2009;77(3):909-931.
> DOI [10.3982/ECTA7416](https://doi.org/10.3982/ECTA7416)

**Design.** Two field experiments paying students to visit a gym eight times in a month, with
attendance tracked after payment stopped.

**Result.** Attendance stayed about twice as high after the incentive ended, entirely among people
who had not been attending before; regulars gained nothing and sometimes attended less.

**What we changed.** The closing post's last line is written for the previous non-exerciser: it
hands the weekly target back as theirs to keep and asks for nothing (FR-20).

**Transfer.** University students, gym attendance, a temporary incentive: close to ours in every
respect except that the incentive here is a competition rather than money.

### 5.7 Competition is the social arm that lasts; a self-chosen goal is the strongest missing element

> Patel MS, Small DS, Harrison JD, et al. **Effectiveness of behaviorally designed gamification
> interventions with social incentives for increasing physical activity among overweight and obese
> adults across the United States: The STEP UP randomized clinical trial.** *JAMA Internal
> Medicine*, 2019;179(12):1624-1632.
> DOI [10.1001/jamainternmed.2019.3505](https://doi.org/10.1001/jamainternmed.2019.3505)

> Patel MS, Bachireddy C, Small DS, et al. **Effect of goal-setting approaches within a gamification
> intervention to increase physical activity among economically disadvantaged adults at elevated
> risk for major adverse cardiovascular events: The ENGAGE randomized clinical trial.** *JAMA
> Cardiology*, 2021;6(12).
> DOI [10.1001/jamacardio.2021.3176](https://doi.org/10.1001/jamacardio.2021.3176)

**Results.** STEP UP (602 adults, 24 weeks plus 12 of follow-up): the competition arm added 920
steps a day during the programme and 569 afterwards; support added 689 then 428; collaboration 637
then 126 (not significant). ENGAGE (500 adults): only the arm that chose its own goal and started
it immediately worked, +1,384 steps a day during the intervention (95% CI 805 to 1,963) and +1,391
at follow-up (785 to 1,998); assigned or gradual goals did not reach significance.

**What we changed.** The guild ranking stays the core, and no sponsor or collaboration mechanic is
added. A self-chosen weekly target (`/target`: 150, 225, 300 or 450 minutes, FR-29) was built on
2026-09-08 once the size ceiling was removed, prompted by the owner's concern for members who train
ten hours a week and had nothing left to reach after two days. It changes only the personal bar,
the streak and the celebration; the guild's score is untouched. Nothing below the WHO line is
offered until SPEC.md §9 Q7 is decided, which is the attainability half of this evidence still
unapplied.

**Transfer.** US adults, mostly overweight, with wearables. The social-arm ordering is consistent
with Zhang et al. (1.1) in students, which is the population that matters here.

### 5.8 Effort falls as groups grow unless contributions are identifiable

> Karau SJ, Williams KD. **Social loafing: A meta-analytic review and theoretical integration.**
> *Journal of Personality and Social Psychology*, 1993;65(4):681-706.
> DOI [10.1037/0022-3514.65.4.681](https://doi.org/10.1037/0022-3514.65.4.681)

**Result.** Across 78 studies, effort in collective tasks falls as groups grow (mean d about 0.44),
and recovers when individual contributions are identifiable and evaluated.

**What we changed.** Nothing built; one thing protected. A guild of hundreds ranked by a per-member
average is close to the worst case, and the three-row "Around you" block in `/me` is the
identifiability lever that keeps the average from dissolving into anonymity. It is scored as
load-bearing in the Phase 5 design and must not be cut to save lines.

### 5.9 Irrelevant messages cost steps

> Wu J, Brunke-Reese D, Lagoa CM, Conroy DE. **Assessing the impact of message relevance and
> frequency on physical activity change: A secondary data analysis from the Random AIM trial.**
> *Digital Health*, 2024;10:20552076241255656.
> DOI [10.1177/20552076241255656](https://doi.org/10.1177/20552076241255656)

**Design.** Secondary analysis of a trial that randomised, within person, zero to six text messages
a day for 180 days.

**Result.** Total message frequency had no association with daily steps. Each additional message
with irrelevant content (inspirational quotes) was associated with 82 to 104 fewer steps that day.

**What we changed.** No motivational copy anywhere, and SPEC.md §8 now says so. The reminder stays
the check-in message and nothing else (FR-21).

---

## 6. Sources behind the scoring change (2026-09-08)

Two research briefings were commissioned before the guild ranking moved from minutes per member to
active days per member ([team scoring](research/2026-09-08-team-scoring-briefing.md),
[community mobilisation](research/2026-09-08-community-briefing.md)); each carries its full
reference list. The entries below are the ones the decision rests on. Three figures were re-read
from the primary record on 2026-09-08 by the author (marked *re-verified*); the rest are as the
briefings report them, each briefing having resolved its DOIs through Crossref, PubMed or Semantic
Scholar.

### 6.1 Motivation gains for weaker members need conditions a guild cannot provide

> Weber B, Hertel G. **Motivation gains of inferior group members: A meta-analytical review.**
> *Journal of Personality and Social Psychology*, 2007;93(6):973-993.
> DOI [10.1037/0022-3514.93.6.973](https://doi.org/10.1037/0022-3514.93.6.973)

**Result.** Across 17 studies (N = 2,240) the Köhler gain for the weaker member is g = 0.60, and it
appears under conjunctive demands (the group's result is the weakest member's) with performance
information and small groups, not under additive ones (the group's result is the sum).

**What we changed.** Nothing built on it, one claim withdrawn: active-day scoring bounds each
contribution and removes the single carrier, but it does not make a newcomer "worth as much as an
athlete" motivationally in a group of 500, because none of the three conditions (knowing you are
the weaker member, being indispensable, feedback on it) hold. The guild rank is a rivalry frame,
not a motivator of individual effort; the personal layer (target, streak, celebration) is what
motivates. SPEC.md §9 Q9 records small-group structure as the missing ingredient.

### 6.2 A team-only consequence does nothing on its own

> Patel MS, Asch DA, Rosin R, et al. **Individual versus team-based financial incentives to
> increase physical activity: A randomized, controlled trial.** *Journal of General Internal
> Medicine*, 2016;31(7):746-754.
> DOI [10.1007/s11606-016-3627-0](https://doi.org/10.1007/s11606-016-3627-0) *(re-verified)*

**Result.** Four-person teams; the mean proportion of participant-days the step goal was met was
0.18 in control, 0.17 with a team-only incentive (difference -0.003, p = 0.96), 0.25 with an
individual incentive (p = 0.13), and 0.35 with the combination (difference 0.17, 95% CI 0.07 to
0.28, p < 0.001).

**What we changed.** Kept every personal element untouched by the scoring change: the bar, the
target, the streak and the celebration are the individual half the trial says is required. SPEC.md
§8 now rejects conjunctive and weakest-member scoring.

### 6.3 The trials that made team competition work scored bounded units

STEP UP (5.7) awarded 70 points on Monday and deducted 10 for each day the personal step goal was
missed; its competition arm ranked three-person teams on cumulative points, and the outcome was
device steps. Zhang et al. (1.1) scored class attendance. Patel 2016 (6.2) scored goal-days. The
large step programmes that summed steps or minutes (Global Corporate Challenge, Stepathlon, Walk
Kansas) are pre-post evaluations with self-entered data (C). No trial compares days with minutes
head to head; the case for days rests on the currency of the randomised half and on the mechanism
in 6.1 and 6.5.

### 6.4 People shown that they are above the average cut their contribution

> Chen Y, Harper FM, Konstan J, Li SX. **Social comparisons and contributions to online
> communities: A field experiment on MovieLens.** *American Economic Review*,
> 2010;100(4):1358-1398.
> DOI [10.1257/aer.100.4.1358](https://doi.org/10.1257/aer.100.4.1358) *(re-verified)*

**Result.** Users told the median contribution: those below it raised their monthly ratings by 530
percent, those above it cut theirs by 62 percent. Together with Schultz et al. (5.2) this is the
boomerang in a contribution setting.

**What we changed.** No per-member figure, per-100 figure, share or decimal is displayed anywhere
(SPEC.md §4.3, §8). The tables show counts of active days and ranks; the Monday post shows counts
and the gap in days; the closing post names the season winner with no figure. The rank carries
the per-member normalisation silently, and a footer explains why a smaller guild can sit above a
bigger count. In a guild at the expected base rate every logger is far above the average, which
is exactly the group the figure would have pulled down.

### 6.5 Self-report inflates, and a bounded unit caps what a lie is worth

> Prince SA, Adamo KB, Hamel ME, Hardt J, Gorber SC, Tremblay M. **A comparison of direct versus
> self-report measures for assessing physical activity in adults: a systematic review.**
> *International Journal of Behavioral Nutrition and Physical Activity*, 2008;5:56.
> DOI [10.1186/1479-5868-5-56](https://doi.org/10.1186/1479-5868-5-56)

**Result.** Across 187 articles, self-report correlates only weakly to moderately with direct
measurement and runs both above and below it by instrument; social desirability pushes it up.

**What we changed.** Under minutes one member could add 525 credited minutes a week by tapping the
top tier; under days the most anyone adds is 7, and the only lie left is "I did 15 minutes". The
rule does not verify anything (NFR-4 remains the real honesty guarantee); it caps the payoff.

### 6.6 Specific group goals, and individual goals framed as the group's

> Kleingeld A, van Mierlo H, Arends L. **The effect of goal setting on group performance: A
> meta-analysis.** *Journal of Applied Psychology*, 2011;96(6):1289-1304.
> DOI [10.1037/a0024315](https://doi.org/10.1037/a0024315) *(re-verified)*

**Result.** Group goals raise group performance (d = 0.56 ± 0.19, 49 effect sizes); specific
difficult goals against nonspecific ones d = 0.80 ± 0.35 (k = 23). Individual goals inside
interdependent groups: egocentric d = -1.75 ± 0.60 (k = 6), groupcentric d = 1.20 ± 1.03 (k = 4).

**What we changed.** The Monday post sets the guild's own last count as the mark to beat (FR-20),
a specific goal the guild set itself, omitted at zero and never reported as missed. The
confirmation names the day as the guild's ("A day for Prodeko.", FR-30), which turns the personal
target into a groupcentric one under active-day scoring, where the sentence is literally true. The
k for the individual-goal split is small; the direction is what transfers.

### 6.7 Seed through nominated friends, not the best connected

> Kim DA, Hwong AR, Stafford D, et al. **Social network targeting to maximise population behaviour
> change: a cluster randomised controlled trial.** *The Lancet*, 2015;386(9989):145-153.
> DOI [10.1016/S0140-6736(15)60095-2](https://doi.org/10.1016/S0140-6736(15)60095-2)

**Result.** Thirty-two Honduran villages; seeding the nominated friends of random villagers raised
uptake of a health behaviour by 12.2 percentage points over random seeding (95% CI 6.9 to 17.9);
seeding the most connected people did no better than random.

**What we changed.** The registration reply asks the newcomer, once, to send the guild's own FR-1
deep link to someone they know (FR-30). The bot never posts on anyone's behalf, and there is no
referral count, bonus or leaderboard: the ask is the whole feature. Outside the bot, SPEC.md §9
records the organiser-side step of asking each guild board for two or three well-liked,
ordinary-fitness members to log visibly in weeks one and two.

### 6.8 Intergroup competition removes the free riding a collective reward creates

> Erev I, Bornstein G, Galili R. **Constructive intergroup competition as a solution to the free
> rider problem: A field experiment.** *Journal of Experimental Social Psychology*,
> 1993;29(6):463-478.
> DOI [10.1006/jesp.1993.1021](https://doi.org/10.1006/jesp.1993.1021)

**Result.** Orange pickers in groups of four: a collective reward cut output by 30% against
personal pay; competition between groups removed the loss, more so the more evenly matched the
groups.

**What we changed.** Nothing new; this is why the competition is between guilds rather than a
shared campaign, and why per-member normalisation (which keeps nine unequal guilds evenly
matched) stays inside the ranking even though the figure is never shown.

### 6.9 What was considered from the briefings and not built

A dynamic-norm line on the Monday post ("more of you logged than last week") has A-grade but
very small support (a 2026 meta-analysis of 79 studies puts it at r = 0.03 to 0.10) and needs a
branch on direction; scored 17, deferred. Displaying "active days per 100 members" was rejected
for the 6.4 reason. Sub-squads or a pair rule (the cheapest form with evidence, 6.1) is SPEC.md
§9 Q9. Tier weighting inside the day count, new-logger bonuses and referral counts each
reintroduce a volume incentive or a share, and were declined.
