# Habit tracker and focus timer — proposed plan

12 October 2026. All six implementation phases are complete. Desktop Edge, Chrome and Brave come first, with practical tablet support and the testing boundaries noted below.

## The experience

Create a habit → plan when to do it → choose a duration and start → save progress → enjoy seeing your effort build up.

Example: **Read — Monday, Wednesday and Friday at 7 pm — 30 minutes.** Do 18 minutes now and 12 later; both sessions count toward today's goal.

## What I propose to build

### 1. Define a habit

- Name, icon, colour, and a short reason.
- Choose a goal: **done/not done**, **a quantity** (pages, repetitions), or **minutes**. Set a daily, weekly or monthly target.
- Repeat daily, on chosen weekdays, every N days, on monthly dates, or N days per week. Add optional time slots, reminders, start/end dates, and a default timer duration.
- Preview upcoming dates before saving. Allow pause, archive and restart while keeping history.

**Habit is a completely independent entity.** It owns its schedules, goals, reminders, sessions, check-ins, notes and progress. There are no links or associations with tasks, projects, sub-projects, resources, docs or tags, and no automatic task creation.

### 2. A simple Habits page

- **Today:** due habits, preferred time, progress, and one clear Start/Log button; completed habits move below.
- **Week:** see the schedule and flexible weekly targets at a glance.
- **Progress:** overall trends; open any habit for its history and charts.
- Add a compact “Habits today” section to Overview and an optional habit layer to Calendar. These views display habit records directly, without linking them to other entities. Keep the existing dark/orange style, keyboard access and large touch targets.

### Calendar: plan and start, never record automatically

- Give habits a recognisable calendar style and a show/hide toggle. Timed habits appear as blocks; scheduled habits without a time appear in the all-day area.
- Flexible goals such as “exercise three days a week” appear as a weekly target. Create individual blocks only when the user chooses dates/times.
- Clicking a habit block opens its goal, progress and actions: **Start timer**, **Log progress**, or **Mark done**, depending on the habit type. Start lets the user choose a duration.
- A scheduled time arriving, opening a block, dragging it, or receiving a reminder never starts a timer, logs time or marks a habit done.
- A block references the habit's own scheduled occurrence. It creates no task and no second copy of the habit. Multiple blocks do not duplicate its goal or recorded progress.
- Clearly separate **planned** and **recorded** time: “30 min planned · 18 min recorded.” Show partial/completed states from saved habit records, without making a planned block look like finished work.
- Moving a block changes the plan only. Ask whether a schedule edit applies to this occurrence or future occurrences; completed history stays intact.

### 3. Start working and track time

- Choose a countdown duration; remember the last choice per habit. Also offer a stopwatch. Scheduled times prompt you; the timer starts only when you press Start.
- Pause, resume, add time, finish early, or discard. Log elapsed working time, excluding pauses; finishing early still earns partial progress.
- Multiple sessions add together. A time goal completes when its target is reached; running a timer does not automatically complete a page/count goal.
- Keep a small timer visible across app pages. Add desktop **Pop out timer** with habit name, remaining time, pause/resume and finish controls.
- Keep only one active timer per account, shared across tabs/devices. Closing the mini window returns the timer to the app.

### 4. Useful, motivating visuals

- **Today’s progress ring:** how much of the chosen goal is done.
- **Calendar heatmap:** distinguish completed, partial, missed, skipped and unscheduled days; show exact values on hover/tap.
- **Weekly bars:** actual minutes versus a time target, with a breakdown by habit.
- **Consistency trend:** completion rate for the last 4–12 weeks, alongside current/best streak and total hours.
- Click a chart day to inspect or correct its logs. Show small milestones and useful messages such as “You met your goal on 4 of 5 planned days.”
- Keep a satisfying **Your work so far** view: completed days, accumulated hours, personal milestones and short session notes. Let users browse earlier weeks and months, including archived habits.

Streaks follow the schedule. Rest days do not break them; weekly goals are assessed when the week ends. Completion rates exclude future and unscheduled periods. Skips are visible and neutral, never counted as completions. Partial work remains visible after a missed goal.

### 5. Make progress feel rewarding

