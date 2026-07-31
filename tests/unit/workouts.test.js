// The workout data drives the schedule, the palette and every screen. A typo
// here (a duplicate id, a missing icon, a malformed video id) shows up as a
// blank badge or an unplayable video rather than a crash, so it's asserted.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers/sandbox");

const { WORKOUTS, NUTRITION_TIPS, ICON_PATHS, DAY_ACCENTS } = loadApp();

test.describe("WORKOUTS", () => {
  test("has categories with unique ids", () => {
    assert.ok(WORKOUTS.length >= 4, "expected a handful of categories");
    const ids = WORKOUTS.map((w) => w.id);
    assert.equal(new Set(ids).size, ids.length, "workout ids must be unique");
  });

  test("never outgrows the palette without someone noticing", () => {
    assert.ok(
      WORKOUTS.length <= DAY_ACCENTS,
      `WORKOUTS has ${WORKOUTS.length} entries but the palette only makes ${DAY_ACCENTS} accents — raise DAY_ACCENTS in palette.js`
    );
  });

  test("every category carries the fields the UI reads", () => {
    for (const w of WORKOUTS) {
      for (const field of ["id", "day", "short", "iconName", "accent", "title", "focus", "warmup", "cardioFinisher"]) {
        assert.ok(w[field], `${w.id} is missing ${field}`);
      }
      assert.match(w.accent, /^#[0-9a-f]{6}$/i, `${w.id} accent should be a 6-digit hex`);
      assert.ok(ICON_PATHS[w.iconName], `${w.id} points at an icon that doesn't exist: ${w.iconName}`);
    }
  });

  test("stays short enough to actually finish", () => {
    for (const w of WORKOUTS) {
      assert.ok(w.exercises.length >= 3, `${w.id} has only ${w.exercises.length} exercises`);
      assert.ok(w.exercises.length <= 5, `${w.id} has ${w.exercises.length} exercises — sessions should stay tight`);
    }
  });

  test("every exercise is complete and links a real video id", () => {
    for (const w of WORKOUTS) {
      for (const ex of w.exercises) {
        for (const field of ["name", "videoId", "sets", "reps", "rest", "muscle", "cue"]) {
          assert.ok(ex[field], `${w.id} / ${ex.name || "?"} is missing ${field}`);
        }
        // YouTube ids are always exactly 11 url-safe characters.
        assert.match(ex.videoId, /^[\w-]{11}$/, `${w.id} / ${ex.name} has a malformed videoId`);
        assert.ok(Number.isInteger(ex.sets) && ex.sets > 0, `${w.id} / ${ex.name} sets`);
        // The rest chip parses this with parseInt to seed the timer.
        assert.ok(parseInt(ex.rest, 10) > 0, `${w.id} / ${ex.name} rest must start with a number`);
      }
    }
  });

  test("no category repeats an exercise within itself", () => {
    for (const w of WORKOUTS) {
      const names = w.exercises.map((e) => e.name);
      assert.equal(new Set(names).size, names.length, `${w.id} lists the same exercise twice`);
    }
  });

  test("the icon set has a distinct glyph per category", () => {
    const glyphs = WORKOUTS.map((w) => ICON_PATHS[w.iconName]);
    assert.equal(
      new Set(glyphs).size,
      glyphs.length,
      "two categories render the same pictogram — they'd be indistinguishable in the week strip"
    );
  });
});

test.describe("NUTRITION_TIPS", () => {
  test("each tip has a title and body", () => {
    assert.ok(NUTRITION_TIPS.length > 0);
    for (const tip of NUTRITION_TIPS) {
      assert.ok(tip.title, "tip missing title");
      assert.ok(tip.body && tip.body.length > 40, `tip "${tip.title}" is too thin to be useful`);
    }
  });
});
