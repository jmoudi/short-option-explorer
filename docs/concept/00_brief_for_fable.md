# Brief for Fable: the grand concept of the options lab

You are Fable, the senior designer on this job. The user will rebuild the app from the ground up. Your job is the
grand concept: a white paper that turns a pile of good features into one app with one idea. You have the last say
on the concept. The envoy (the agent that built the current app with the user) sends you one evaluation after your
first draft; you weigh it and finalize. Then you hand Oppa a brief for the final capability list. Keep the whole job
to fewer than 5 turns: no long discussion.

## Why this exists, in the user's words

> "If you look at the GUI, do you see why? Because it is quite like the Roman Forum. It is layers upon layers upon
> layers of features that we added. And the problem is not the amount of features. It is that it was haphazardly
> grafted on top. It is accumulated. Like pottery shards became soil upon which a shopping mall stands. [...] zero
> evaluating things in a big picture sense. For example, there are now two different EV capabilities in different
> places. Both are each individually great, but there is no big picture concept. Likewise, you have added a worst
> loss estimation here. Good. You've also added, as I specified, stress calculation in compound. Good. But why, why
> are they not at least comparable, if not the same in UX kind? Or at least similarly named. Anything, any big
> picture concept."

On placements, the user asked for this level of abstraction: "rough, and I mean more abstract than concrete. Meaning
what I specified about the parent-tab capability vs the junior tab strip or that XYZ should be the graphic at top of
page and large, while ABC is smaller and below that etc. No need to specify placements of individual spans." And:
"Fable doesn't need to specify what each slider does, such details go into the final capability bucket list -- it
can just REFER to what will be in that list."

## The app today

"Short Options Comparer" is a single-file HTML options lab. A trader uses it to compare short-option trades
(strangles, straddles, covered calls, wings) on two leveraged ETFs, RAM (2×) and KORU (3×), with real listed chains.
There are two parent tabs:
- **Compare A vs B**, with junior tabs Comparison, Capture and Market facts.
- **Compounding**, with junior tabs Weeks, Stress and Credit kept: a weekly or monthly strategy repeated for N weeks
  on a margin account.

A Positions/Runs dock sits on the right, and a header menu holds theme, share and export.

## Read these (all read-only)

- Capability list by the envoy: `01_capabilities_envoy.md` (this folder).
- Capability list by Oppa, made independently: `02_capabilities_oppa.md` (this folder).
- The user's screenshot of the whole Compare page in dark mode: `user_screenshot_dark.webp` (this folder). It shows
  the "Roman Forum" plainly.
- The user's UX directives: `directive_UX.md`. Not all of it is carved in stone. It is written for a TSX app; the
  rebuild may or may not use React. The parts that matter for a concept are the ghetto principle, dark theming,
  1–2 softly glowing accents, few pills and cards, and font size carrying importance and parentage.
- The user's code directives: `directive_code.md`. These are for later. They matter to the concept only where they
  separate domain models from painting.
- History of the app by round: `../v10/STATUS_V10.md`.
- The live page, if you want to look:
  - Page: `/home/user/short-option-explorer/dist/ram_koru_lab_v10.html`.
  - Driver: Playwright, via require('/opt/node22/lib/node_modules/playwright'); never run "playwright install".
  - Scratch output goes only under `../fable_work/`.

## Standing rules from the user (carry them into the concept)

- **The user is a trader**, expert in finance, not an options-math specialist. Use plain labels and trader words.
- **Definition areas are not readings.** The places that define a position or run (cards, dock) carry no
  calculations. Readings live elsewhere, and market facts are a third kind.
- **The time unit is weeks** in Compounding. Never years in the GUI.
- **Rows by design.** A layout row exists by design, never because text overflowed. No flexbox jank.
- **Parent tabs hold capabilities; a junior tab strip sits under each parent.** The user set this structure. You
  may redesign what goes where.
- **Desktop only.** Dark theme.
- **Ghetto principle.** Rarely used options live in expandable submenus. The definition sidebar holds the
  instrument definition, not display settings for what we look at.
- **Banned words.** Never use "wrinkle", "seam" or "smell" anywhere.

## What to write

Write `03_grand_concept_fable.md` in this folder. It is a white paper. It covers:

1. **The diagnosis.** Name the accretion problems concretely: the overlap clusters in both lists, the parallel
   definition systems, the divergent names and forms.
2. **The organizing idea.** A small set of concepts that every capability belongs to. For each concept: its one
   name, its one UX form, and its one set of inputs. Example of the kind of thing meant, not a prescription: "a
   shock is defined once and read everywhere the same way". EV, worst loss vs stress, survival size, credit kept,
   time and odds basis must each end up as one concept with one name and one form.
3. **The information architecture.**
   - Parent tabs and junior strips.
   - What is the large graphic at the top of each page, and what sits smaller below it.
   - The sidebar's job.
   - Where settings live, and where explanations live.
   - At the level the user asked for: abstract and placement-rough. Refer to capabilities by their names in the final
     list; don't spell out each control.
4. **The shared vocabulary.** One glossary of names the whole app uses. Also the colour language.
5. **What is cut, merged or demoted**, and why.
6. **Open questions for the user**, if any (few).

## Then hand off to Oppa

When the concept is final, write `05_brief_for_oppa.md` in this folder. It tells Oppa how to write
`04_capabilities_final.md`. Oppa merges both capability lists (01 and 02) and organizes them under your concepts and
names. Oppa keeps each capability terse, with its knobs and outputs, and marks what is merged, renamed, demoted or
cut, per your concept. Make the brief self-contained; the envoy relays it to Oppa verbatim.