- **After saving:** animate the progress ring/checkmark and show what was earned: “18 minutes added — 12 to go.” Partial work gets a positive response too.
- **When the goal is met:** a brief celebration, an optional soft sound, and a completed card that remains visible in today's achievements. Celebrate once per goal period, after the save succeeds.
- **Light gamification:** a personal habit journey with milestone badges and progress toward the next milestone. Examples: first session, five completed scheduled days, first hour, or first weekly goal. Minutes and completions remain the meaningful measures; no arbitrary points to farm.
- **Before starting:** a small, optional nudge such as “Start with five minutes” or a reminder of the user's own reason for this habit.
- **During a session:** quiet progress and an occasional milestone cue; keep the timer focused rather than filling it with popups.
- **End of day/week:** a brief recap of real effort and improvements: “You made time for reading on four days.” Use the user's own history, never invented encouragement or comparisons with other people.
- **After a gap:** welcome the user back and recognise the next saved effort. Earlier work remains visible; avoid guilt, lost rewards and pressure to protect a streak.
- Allow celebrations, sounds and nudges to be reduced or disabled; respect reduced-motion settings. Start with simple, explainable messages based on saved records.

Rewards belong inside habits. Editing/deleting logs recalculates progress and milestone eligibility; retries, refreshes and repeated clicks must not award or celebrate the same achievement again.

### 6. Trustworthy records

- Manual logging, backdating, optional notes, and edit/delete with undo; distinguish manual entries from timer sessions.
- Save timer state and use timestamps so refreshes and background throttling do not reset the clock. Keep unsent records locally and retry without duplicating them.
- After sleep, a crash or an abandoned timer, ask the user to confirm elapsed time before counting it. Switching tabs alone never means “not working.”
- Respect timezone and week-start settings; split overnight time across days. Schedule/goal edits affect future periods and preserve past results.
- Include habits and logs in search, account export and CSV export. Archive preserves history; deleting a habit uses Trash. Keep every record private to its account.

Shared app views may display or open habits: Overview, Calendar, search and reminders. They never create associations with other entities. Reminder actions only start recording when the user explicitly chooses Start/Log/Mark done.

## Desktop and tablet boundaries

