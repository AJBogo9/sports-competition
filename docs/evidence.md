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
- **Nothing on Finnish student guild culture.** All of the above is US or UK.
- **Self-report cannot be verified.** No source offers a fix, because there isn't one that does not
  require hardware.
