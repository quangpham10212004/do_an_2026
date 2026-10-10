# Field

`Field` pairs a label with one control and its hint or error.

- Always give a visible label; placeholders show an example, never the label.
- Mark required fields with `required` (red asterisk). Hint text explains format or consequence; when `error` is set it replaces the hint and the control turns `danger`.
- Lay out forms with `.form-grid` (two columns, one below 640px); full-width fields take `.span-2`. End with `.form-actions` or a `CardFooter`.
- Controls: `Input`, `Select`, `Textarea`, `Checkbox`, `Radio`. Pass the same `id` to `Field` and its control.

Consumer provides: `label`, `id`, `hint`, `error`, `required`, the control as children.