Detect PiP support in each browser and test Edge, Chrome and Brave individually. Opening it requires a click and HTTPS; the originating tab must stay open. Fall back to the in-app mini timer if unavailable. [Document PiP](https://developer.chrome.com/docs/web-platform/document-picture-in-picture)

Tablets get responsive pages, touch controls, the in-app timer and saved-state recovery. Chrome Android currently lacks Document PiP, so an overlay above Instagram/YouTube is outside this plan. [Compatibility](https://github.com/mdn/browser-compat-data/blob/main/api/DocumentPictureInPicture.json)

Start with in-app reminders and optional browser alerts where supported. Exact alerts with the browser closed or tablet asleep are not promised; reliable background push needs separate work. [Notifications](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API), [background behaviour](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

## Phasewise implementation plan

Each phase builds on the previous one. Basic completion feedback ships with logging; the richer motivational experience follows once records and totals are trustworthy.

### Phase 1 — Independent habits and scheduling

**Implemented — 11 October 2026.** Open **Habits** in the sidebar.

- Add habit-owned goals, schedule history, occurrences and progress records, with account privacy and no links to other entities.
- Build create/edit, pause/archive, Today/Week views, manual logging, notes and undo. Include clear saved feedback, a progress ring and a completed-today section.
- Set rules for selected weekdays, intervals, monthly dates, flexible weekly targets, time slots and reminders. Preview upcoming dates; make missing dates in short months explicit.
- **Ready when:** each goal/schedule type produces the expected due periods and manual logs update progress correctly; schedule edits preserve earlier history.

What is available now:

- Independent habits with name, reason, icon and colour; done, quantity and minutes goals; daily, weekly and monthly goal periods.
- All five repeat patterns, start/end dates, upcoming date previews, and an explicit skip/last-day choice for short months. Flexible habits count distinct completed days toward their weekly target.
- Today, Week and All habits views, progress rings and a visible completed-goals section. Weekly/monthly totals appear once per goal period; the Week view distinguishes actual effort on each day from planned days.
- Manual entries, backdating, notes, corrections, delete with Undo, and Undo after adding progress. History can be browsed by month, including archived habits.
- Pause, archive and restart with retained history. Metadata changes apply immediately; goal/schedule changes begin with the next goal period (tomorrow, next week or next month). Further edits to a pending schedule replace its future settings while retaining the version history.
- Account-scoped records, revision checks for stale edits, and idempotent progress saves. No existing entity is associated with a habit. Future plans add no progress; retries and corrections cannot repeat a goal-completion celebration.
- Preferred times, reminder times and default session duration are saved. Timer support is available in Phase 2 below. Reminder delivery, Calendar and Overview display remain Phase 3.

Implementation uses habit-owned schedule versions, saved goal occurrences, manual logs and pause/archive history. Planned dates are calculated from the schedule; a goal occurrence is saved when its first entry is recorded. Account timezone determines the recording date. The goal week defaults to the account's week-start setting and can be changed in the habit form; schedule versions retain their week boundary so older results do not shift when settings change.

Validation includes schedule/goal unit tests and authenticated browser/API journeys covering progress, corrections, Undo, archive/restart, future edits, concurrent retries and account isolation. Desktop, tablet and narrow layouts are checked for overflow.

### Phase 2 — Reliable timer and desktop PiP

**Implemented — 11 October 2026.** Choose **Start timer** on a habit.

- Add countdown/stopwatch, chosen duration, pause/resume, add time, finish early, discard and an in-app mini timer. Save elapsed work against the habit.
- Add desktop Pop out timer with feature detection and fallback. Share one active timer across tabs/devices; handle offline saves, interrupted sessions and recovery.
- **Ready when:** refresh, background tabs, sleep/recovery, competing tabs, repeated saves and PiP closure cannot lose or duplicate time. Test Edge, Chrome and Brave individually.

What is available now:

- Countdown or stopwatch, a chosen duration remembered per habit, pause/resume, five-minute extensions, early finish and discard. A session can track up to 24 hours; pauses and gaps after an expired countdown are excluded.
- An in-app timer across app pages, with large touch controls. **Pop out timer** opens a desktop Document PiP window when supported; its controls operate the same session. Closing it returns the timer to the app without ending the session. Unsupported browsers retain the in-app timer.
- One active session per account, enforced by the server and database. Other tabs share changes immediately where supported; other devices refresh the saved state periodically. Habits remain independent of every other entity.
- **Finish → review → Save session.** Confirm or reduce actual working minutes and add a note before any progress is recorded. Expiry, refresh, recovery and PiP closure never save progress automatically. A recovered session shows a reminder to review elapsed work, including time when the device was asleep or the timer was abandoned.
- Minutes goals receive the confirmed working time. Quantity and done/not-done habits retain a time-only session; their quantity or completion must be logged separately. Saved sessions appear in habit history and are labelled as timer entries. Partial time receives saved feedback; reaching a goal celebrates once after the save succeeds.
- Timestamp-based recovery, pause intervals and account-scoped local storage. Existing sessions can be paused, reviewed, finished or discarded offline; pending changes survive refresh and retry with the same action IDs. Starting a new session requires a connection so the account cannot accidentally run two timers.
- If another device has changed the session, keep the unsent work and note visible. Offer **Save unsent copy** before the user explicitly switches to the latest timer; stale changes never silently overwrite newer records.
- Split confirmed overnight work across civil dates in the session's captured timezone, including daylight-saving changes. Existing schedule versions determine each day's goal. Reducing confirmed time removes work from the end of the working intervals, without counting paused gaps.

The additive database migration is `drizzle/0013_neat_rockslide.sql`. Timer records and generated progress entries are committed together; retries cannot generate a second copy of the same session.

Validation covers timestamp accounting, pauses, recovery, countdown limits, overnight/DST boundaries, concurrent starts, account privacy, repeated finish requests, offline saving and lost-response retries. Browser checks exercise navigation, refresh, cross-tab controls, PiP closure and tablet layout.

Checks passed: 211 unit tests, the four existing habit browser journeys, and timer journeys in installed Chrome, Edge and Brave. A competing-device journey also verifies that an unsent note can be downloaded before explicit reconciliation. Type checking, changed-file lint and the production build pass.

### Phase 3 — Calendar and shared app views

**Implemented — 11 October 2026.** Turn **Habits on** in Calendar, or use **Habits today** on Overview.

- Add the optional habit calendar layer, all-day/timed occurrences, flexible weekly targets, planned-versus-recorded styling and the Start/Log panel.
- Add habit summaries to Overview, habit search, and explicit-action reminders with snooze. Export habit history through account export and CSV.
- **Ready when:** calendar/reminder interactions never record automatically; starting/logging there updates the same habit records and creates no task. Moving a block changes only its plan.

What is available now:

- An optional, account-specific habit layer alongside tasks in Calendar. Preferred times create timed prompts; habits without times appear all day. Planned minutes and saved work are labelled separately, with clear partial/completed states. Calendar dates and times use the account timezone and week-start setting.
- Flexible habits appear as weekly targets, with **Choose a day** to add a specific plan. Past weeks remain visible as history; they cannot be planned retroactively. Choosing a date, opening a block or receiving a reminder records no work.
- A shared habit panel in Calendar, Overview and reminders. **Start timer** opens the duration choice; **Log progress / Mark done** opens the existing recording form. The same independent habit owns every saved entry. Future dates allow planning; recording happens on the day the work is done or through explicit backdating.
- **Change plan**, drag and resize offer **This occurrence** or **This and future occurrences**. Save changes the date, time or planned duration only. Future changes apply to that time slot until the next schedule version; other slots, individual overrides and recorded days retain their plans. Removing an occurrence removes its prompt, never its saved history. Concurrent/stale saves are checked, and retries cannot duplicate a plan.
- **Habits today** on Overview shows remaining and completed goals, Start/Log controls and flexible weekly progress. Search and the command palette find habit names, reasons and saved notes, opening the correct habit/date. Habit-only search hides entity association filters.
- Habit reminders in the existing bell, with account-persisted snooze and dismiss. They apply to actual planned dates and disappear after completion or skipping. Browser alerts are optional and request permission only after a click. Reminder delivery requires the app to be open; alerts with the browser closed or device asleep remain outside this phase.
- **Export CSV** on Habits includes manual/timer work, notes, older entries, archived habits and deleted-entry flags. Account JSON export includes full habit history, schedule versions, plans, goal occurrences, timer sessions and reminder state. Exports remain private to the account.
- Tablet controls use larger targets. Month/Week calendars can scroll horizontally on smaller screens; Day/Agenda fit the available width. Flexible targets use a compact scrollable list.

The additive migration is `drizzle/0014_quick_salo.sql`, applied locally. It adds habit-owned planning edits and reminder state. Calendar reads, planning saves and reminder actions create no task, project association, goal occurrence or progress entry.

Validation covers schedule/timezone/DST conversion, flexible plans, moving individual/future occurrences, drag cancellation, saved-work styling, explicit recording, persistent reminders, full-history exports, concurrent retries and account isolation. Checks passed: 227 unit tests, four shared-view journeys in each installed Chrome/Edge/Brave browser, and ten existing habit/timer/PiP and recurring-task calendar journeys. Type checking, changed-file lint and the production build pass.

### Phase 4 — History and useful visuals

**Implemented — 11 October 2026.** Open **Habits → Your work**, or choose **View insights** in a habit's details.

- Build heatmaps, weekly time bars, consistency trends, schedule-aware streaks and the Your work so far view, with day/week/month filters and log drill-down.
- Make partial effort, rest days and skips understandable. Preserve history for archived habits and update charts after corrections.
- **Ready when:** chart totals match saved logs across midnight, timezone/DST boundaries and goal changes; weekly targets and streaks use the agreed schedule rules.

What is available now:

- **Your work so far** shows all-time recorded time, distinct days with saved work and goals met. Filter by habit, day, week, month or 12 weeks, browse earlier dates, and include archived habits. All-time totals remain visible while browsing a smaller date range.
- Each habit has a tappable heatmap, current/best streak, saved quantity totals and recent session notes. Completed goals, partial effort, missed goals, skips, rest/paused days and open goals have separate symbols and colours. Selecting a day opens its saved entries for inspection, correction, deletion or Undo; the charts update after a save.
- Weekly time bars show actual working minutes, stacked by habit, against time targets. Select a week to see its habit breakdown. Quantity/done habits count confirmed timer time separately from their progress; a unit named "minutes" does not turn a quantity goal into a time goal. Monthly goals and weekly goals only partly within the selected range retain their own period cards instead of an invented weekly allocation.
- A 12-week consistency trend counts closed scheduled periods only, with gaps when no period was eligible. Future dates, unfinished current periods, rest and skips add no misses or completions. Weekly/monthly goals are counted once per period; day colours show the work actually saved on each day.
- Flexible habits show daily goals met and weekly targets met separately. Their weekly target counts distinct completed days, never multiple sessions on one day. Their streak and consistency use that weekly target. A short first/last week without enough available days, or an incomplete paused period, stays neutral; completed work remains visible.
- Streaks follow the habit's planned periods. Rest days and skips preserve the streak without extending it; an unfinished current period does not break it before its deadline. Moving/cancelling a calendar prompt changes its due plan, and multiple prompts never multiply the same goal. Extra work on an unscheduled day stays visible without boosting scheduled consistency.
- All charts calculate from saved, non-deleted records. Corrections and Undo recalculate totals and streaks; planned time never counts as work. Overnight sessions retain their saved day splits and captured timezone, including DST boundaries. Historical goal versions retain their original targets and units when later settings change.

This phase adds no database migration or association with another entity. The history endpoint is read-only and private to its account; browsing charts creates no occurrence or progress entry. Tablet and narrow layouts use responsive cards, touch controls and a horizontally scrollable heatmap.

Checks passed: 249 unit tests, all four history journeys in installed Chrome/Edge/Brave, and 13 existing habit/timer/PiP/shared-view journeys. History checks cover older work, correction/delete/Undo, quantity timer accounting, archived effort, weekly/flexible targets, week boundaries and account privacy. Type checking, changed-file lint, the production build and tablet/narrow-layout checks pass.

### Phase 5 — Motivation and light gamification

**Implemented — 12 October 2026.** See **Your journey** inside **Habits → Your work**. Use **Experience** on Habits to choose the amount of feedback.

- Add goal-completion celebrations, milestone badges, the habit journey, next-milestone progress, daily/weekly recaps and supportive return-after-a-gap messages.
- Add quiet-mode controls, optional sound and reduced-motion behaviour. Use clear rules for each message and reward.
- **Ready when:** partial work feels acknowledged, completion feels satisfying, old effort stays visible, and each earned milestone is celebrated once. No rewards from planned time, skips or duplicate saves.

What is available now:

- A brief, dismissible reward after a successful manual/timer save: acknowledge a first effort, celebrate a newly met goal, show newly earned milestones or welcome a return after a gap. Partial work keeps its positive saved feedback and progress-ring update. The reward does not block app controls; it fades after a few seconds.
- A personal journey with earned badges and progress toward the next milestone. Milestones recognise the first day of saved effort; 1/5/25/100 hours invested; 5/20/50/100 completed scheduled goals; completed weekly/flexible targets and a first monthly goal. Actual work remains the measure—there are no points, rankings or streak penalties.
- Goals use historical schedules and targets. Multiple prompts/sessions do not multiply one goal; flexible habits count distinct completed days and their weekly target separately. Timer time for quantity/done habits earns time milestones without marking the quantity/done goal complete. Archived history remains visible, including work saved on the day of archiving.
- **Today** shows a small daily/weekly recap: habits with saved effort, distinct days worked and actual recorded minutes. Partial work and archived habits are included. Last week's actual work remains visible without inventing comparisons or encouragement.
- Optional nudges before starting use the habit's reason or suggest a manageable first step. After seven days without saved work, offer a gentle welcome back; recognise the first newly saved effort today once. During a timer, a quiet text cue appears after five tracked minutes and reminds the user to review/save. It awards nothing while the timer runs.
- Account-persisted controls for quiet mode, celebrations, sound, nudges and recaps. Sound is off by default, with an explicit **Test sound** button after enabling it. Quiet mode hides extra feedback while keeping the journey and saved work visible. Animations respect reduced-motion settings; unsupported/blocked audio never interrupts recording.
- Badges recalculate from non-deleted saved records after correction, deletion or Undo. A separate habit-owned ledger prevents the same milestone from celebrating again across concurrent saves, retries, refreshes or restored entries. Existing achievements are remembered silently when new work is saved. Viewing a journey creates no award/progress record; a skip, plan, unsaved timer or failed save earns nothing.

The additive migration is `drizzle/0015_nasty_morlocks.sql`, applied locally. It adds habit experience preferences and the milestone ledger. Milestone claims commit in the same transaction as the recorded work. Account JSON export includes preferences and the habit-owned ledger. Habits remain independent of tasks, projects, resources and docs.

Checks passed: 266 unit tests, all four motivation journeys in installed Chrome/Edge/Brave, and 17 existing habit/timer/PiP/calendar/history journeys. Browser checks cover saved-work rewards, correction and milestone re-earning without repeated celebration, concurrent retries, return-after-a-gap deduplication, actual opt-in sound preview, quiet mode, reduced motion and account privacy. Type checking, changed-file lint, the production build and tablet/narrow-layout checks pass.

### Phase 6 — Polish and release checks

**Implemented — 12 October 2026.** Choose a starter in **New habit**, or choose **Pomodoro** when starting a timer.

- Add optional Pomodoro work/break cycles and starter templates. Breaks never count as habit time.
- Verify keyboard/screen-reader access, touch targets, empty/loading/error states, tablet portrait/landscape layouts and browser fallbacks.
- Run full journeys from creating a habit through scheduling, calendar Start, timer/manual recording, completion, history, correction, archive and export.
- **Ready when:** the whole flow works on the target desktop browsers, with the supported tablet experience and its limits clearly communicated.

What is available now:

- Six editable starters: reading, flexible movement, a mindful pause, weekly creative practice, page quantity and daily reflection. **Use starter** fills the form; review the goal, schedule and duration before **Create habit**. Templates create no saved work, reminder or entity association.
- Optional **Pomodoro** sessions with 1–120 work minutes per round, 1–60 break minutes and 1–12 rounds (at most 24 hours of work). After work expires, choose **Start break**; after a break, choose **Start next round**, or explicitly skip the break. The final round leads to review/save without an unnecessary final break.
- Work caps at each phase's end even after sleep, refresh or background throttling. Waiting between phases, paused time and breaks never count as work. Finish early or during a break, review actual working minutes and save explicitly. Expiry and phase transitions create no progress, completion or reward.
- The same session and controls work in the app and supported desktop pop-out. Break/work state survives refresh and account-scoped offline command queues; revisions and action IDs protect concurrent transitions and retries. Quantity/done habits record timer time separately from their goals.
- Touch-sized heatmap day controls, keyboard-operable charts and forms, labelled work/break clocks and phase announcements without announcing every second. The timer dock and start dialog scroll within smaller screen heights. Setup hints describe the available timer/reminders instead of future phases.
- Loading, retry and empty states use the existing shared feedback. Tablet portrait, landscape and narrow layouts retain the in-app timer; unsupported pop-out stays visibly unavailable. Browser/device sleep can suspend rendering or alerts, so users review recovered work before saving. Native Android overlays and reliable closed-browser reminders remain outside this implementation.

The additive migration is `drizzle/0016_slow_butterfly.sql`, applied locally. Its nullable cycle-state column preserves existing countdown/stopwatch sessions. Account JSON exports include the saved cycle configuration/state alongside actual work intervals and confirmed time. Habits remain independent of tasks, projects, resources and docs.

Tablet checks use portrait (768×1024), landscape (1024×768) and narrow (390×844) desktop-browser viewports. Keyboard focus, dialog containment, accessible control names and live-phase semantics are checked; physical Android hardware and a manual screen-reader session have not been tested.

Checks passed: 282 unit tests; three release journeys in each installed Chrome/Edge/Brave browser (nine runs); 20 existing habit/history/reward/calendar/reminder/timer journeys; and Pomodoro pop-out controls in all three installed desktop browsers (three runs). The release journey covers starter review, creation, scheduling, calendar Start, work/break transitions, explicit recording, completion, correction, archived history and export. Additional checks cover offline transitions, concurrent retries, quantity time, loading/retry/empty states, keyboard access and layout overflow. Type checking, changed-file lint, the production build and diff checks pass. Screenshots of the start dialog, history and recovered pop-out timer were reviewed.

Leave native Android overlays, app blocking, health integrations, social leaderboards, AI coaching and elaborate game economies for later.

## Inspiration researched

These are design references; the proposal above is my recommended combination.

- [Habitify](https://habitify.me/onboarding-instruction/use-timer): habit-linked timers, partial sessions and Pomodoro.
- [TickTick](https://help.ticktick.com/articles/7055781878401335296): habit goals, flexible frequency and Start Focus; [its widgets](https://help.ticktick.com/articles/7055780404896202752) show heatmaps and focus distribution.
- [Streaks](https://streaksapp.com/): streaks that respect selected days.
- [Loop](https://github.com/iSoron/uhabits): flexible schedules and long-term consistency that survives occasional misses.
- [Strides](https://www.stridesapp.com/): target-versus-actual progress and trends.
- [Forest](https://forestapp.cc/): make accumulated effort visible; use gentle milestones here.
