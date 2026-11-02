# Overconfidence exercise

This is a results page for a class exercise on overconfidence. Students answer 10 questions. For each one they give a low guess (5th percentile), a best guess (50th), and a high guess (95th). They do this alone first and then in teams. The page shows how often the true answer fell inside each range and names a winning team and a winning individual.

The page works offline and uploads nothing.

## Run it in your class

1. Download the repo (on GitHub, **Code > Download ZIP**) and unzip it.
2. Set your questions and answers. See the next section. The download does not include answers, so you must add them before the page will show results.
3. In Qualtrics, choose **Create a project > Survey > From a file** and import `surveys/individual_survey.qsf`. Do the same for `surveys/team_survey.qsf`. Preview each survey once.
4. To see the page with made-up data, double-click `index.html`, click both **Use demo data** buttons, and click **Show results**.
5. In class, hand out the paper worksheets in `worksheets/`. The individual worksheet explains the 5th, 50th, and 95th percentiles, which the surveys do not. Tell students not to use ChatGPT, other AI tools, or the web. This is an offline exercise, and the answers should come from what students already know. Students fill in the individual worksheet alone and enter their answers in the individual survey. Then they form teams and fill in the team worksheet together. One person per team submits the team survey. Everyone on a team enters the same team number in both surveys.
6. Export each survey as a CSV from Qualtrics (**Data & Analysis > Export & Import > Export Data**, default settings). Open `index.html`, load the individual file, then the team file, and click **Show results**.

The winner sections stay collapsed until you click them. You can show the graphs first and reveal the winners when you are ready.

## Change the questions

The questions appear in three places: the individual survey, the team survey, and the answer key (`answer_key.js`). They must be in the same order in all three. Question 1 is scored against answer 1, question 2 against answer 2, and so on. The script below keeps the order for you.

**With the script.** This needs Python 3. Copy `questions.example.csv` to `questions.csv`. Replace the rows with your own questions and answers, in the order students should see them. Open Terminal (Mac) or Command Prompt (Windows), go to the unzipped folder, and run:

```
python3 tools/set_questions.py questions.csv
```

On Windows, type `python` instead of `python3`. The script rewrites both surveys and the answer key. Put units in the question ("in millions") and give the answer in those units. Put quotes around any cell that contains a comma. You can use more or fewer than 10 questions.

**With Claude.** If you use Claude Code or Cowork in the Claude desktop app, open the folder and paste your questions and answers in order. The included `CLAUDE.md` tells Claude to run the script, check the result, and keep the answers off GitHub.

**By hand.** You can edit the questions in Qualtrics and type the answers under **Details** on the results page. Keep the same order in both surveys.

After any change, import the two updated `.qsf` files into Qualtrics. The script does not touch the worksheets, so edit the question table in both Word files to match.

The included surveys hold the questions from our 2026 Duke class. Questions 6, 7, 8, and 10 are tied to that class or year. Replace or update them before you use the surveys elsewhere.

## How scoring and the winner work

A hit means the true answer is between the low and high guess. A blank question counts as a miss.

A well-calibrated 90% range should catch the answer on about 90% of the questions, or 9 of 10. So the winner is the team closest to that target, not the team with the most hits. If two scores are equally far from the target, the lower one wins. With 10 questions the order is 9, 8, 10, 7, 6, and so on. Individuals are ranked the same way, separately.

If teams tie for first, each question becomes a point. Among the tied teams that hit it, the team with the narrowest range gets the point. The team with the most points wins.

The page also shows "statisticized" teams. These combine each team's individual answers with no discussion. The range runs from the lowest low guess to the highest high guess among members.

## If something looks off

- The page warns you if a file looks like it went in the wrong slot.
- Qualtrics preview and test responses are left out unless you tick **Include preview and test responses**.
- Results stay hidden until every question has an answer in the key. Open **Details** to fill in any that are missing.
- Reloading the page clears the loaded files.
- Do not rename the survey export tags `team_num`, `ind_name`, `group_names`, or `est`. The page looks for them.

## Privacy

Nothing is uploaded. The Qualtrics exports contain students' first names, so keep them private. `answer_key.js` and `questions.csv` hold the real answers. Both are listed in `.gitignore`, so they stay off GitHub.

## Files

- `index.html`: the results page
- `core.js`: scoring and the demo data
- `answer_key.js`: your answers (created by the script, not included in the download)
- `surveys/`: the two Qualtrics surveys
- `worksheets/`: the paper instructions and answer sheets for students
- `tools/set_questions.py`: writes your questions into both surveys and the answer key
- `questions.example.csv`: a template for `questions.csv`
- `tools/test.js`: checks the scoring (`node tools/test.js`)
- `CLAUDE.md`: instructions for Claude

## Citation

Soll, J. B., & Klayman, J. (2004). Overconfidence in interval estimates. *Journal of Experimental Psychology: Learning, Memory, and Cognition, 30*(2), 299-314. https://doi.org/10.1037/0278-7393.30.2.299

## License

MIT. See `LICENSE`.
