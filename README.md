# Confidence exercise: results page

A single-page, browser-only tool for a class exercise on interval overconfidence (after Soll & Klayman, 2004). Students give 5th, 50th, and 95th percentile estimates for 10 questions; this page scores them and shows three groups side by side (individuals, teams, statisticized teams), then the team standings and the winning team.

## Use

1. Open `index.html` in a browser (double-click works; no server or internet needed).
2. **Individual survey file:** drop in the Qualtrics CSV (one row per student, with `team_num`, `ind_name` or `netID`, and `est_i_k` columns), or click **Use demo data**.
3. **Team survey file (optional):** drop in the team CSV (one row per team, with `team_num` and `est_i_k` columns; `netID` and a name column are allowed), or click **Use demo data**. Without it the page still works, and the Teams card and standings say no file is loaded.
4. **Show results.**

A file missing the required columns is rejected with a message, and any file already loaded stays loaded. A file with a suspicious shape shows a warning and a **Load anyway** button: about one row per team in step 1 (1.5 rows per team or fewer, across 3 or more teams), or more than about two rows per team in step 2. In step 2 the latest row per team is kept.

Demo and real data never mix. Loading a real file removes demo data from the other step, and clicking **Use demo data** removes a real file from the other step, each with a notice. Re-uploading a file keeps answers typed into the key unless the number of questions changes. If the demo replaced the key, the real key, including typed edits, comes back on the next real upload.

A preview-only file still loads for rehearsal. If one file has only preview or test responses and the other has live responses, a red alert appears at the top of the results page.

The "Include preview and test responses" box applies to both files. Loaded files are not kept if you reload the page.

To see the demo straight away, open `index.html?demo=1`. Add `&phase2=0` to see the page with no team file. The demo has a tie at the top, so the tiebreak display shows.

## Results page

- **Individuals:** every respondent to the individual survey with at least one answer, including people with no team number.
- **Teams:** team survey submissions, scored on the interval the team submitted.
- **Statisticized teams:** built per team number from the individual survey, with no discussion.
- **Team standings:** every team that submitted, in rank order, with the winner and the names the team typed in the team survey (`group_names`).
- **Winner:** a collapsed row at the top. Click it to open the winner card, standings, and tiebreak; it closes again each time you click Show results.
- **Graphs:** three side by side (Individuals, Teams, Statisticized teams).
- **Details:** answer key and hit rate by question.

## Data collection

Participants' data are collected with two Qualtrics surveys, one for individuals and one for teams. Example survey files are in `surveys/`; import them into Qualtrics with **Create a project > Survey > From a file**. Each survey asks for a team number, a name field (`ind_name` or `group_names`), and a 10-row text-entry matrix `est` with 5th, 50th, and 95th percentile columns. Survey IDs and owner IDs in these files are placeholders. Answers are not included in the survey files or in this repository.

To analyze a session, export each survey from Qualtrics (**Data & Analysis > Export & Import > Export Data > CSV**) and load both files on the setup page. Keep real participant exports out of version control.

## Scoring

- Hit: the true answer is inside [5th, 95th], endpoints included. A question left blank counts as a miss.
- Hits out of 10: per person, team, or statisticized team. A unit with no answers at all is left out. An answer needs both a 5th and a 95th.
- Statisticized team, per question: low is the lowest 5th among members, high is the highest 95th among members, and mid is the mean of members' 50ths. Only members with a complete, correctly ordered 5th/50th/95th on that question are used.
- Team: if a team submitted more than once, by the same person or by different members, the most recent submission is kept.
- Repeats (NetID in the individual file, team in the team file): an all-blank row never replaces a row with answers. Otherwise the later date wins, and if dates cannot be told apart, the later row in the file.
- Team numbers: `3`, `03`, `T3`, `#3`, `3.`, `3.0`, `Team 3`, and `Team-3` all mean team 3.
- A calibrated 90% interval should capture the answer on about 9 of 10 questions.

## Winner

Teams are ranked by closeness to 9 hits, not by most hits. At equal distance, the score below 9 wins: 9, 8, 10, 7, 6, 5, and so on.

The tiebreaker runs only if two or more teams share the top hit count. One point per question: among the tied teams that hit the question (endpoints included), the narrowest interval (95th minus 5th) gets the point, equal widths share it, and if no tied team hit the question the point is unallocated. The most points wins; a remaining tie gives joint winners. Widths and totals are compared with a small relative tolerance so floating-point noise cannot decide a winner.

## Privacy

Nothing is uploaded and the page makes no network requests. NetIDs are never shown on screen; the page shows names only, and a missing name appears as "(name not given)". If no names were collected, the winner card says "Names not collected" once. A name that merely repeats the person's NetID is treated as missing. The individuals export contains NetIDs and names, so keep it private. The team exports contain neither.

The winner card shows `group_names` from the team survey, exactly as the team typed it.

## Answer key (keep it private)

The real answers live in `answer_key.js`, which is listed in `.gitignore` so it is never published, along with `*.local.csv` (mock exports). Copy `answer_key.example.js` to `answer_key.js` and fill in your own items. The key is shown, and editable, under Details on the results page. If an answer is missing the results are hidden until you fill it in. The demo uses the questions from `answer_key.js` when it exists, and generic trivia otherwise.

## Files

- `index.html`: the interface
- `core.js`: parsing, scoring, standings, and the demo (also runs in Node)
- `test.js`: `node test.js` runs the checks (optionally `CE_SAMPLE_CSV=/path/to/export.csv` to check a real export parses)
- `answer_key.example.js`: template for the private key
- `mock_phase1.local.csv`, `mock_phase2.local.csv`: synthetic files in the real Qualtrics layout, for trying the upload path

Exercise design after Jack Soll. Reference: Soll, J. B., & Klayman, J. (2004). Overconfidence in interval estimates. *Journal of Experimental Psychology: Learning, Memory, and Cognition, 30*(2), 299-314.
