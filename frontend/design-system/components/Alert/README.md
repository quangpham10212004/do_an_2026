# Alert

Alerts report the result of an action or a condition that affects the whole page or card.

- Place at the top of the region it concerns. Use `FlashAlerts flash={…}` for the `{ ok, info, error }` result of a form or action.
- `danger` for errors (role="alert"), `success` for completed actions, `warning` for something the user must act on, `info` for context.
- Write the fix into the message. A `title` is optional; an `action` (small button) may sit on the right.
- Field-level validation goes in `Field error`, not an alert.

Consumer provides: `tone`, children, optional `title`, `action`.
