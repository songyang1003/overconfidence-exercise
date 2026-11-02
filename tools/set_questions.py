#!/usr/bin/env python3
"""Put one list of questions into both Qualtrics surveys and the answer key.

Usage: python3 tools/set_questions.py questions.csv

questions.csv has two columns, question and answer, one row per question, in
the order students should see them. Row 1 of the CSV becomes est_1 in the
Qualtrics export and item 1 in answer_key.js, row 2 becomes est_2, and so on.
An answer may be left blank and typed into the results page later.
"""
import csv, html, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SURVEYS = [ROOT / "surveys" / "individual_survey_example.qsf", ROOT / "surveys" / "team_survey_example.qsf"]
KEY = ROOT / "answer_key.js"


def read_questions(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows or not {"question", "answer"} <= set(rows[0]):
        sys.exit("The CSV needs a header row with the columns: question,answer")
    out = []
    for i, r in enumerate(rows, 1):
        if None in r:
            sys.exit(f"Row {i} has more than two columns. Put quotes around text or numbers that contain commas.")
        q = (r["question"] or "").strip()
        a = (r["answer"] or "").strip().replace(",", "")
        if not q:
            sys.exit(f"Row {i}: the question is empty.")
        if a:
            try:
                a = float(a)
                a = int(a) if a.is_integer() else a
            except ValueError:
                sys.exit(f"Row {i}: the answer '{r['answer']}' is not a number.")
        out.append((q, a))
    return out


def set_matrix(qsf_path, questions):
    d = json.loads(qsf_path.read_text(encoding="utf-8"))
    hits = [e for e in d["SurveyElements"] if e["Element"] == "SQ" and e["Payload"].get("DataExportTag") == "est"]
    if len(hits) != 1:
        sys.exit(f"{qsf_path.name}: expected one question with export tag 'est', found {len(hits)}.")
    p = hits[0]["Payload"]
    ids = [str(i) for i in range(1, len(questions) + 1)]
    p["Choices"] = {k: {"Display": html.escape(q, quote=False)} for k, (q, _) in zip(ids, questions)}
    p["ChoiceOrder"] = ids
    p["NextChoiceId"] = len(ids) + 1
    qsf_path.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")


def write_key(questions):
    lines = ",\n".join(f"  {{ label: {json.dumps(q, ensure_ascii=False)}, answer: {json.dumps(a)} }}" for q, a in questions)
    KEY.write_text("// Real answers for the class. Keep this file off GitHub (it is in .gitignore).\n"
                   f"window.CE_KEY = [\n{lines}\n];\n", encoding="utf-8")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    questions = read_questions(sys.argv[1])
    for s in SURVEYS:
        set_matrix(s, questions)
    write_key(questions)
    blank = [str(i) for i, (_, a) in enumerate(questions, 1) if a == ""]
    print(f"Wrote {len(questions)} questions to {', '.join(s.name for s in SURVEYS)} and {KEY.name}.")
    if blank:
        print("No answer yet for question " + ", ".join(blank) + ". Add it to answer_key.js or type it on the results page.")


if __name__ == "__main__":
    main()
