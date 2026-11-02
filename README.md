# Overconfidence exercise

This is a results page for a class exercise on overconfidence in interval estimates. Students answer 10 questions with a 5th, 50th, and 95th percentile estimate, first on their own and then in teams. The page scores both surveys and shows how often the true answer fell inside each range. It also names a winning team and a winning individual.

Everything runs in the browser. Nothing is uploaded, and the page works offline.

The exercise was designed by Jack Soll, and the interval measures follow Soll and Klayman (2004). See [Citation](#citation).

## Run it in your own class

1. Download the repo (on GitHub, **Code > Download ZIP**) and unzip it.
2. Choose your questions and answers (see [Change the questions](#change-the-questions)).
3. In Qualtrics, go to **Create a project > Survey > From a file** and import `surveys/individual_survey_example.qsf`. Do the same for `surveys/team_survey_example.qsf`. Preview each survey once.
4. Open `index.html?demo=1` in a browser to see the results page with made-up data.
5. In class, students take the individual survey on their own. Then they form teams, and one person per team submits the team survey. Everyone on a team types the same team number in both surveys.
6. Export each survey as a CSV from Qualtrics (**Data & Analysis > Export & Import > Export Data**, default labels). Open `index.html`, load the individual file and then the team file, and click **Show results**.

## Change the questions

The questions have to match in three places: the `est` matrix in each of the two surveys and the answer key in `answer_key.js`. Row 1 of the matrix is scored against answer 1, row 2 against answer 2, and so on. The script below keeps them in the same order, so you never have to edit the survey files by hand.

**With a script.** Copy `questions.example.csv` to `questions.csv` and replace the rows with your own questions and answers. Then run:

```
python3 tools/set_questions.py questions.csv
```

This rewrites both survey files and `answer_key.js`. You can use any number of questions. The page reads the count from the key, and the winning target becomes 90% of it (9 of 10, 10.8 of 12). Write units into the question ("in millions") and give the answer in the same units. Put quotes around any cell that contains a comma, such as `"384,400"`.

**With Claude.** Open the folder in Claude (Cowork or Claude Code) and paste your questions and answers in order, for example: "Replace the questions with these 10 and their answers." The repo includes a `CLAUDE.md` file that tells Claude to run the script above, check the result, and keep the answers out of GitHub. Then import the two updated `.qsf` files into Qualtrics.

**By hand.** You can also edit the matrix rows in Qualtrics and type the answers under **Details** on the results page. If you do, keep the same order in both surveys.

The example surveys contain the questions from our 2026 class. A few of them are tied to that class and year: question 6 (Tour de France 2026), questions 7 and 8 (2025 figures), and question 10 (alumni of the Duke Fuqua MQM program). Replace or update these before using the surveys elsewhere.

Do not rename the survey export tags `team_num`, `ind_name`, `group_names`, or `est`. The page looks for them.

## What the surveys ask

The individual survey asks for a team number, a first name (`ind_name`), and the 10-row `est` matrix. The team survey asks for a team number, the members' first names (`group_names`), and the same matrix. Neither file contains answers. Their survey and owner IDs are placeholders.

## Loading files

The page rejects a file that is missing the required columns and keeps whatever was loaded before. It asks before loading a file whose shape looks wrong. In the individual slot, that means about one row per team (1.5 or fewer rows per team across at least 3 teams). In the team slot, it means more than about two rows per team.

Demo data and real data never mix. Loading a real file clears the demo from the other slot, and clicking **Use demo data** clears a real file from the other slot. A message says so each time. Answers typed into the key survive a re-upload unless the number of questions changes.

Qualtrics preview and test responses are left out unless you tick **Include preview and test responses**. A file with only previews still loads, which is handy for a rehearsal. If one file has only previews and the other has live responses, a red alert appears on the results page.

Files are not saved. Reloading the page clears them. To see the page without a team file, open `index.html?demo=1&phase2=0`.

## Results page

The page shows three graphs side by side:

- Individuals: everyone in the individual survey who answered at least one question, including people with no team number.
- Teams: each team's submission in the team survey, scored on the range the team agreed on.
- Statisticized teams: built from each team's members in the individual survey, with no discussion. For each question, the low end is the lowest 5th among members and the high end is the highest 95th.

Above the graphs are two collapsed rows, Team winner and Individual winner. Each opens to the winner, the standings, and the tiebreak if one was needed. They close again each time you click **Show results**, so you can project the graphs before revealing the winners. The individual standings list only the top five (more if more people are tied at the top), so the whole class's scores are not projected. If the winning name and team number appear more than once in the individual survey, a red note asks you to check before awarding a prize.

**Details** shows the answer key, which you can edit, and the hit rate for each question. The results stay hidden until every question has an answer.

## Scoring

A hit means the true answer is inside the range from the 5th to the 95th percentile, endpoints included. A blank question counts as a miss, and a range needs both a 5th and a 95th. A person or team that left every question blank is left out.

For statisticized teams, the middle estimate is the mean of members' 50th percentiles. Only members with a complete, correctly ordered 5th/50th/95th on that question count toward it.

If a team submitted the team survey more than once, the latest submission counts. An all-blank row never replaces one with answers. When dates tie, the later row in the file wins.

Team numbers are read loosely: `3`, `03`, `T3`, `#3`, `3.`, `3.0`, `Team 3`, and `Team-3` all count as team 3.

## Winner

A well-calibrated 90% range should catch the answer on about 9 of 10 questions. So teams are ranked by how close they come to 90% of the questions, not by the most hits. With 10 questions the order is 9, 8, 10, 7, 6, 5, and so on. When two scores are the same distance from the target, the lower one wins. Individuals are ranked the same way, separately.

The tiebreaker runs only when two or more teams share the top score. Each question is worth one point. Among the tied teams that hit it, the team with the narrowest range (95th minus 5th) gets the point. Equal widths split the point. If no tied team hit the question, nobody gets it. The team with the most points wins, and a tie that remains gives joint winners. Widths and points are compared with a small tolerance so rounding cannot decide the result.

## Privacy

The page makes no network requests. It shows first names, never NetIDs, and a missing name appears as "(name not given)". The winner card shows `group_names` exactly as the team typed it. Both exports contain names, so keep them private and out of version control.

## The answer key stays private

`answer_key.js` and `questions.csv` hold the real answers. Both are in `.gitignore`, along with `*.local.csv` (mock exports), so they are never published. If `answer_key.js` is missing, the demo uses generic trivia questions instead.

## Files

- `index.html`: the page
- `core.js`: parsing, scoring, standings, and the demo (also runs in Node)
- `test.js`: run `node test.js` to check the scoring. Add `CE_SAMPLE_CSV=/path/to/export.csv` to check that a real export parses.
- `tools/set_questions.py`: writes one list of questions into both surveys and the answer key
- `questions.example.csv`: a template for `questions.csv`
- `answer_key.example.js`: a template for `answer_key.js`
- `surveys/`: the two Qualtrics surveys
- `CLAUDE.md`: instructions for Claude when it edits this repo
- `CITATION.cff`, `LICENSE`

## Citation

Soll, J. B., & Klayman, J. (2004). Overconfidence in interval estimates. *Journal of Experimental Psychology: Learning, Memory, and Cognition, 30*(2), 299-314. https://doi.org/10.1037/0278-7393.30.2.299

To cite this tool, use the **Cite this repository** button on GitHub.

## License

MIT. See `LICENSE`.
