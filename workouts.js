// Workout data: 4-day Upper/Lower split.
// Designed for simultaneous fat loss + muscle building:
// compound lifts for strength/hypertrophy, moderate-high volume,
// optional cardio finishers for extra calorie burn.

const WORKOUTS = [
  {
    id: "day1",
    day: "Day 1",
    short: "Push",
    iconName: "dayPush",
    accent: "#7C4DFF",
    title: "Upper Body — Push",
    focus: "Chest, Shoulders, Triceps",
    warmup: "5 min brisk walk or bike + 2 sets of arm circles & band pull-aparts",
    exercises: [
      { name: "Barbell or Dumbbell Bench Press", videoId: "4Y2ZdHCOXok", sets: 4, reps: "8–10", rest: "90s", muscle: "Chest, Triceps", cue: "Lower bar to mid-chest, drive feet into floor, press up." },
      { name: "Incline Dumbbell Press", videoId: "awEEyL5zGvU", sets: 3, reps: "10–12", rest: "75s", muscle: "Upper Chest", cue: "30–45° bench. Control the descent, press up and slightly in." },
      { name: "Seated Dumbbell Shoulder Press", videoId: "fuQpuu--bMI", sets: 3, reps: "10–12", rest: "75s", muscle: "Shoulders", cue: "Keep ribs down, press straight overhead without arching lower back." },
      { name: "Dumbbell Lateral Raise", videoId: "pgrWjBfaFe8", sets: 3, reps: "12–15", rest: "60s", muscle: "Side Delts", cue: "Slight elbow bend, raise to shoulder height, lead with elbows." },
      { name: "Push-Up (finisher)", videoId: "WDIpL0pjun0", sets: 3, reps: "AMRAP", rest: "60s", muscle: "Chest, Core", cue: "Straight line head to heels, full range of motion." },
      { name: "Triceps Dip", videoId: "uaQZ2S9D8WY", sets: 3, reps: "10–12", rest: "60s", muscle: "Triceps", cue: "Elbows point back, lower until upper arms ~parallel to floor." },
      { name: "Overhead Triceps Extension", videoId: "fYqswDVbJDg", sets: 3, reps: "12–15", rest: "60s", muscle: "Triceps", cue: "Elbows stay close to head, full stretch at the bottom." },
    ],
    cardioFinisher: "Optional: 10–15 min incline treadmill walk (fat-loss boost)",
  },
  {
    id: "day2",
    day: "Day 2",
    short: "Quads",
    iconName: "daySquat",
    accent: "#FF4D8D",
    title: "Lower Body — Quads & Glutes",
    focus: "Quads, Glutes, Calves, Core",
    warmup: "5 min bike + bodyweight squats & leg swings x10 each",
    exercises: [
      { name: "Back Squat (or Goblet Squat)", videoId: "bEv6CCg2BC8", sets: 4, reps: "8–10", rest: "120s", muscle: "Quads, Glutes", cue: "Sit hips back and down, knees track over toes, chest up." },
      { name: "Leg Press", videoId: "B6rGDcfyPto", sets: 3, reps: "10–12", rest: "90s", muscle: "Quads, Glutes", cue: "Feet shoulder-width, don't let knees cave, control the negative." },
      { name: "Walking Lunge", videoId: "Pbmj6xPo-Hw", sets: 3, reps: "12 / leg", rest: "75s", muscle: "Quads, Glutes", cue: "Long step, drop back knee toward floor, push through front heel." },
      { name: "Leg Extension", videoId: "tTbJBUKnWU8", sets: 3, reps: "12–15", rest: "60s", muscle: "Quads", cue: "Slow and controlled, squeeze quads hard at the top." },
      { name: "Standing Calf Raise", videoId: "SVtg-1loH4c", sets: 4, reps: "15–20", rest: "45s", muscle: "Calves", cue: "Full stretch at bottom, pause at the top squeeze." },
      { name: "Plank", videoId: "mwlp75MS6Rg", sets: 3, reps: "45s hold", rest: "45s", muscle: "Core", cue: "Squeeze glutes, ribs down, straight line head to heels." },
      { name: "Jump Squat (finisher)", videoId: "tZjZxrAeVjg", sets: 3, reps: "15", rest: "60s", muscle: "Quads, Glutes, Power", cue: "Land soft with bent knees, reset before each rep." },
    ],
    cardioFinisher: "Optional: 15 min incline walk or 10 min bike sprints (30s on/30s off)",
  },
  {
    id: "day3",
    day: "Day 3",
    short: "Pull",
    iconName: "dayPull",
    accent: "#2E9BFF",
    title: "Upper Body — Pull",
    focus: "Back, Biceps, Rear Delts",
    warmup: "5 min row or bike + band pull-aparts x15",
    exercises: [
      { name: "Pull-Up or Lat Pulldown", videoId: "vw5Xmu5CIew", sets: 4, reps: "8–10", rest: "90s", muscle: "Lats, Biceps", cue: "Pull elbows down and back, chest to bar/handle, control the return." },
      { name: "Barbell or Dumbbell Row", videoId: "tLnlWj7LQ34", sets: 3, reps: "10–12", rest: "75s", muscle: "Back", cue: "Hinge forward, flat back, pull elbows past torso, squeeze shoulder blades." },
      { name: "Seated Cable Row", videoId: "4mRy8U542Fo", sets: 3, reps: "10–12", rest: "75s", muscle: "Mid Back", cue: "Chest up, drive elbows back, avoid leaning too far back." },
      { name: "Face Pull", videoId: "3pToT5_DUiY", sets: 3, reps: "15", rest: "60s", muscle: "Rear Delts", cue: "Pull to eye level, rotate hands, squeeze shoulder blades together." },
      { name: "Dumbbell Bicep Curl", videoId: "M2Nbw9tunoY", sets: 3, reps: "12", rest: "60s", muscle: "Biceps", cue: "Elbows pinned to sides, no swinging, full range of motion." },
      { name: "Hammer Curl", videoId: "BRVDS6HVR9Q", sets: 3, reps: "12", rest: "60s", muscle: "Biceps, Forearms", cue: "Neutral grip, control the descent." },
      { name: "Reverse Fly", videoId: "4Xr7bKE_fxE", sets: 3, reps: "15", rest: "60s", muscle: "Rear Delts", cue: "Slight bend in elbows, lift arms out to the sides, squeeze at top." },
    ],
    cardioFinisher: "Optional: 10 min rowing machine, steady pace",
  },
  {
    id: "day4",
    day: "Day 4",
    short: "Hinge",
    iconName: "dayHinge",
    accent: "#00D49A",
    title: "Lower Body — Hamstrings, Glutes & Core",
    focus: "Hamstrings, Glutes, Core",
    warmup: "5 min bike + glute bridges x15 + hip hinges x10",
    exercises: [
      { name: "Romanian Deadlift", videoId: "_oyxCn2iSjU", sets: 4, reps: "8–10", rest: "120s", muscle: "Hamstrings, Glutes", cue: "Soft knees, push hips back, flat back, feel the hamstring stretch." },
      { name: "Hip Thrust", videoId: "xDmFkJxPzeM", sets: 3, reps: "10–12", rest: "90s", muscle: "Glutes", cue: "Shoulders on bench, drive hips up, squeeze glutes hard at the top." },
      { name: "Bulgarian Split Squat", videoId: "DeCnHqrN22U", sets: 3, reps: "10 / leg", rest: "75s", muscle: "Quads, Glutes", cue: "Back foot elevated, most weight on front leg, controlled descent." },
      { name: "Lying or Seated Leg Curl", videoId: "PXG69tKDHoc", sets: 3, reps: "12–15", rest: "60s", muscle: "Hamstrings", cue: "Slow negative, squeeze hamstrings at the top of the curl." },
      { name: "Russian Twist", videoId: "onDjITj9AHI", sets: 3, reps: "20 (10/side)", rest: "45s", muscle: "Obliques", cue: "Lean back slightly, rotate from the torso, controlled tempo." },
      { name: "Hanging or Lying Knee Raise", videoId: "Pr1ieGZ5atk", sets: 3, reps: "12–15", rest: "60s", muscle: "Lower Abs", cue: "Curl hips up, avoid swinging, control the descent." },
      { name: "Side Plank", videoId: "NXr4Fw8q60o", sets: 3, reps: "30s / side", rest: "30s", muscle: "Obliques", cue: "Straight line head to feet, hips lifted and stacked." },
    ],
    cardioFinisher: "Optional: 20 min steady-state cardio (bike, walk, or elliptical)",
  },
];

const NUTRITION_TIPS = [
  {
    title: "Calorie Balance",
    body: "To lose fat while building muscle, aim for a small calorie deficit (roughly 300–500 calories below maintenance). Too large a deficit makes it hard to build or even keep muscle.",
  },
  {
    title: "Protein First",
    body: "Target about 0.7–1g of protein per pound of bodyweight per day (or ~1.6–2.2g/kg). Protein preserves and builds muscle even while in a calorie deficit — prioritize it at every meal.",
  },
  {
    title: "Don't Fear Carbs & Fats",
    body: "Carbs fuel your gym sessions, fats support hormones. Fill remaining calories with whole foods: vegetables, fruit, whole grains, nuts, and healthy oils.",
  },
  {
    title: "Hydration & Sleep",
    body: "Aim for 7–9 hours of sleep and steady water intake. Recovery is where muscle is actually built — training just provides the stimulus.",
  },
  {
    title: "Progressive Overload",
    body: "Each week, aim to add a little weight, a rep, or better form on your lifts. Small consistent increases over months drive both the muscle and metabolism that support fat loss.",
  },
];
