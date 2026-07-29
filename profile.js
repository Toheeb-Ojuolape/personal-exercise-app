// Local profile + derived nutrition targets.
// Everything lives in localStorage — no account server, no data leaves the device.

const PROFILE_KEY = "fitfour.profile";

// Weekday numbers as returned by Date#getDay(): 0 = Sunday … 6 = Saturday.
const DEFAULT_TRAINING_DAYS = [1, 2, 4, 5]; // Mon, Tue, Thu, Fri

const DEFAULT_PROFILE = {
  name: "",
  sex: "unspecified", // male | female | unspecified
  age: null,
  heightCm: null,
  weightKg: null,
  goalWeightKg: null,
  units: "metric", // metric | imperial
  trainingDays: DEFAULT_TRAINING_DAYS,
  avatar: null, // square JPEG data URL, downscaled before storage
};

function getProfile() {
  try {
    return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile(patch) {
  const next = { ...getProfile(), ...patch };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  return next;
}

// ---------- profile photo ----------
// localStorage holds ~5MB of *string* data, and a phone photo is several MB
// before base64 inflates it by a third. So the picked image is center-cropped
// and downscaled to a small square JPEG — roughly 15–30KB — before storage.
const AVATAR_PX = 256;
const AVATAR_QUALITY = 0.85;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No image was selected."));
    if (!file.type.startsWith("image/")) return reject(new Error("That file isn't an image."));
    if (file.size > MAX_UPLOAD_BYTES) return reject(new Error("That image is too large. Pick one under 25MB."));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That image couldn't be opened. Try a JPEG or PNG."));
      // Browsers apply EXIF orientation when decoding, so drawing is upright.
      img.onload = () => resolve(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Center-crop to a square and downscale. Resolves to a JPEG data URL. */
async function processAvatar(file) {
  const img = await loadImageFromFile(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error("That image appears to be empty.");

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    (img.naturalWidth - side) / 2, // crop from the centre
    (img.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_PX,
    AVATAR_PX
  );
  return canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
}

/** Persist the photo, reporting quota failures instead of throwing. */
function saveAvatar(dataUrl) {
  try {
    saveProfile({ avatar: dataUrl });
    return { ok: true };
  } catch {
    return { ok: false, error: "There's no room left in this browser's storage. Try removing some logged data." };
  }
}

const clearAvatar = () => saveProfile({ avatar: null });

function profileComplete(p = getProfile()) {
  return Boolean(p.name && p.age && p.heightCm && p.weightKg);
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "👤";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

// ---------- unit conversion (canonical storage is metric) ----------
const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

const kgToLb = (kg) => kg / KG_PER_LB;
const lbToKg = (lb) => lb * KG_PER_LB;
const cmToIn = (cm) => cm / CM_PER_IN;
const inToCm = (inches) => inches * CM_PER_IN;

function weightUnit(p = getProfile()) {
  return p.units === "imperial" ? "lb" : "kg";
}

/** Weight in the user's chosen display unit, rounded for UI. */
function displayWeight(kg, p = getProfile(), decimals = 1) {
  if (kg == null) return null;
  const v = p.units === "imperial" ? kgToLb(kg) : kg;
  return Number(v.toFixed(decimals));
}

/** Convert a number the user typed (in their unit) back to kg. */
function inputWeightToKg(value, p = getProfile()) {
  const n = parseFloat(value);
  if (!isFinite(n) || n <= 0) return null;
  return p.units === "imperial" ? lbToKg(n) : n;
}

function displayHeight(cm, p = getProfile()) {
  if (cm == null) return null;
  if (p.units === "imperial") {
    const totalIn = Math.round(cmToIn(cm));
    return { feet: Math.floor(totalIn / 12), inches: totalIn % 12 };
  }
  return { cm: Math.round(cm) };
}

function formatHeight(cm, p = getProfile()) {
  if (cm == null) return "—";
  const h = displayHeight(cm, p);
  return p.units === "imperial" ? `${h.feet}′ ${h.inches}″` : `${h.cm} cm`;
}

// ---------- energy + macro targets ----------

/** Mifflin-St Jeor basal metabolic rate (kcal/day). */
function bmr(p = getProfile()) {
  if (!p.weightKg || !p.heightCm || !p.age) return null;
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  if (p.sex === "male") return base + 5;
  if (p.sex === "female") return base - 161;
  return base - 78; // midpoint when unspecified
}

/**
 * Maintenance calories. Assumes the 4-day lifting schedule plus
 * ordinary daily activity — a moderate 1.5 multiplier.
 */
function tdee(p = getProfile()) {
  const b = bmr(p);
  return b == null ? null : Math.round(b * 1.5);
}

/**
 * Targets for losing fat while holding onto muscle:
 * a ~450 kcal deficit, protein at 1.8 g/kg, fat at 25% of calories,
 * carbs filling the remainder.
 */
function nutritionTargets(p = getProfile()) {
  const maintenance = tdee(p);
  if (maintenance == null) return null;

  const calories = Math.max(1200, Math.round((maintenance - 450) / 10) * 10);
  const protein = Math.round(p.weightKg * 1.8);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { maintenance, calories, protein, fat, carbs };
}

/** Body mass index, or null when height/weight are unknown. */
function bmi(p = getProfile()) {
  if (!p.weightKg || !p.heightCm) return null;
  const m = p.heightCm / 100;
  return Number((p.weightKg / (m * m)).toFixed(1));
}
