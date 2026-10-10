# Chat

Message bubbles for mentor-mentee messaging and the CV enrichment chatbot.

- `.bubble` for the other party or the bot (left, `surface-sunken`), `.bubble-me` for the viewer (right, `accent`).
- `.bubble-meta` under a bubble: sender and time. `.bubble-system` for centred event lines.
- Composer: `input-group` with an `Input` and an icon-only primary send button in a `CardFooter`.

Consumer provides: the messages; layout via `.chat`.
