# Dialog

Asks for confirmation or a short input before an action. Replaces `window.confirm` / `window.prompt`.

- `const [dialog, ask] = useDialog()`; render `{dialog}`; `await ask({ title, message, input?, confirmText, danger })` resolves to the text, `true`, or `null` on cancel.
- Title is the question ("Huỷ phiên học?"); the message states the consequence; the confirm button repeats the verb. `danger` for destructive actions.
- `Modal` for a custom form inside a dialog. Esc and clicking the backdrop close it.

Consumer provides: options to `ask`, or `title`, children, `footer`, `onClose` for `Modal`.
