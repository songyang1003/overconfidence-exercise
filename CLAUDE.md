# Notes for Claude

This repo is a browser page that scores a class exercise on interval overconfidence. Read README.md first.

## When someone asks to change the questions

The questions live in three places that must stay in the same order: the `est` matrix in `surveys/individual_survey_example.qsf`, the `est` matrix in `surveys/team_survey_example.qsf`, and `answer_key.js`. Row k of the matrix is exported by Qualtrics as `est_k_1`, `est_k_2`, `est_k_3` (5th, 50th, 95th), and the page scores it against item k of the key.

1. Put the person's questions and answers into `questions.csv` with the header `question,answer`, one row per question, in the order students should see them. Quote any cell that contains a comma. Keep units in the question text (for example "in millions") and give the answer in those same units.
2. Run `python3 tools/set_questions.py questions.csv`. It rewrites both survey files and `answer_key.js` from that one list. Do not edit the matrices or the key by hand.
3. Run `node test.js` and open `index.html?demo=1` to check that the demo shows the new questions.
4. Tell the person to import both `.qsf` files into Qualtrics (Create a project > Survey > From a file) and preview them once.

Never commit `answer_key.js` or `questions.csv`; both hold real answers and are in `.gitignore`. Do not rename the export tags `team_num`, `ind_name`, `group_names`, or `est`, since the page looks for them.
