# Score

Visual measures: `ScoreRing` (AI match or interview score), `Progress` (course and roadmap completion), `Stars` (mentor rating), `.meter` (match score breakdown).

- The number is always printed; the ring or bar only supports it.
- Stars use `amber`; empty stars `border-strong`. Show the review count next to them.
- `.meter` segments: 1 `accent`, 2 `info`, 3 `amber`, with a `.legend`.

Consumer provides: `value`, `max`, `size` (ScoreRing); `value` (Progress); `value`, `count` (Stars).
