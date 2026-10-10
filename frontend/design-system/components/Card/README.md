# Card

A card groups one task or one object on a page.

- Use `CardHeader` (title + optional description + `actions`) when the card has a name; the title is a noun phrase, not a sentence.
- `CardBody` pads `space-5` (`space-4` on phones). Lists and tables go directly inside the card without a body so their rows run edge to edge.
- `CardFooter` holds form actions, right-aligned, on `surface-sunken`.
- A whole-card link (`a.card`) is allowed for browse grids (mentor cards, courses); never nest buttons inside it.
- Don't put cards inside cards. Inside a card use `.well` (sunken) or a `divider`.

Consumer provides: children; for the header: `title`, `description`, `actions`.
