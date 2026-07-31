// Unit conversion and the calorie maths. These numbers are shown as targets
// people eat to, so rounding and the deficit floor are worth pinning down.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers/sandbox");

const app = loadApp();
const {
  DEFAULT_PROFILE, kgToLb, lbToKg, cmToIn, inToCm, displayWeight, inputWeightToKg,
  displayHeight, formatHeight, weightUnit, bmr, tdee, nutritionTargets, bmi,
  profileComplete, initials,
} = app;

const metric = { ...DEFAULT_PROFILE, units: "metric" };
const imperial = { ...DEFAULT_PROFILE, units: "imperial" };
const person = { ...metric, name: "Sam Doe", age: 30, heightCm: 180, weightKg: 80, sex: "male" };

test.describe("unit conversion", () => {
  test("round-trips weight and height", () => {
    for (const kg of [50, 77.5, 120]) {
      assert.ok(Math.abs(lbToKg(kgToLb(kg)) - kg) < 1e-9, `kg round trip at ${kg}`);
    }
    for (const cm of [150, 175.4, 200]) {
      assert.ok(Math.abs(inToCm(cmToIn(cm)) - cm) < 1e-9, `cm round trip at ${cm}`);
    }
  });

  test("uses a real pound, not an approximation", () => {
    assert.ok(Math.abs(kgToLb(1) - 2.2046226218) < 1e-8);
  });

  test("labels and displays in the chosen unit", () => {
    assert.equal(weightUnit(metric), "kg");
    assert.equal(weightUnit(imperial), "lb");
    assert.equal(displayWeight(80, metric), 80);
    assert.equal(displayWeight(80, imperial), 176.4);
  });

  test("parses typed input back to kilograms", () => {
    assert.equal(inputWeightToKg("80", metric), 80);
    // Round-trip through what the field would actually show, which is rounded
    // to one decimal — so the tolerance has to allow for that rounding.
    const shown = String(displayWeight(80, imperial));
    assert.ok(Math.abs(inputWeightToKg(shown, imperial) - 80) < 0.05, `got ${inputWeightToKg(shown, imperial)}`);
  });

  test("rejects impossible or empty input", () => {
    for (const bad of ["", "abc", "0", "-5", null, undefined]) {
      assert.equal(inputWeightToKg(bad, metric), null, `should reject ${String(bad)}`);
    }
  });

  test("formats height per unit system", () => {
    // Spread first: objects built inside the sandbox carry that context's
    // Object.prototype, which deepStrictEqual treats as a mismatch.
    assert.deepEqual({ ...displayHeight(180, metric) }, { cm: 180 });
    assert.deepEqual({ ...displayHeight(180, imperial) }, { feet: 5, inches: 11 });
    assert.equal(formatHeight(180, metric), "180 cm");
    assert.equal(formatHeight(180, imperial), "5′ 11″");
    assert.equal(formatHeight(null, metric), "—");
  });
});

test.describe("energy and macros", () => {
  test("returns null until the profile has what it needs", () => {
    assert.equal(bmr(metric), null);
    assert.equal(tdee(metric), null);
    assert.equal(nutritionTargets(metric), null);
    assert.equal(bmi(metric), null);
  });

  test("computes Mifflin-St Jeor with the right sex offset", () => {
    // 10*80 + 6.25*180 - 5*30 = 1775, then +5 male / -161 female / -78 unspecified
    assert.equal(bmr({ ...person, sex: "male" }), 1780);
    assert.equal(bmr({ ...person, sex: "female" }), 1614);
    assert.equal(bmr({ ...person, sex: "unspecified" }), 1697);
  });

  test("targets sit below maintenance with protein scaled to bodyweight", () => {
    const t = nutritionTargets(person);
    assert.equal(t.maintenance, Math.round(1780 * 1.5));
    assert.ok(t.calories < t.maintenance, "a fat-loss target must be under maintenance");
    assert.ok(t.maintenance - t.calories >= 400 && t.maintenance - t.calories <= 500,
      `deficit was ${t.maintenance - t.calories}`);
    assert.equal(t.protein, Math.round(80 * 1.8));
    assert.ok(t.fat > 0 && t.carbs >= 0);
  });

  test("never prescribes a starvation target", () => {
    const tiny = { ...metric, age: 80, heightCm: 140, weightKg: 40, sex: "female" };
    assert.ok(nutritionTargets(tiny).calories >= 1200, "1200 kcal is the floor");
  });

  test("macros roughly account for the calorie total", () => {
    const t = nutritionTargets(person);
    const fromMacros = t.protein * 4 + t.fat * 9 + t.carbs * 4;
    assert.ok(Math.abs(fromMacros - t.calories) <= 12, `macros summed to ${fromMacros} vs ${t.calories}`);
  });

  test("computes BMI", () => {
    assert.equal(bmi(person), Number((80 / 1.8 ** 2).toFixed(1)));
  });
});

test.describe("profile helpers", () => {
  test("knows when a profile is usable", () => {
    assert.equal(profileComplete(metric), false);
    assert.equal(profileComplete(person), true);
    assert.equal(profileComplete({ ...person, heightCm: null }), false);
  });

  test("builds initials, with a fallback", () => {
    assert.equal(initials("Sam Doe"), "SD");
    assert.equal(initials("sam"), "S");
    assert.equal(initials("  ada  lovelace "), "AL");
    assert.equal(initials(""), "👤");
    assert.equal(initials(null), "👤");
  });
});
