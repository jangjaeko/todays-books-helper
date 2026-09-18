# Today's Books Helper — YES24 Book Data Extractor

A Chrome extension that pulls bibliographic data off a YES24 book page, works out the
Canadian retail price, and copies everything to the clipboard as tab-separated text you
can paste straight into a spreadsheet.

> Built for internal use at a single Korean bookstore. Not on the Chrome Web Store, not
> for resale.

## Why this exists

The shop imports Korean books into Canada and resells them, including to public library
systems. Every title has to be entered into several spreadsheets — a shipping manifest, a
sales list, and library order forms — and each one wants the same facts in a different
column order.

Doing that by hand means visiting the YES24 page, copying eight or nine fields one at a
time, looking up the shipping weight, and doing arithmetic to convert the Korean cover
price into a Canadian one. Per book that is a few minutes. For an order of two hundred
titles it is a day of work, and a single mistyped weight quietly throws the price off by
tens of dollars.

This extension collapses that into: open the page, click the icon, click a format button,
paste. It also fills in the weight from other bookstores when YES24 does not publish it,
which is the field most often missing and the one that matters most for the price.

## What it pulls

| Field | Notes |
|---|---|
| ISBN | ISBN-13 from the product detail table |
| Title | Cover title, publisher subtitles stripped |
| Author | **Exactly as YES24 prints it**, role suffixes and all (`글`, `그림`, `역`, `저`) |
| Publisher | From the byline under the title |
| Publication date | Normalised to `YYYYMM` (e.g. `202607`) |
| Weight | Grams, number only. Falls back to Kyobo Book Centre, then Aladin |
| Member reviews | Review count, number only |
| List price | Korean cover price (정가), not the discounted sale price |
| Subject | First category path only, joined with `>` |

Every field is also copyable on its own from the "raw values" panel, which is useful when
you only need to patch one cell.

### About the weight fallback

Weight decides the shipping cost, and shipping cost is a large share of the final price,
but YES24 leaves it blank on a fair number of titles. When it is missing and an ISBN is
available the extension queries Kyobo Book Centre, then Aladin, and shows which source it
came from. If neither has it you can type the weight in by hand and the price recalculates
live.

Both lookups verify that the ISBN on the page they found matches the one being looked up.
Kyobo in particular shows bestsellers when a search returns nothing, so without that check
you would silently inherit some unrelated book's weight.

## Price calculation

```
x     = (list price KRW × discount rate ÷ 960) + (weight g × 0.001 × 13)
raw   = x + x × margin ÷ (100 − margin)
price = round up to the nearest 0.50
```

- **Discount rate** — default `0.775`, editable, saved between sessions.
- **Margin** — default `53`, editable, saved between sessions.
- `÷ 960` is the KRW→CAD rate; `× 0.013` is the per-gram shipping cost.
- If either weight or list price is missing the price shows as `0` rather than guessing.

Worked examples:

| Book | KRW | Weight | raw | Price |
|---|---|---|---|---|
| 사라지는 돈… | 21,000 | 502 g | 49.956 | **50.00** |
| 흔한남매 15 | 16,800 | 450 g | 41.303 | **41.50** |

## Output formats

All three copy as tab-separated text, so each value lands in its own spreadsheet cell.
Blank columns are intentional — they line up with the existing sheets.

**Case 1 · SALES** (8 columns)
```
CAD price │ (blank) │ Title │ Publisher │ Author │ Copies │ KRW │ Weight
```

**Case 2 · Shipping** (16 columns)
```
ISBN │ Title │ CAD price │ (blank) │ (blank) │ Copies │ (blank) │ Author │
Pub.Date │ (blank) │ Publisher │ Subject │ Copies │ KRW │ Weight │ Reviews
```

**Case 3 · LBI** (12 columns, **two rows per book**)

| # | Row 1 | Row 2 |
|---|---|---|
| 1 | ISBN | — |
| 2 | — | Title |
| 3 | CAD price | — |
| 6 | Copies | — |
| 8 | — | Author |
| 9 | Pub.Date | — |
| 11 | — | Publisher |
| 12 | Subject | — |

`Copies` defaults to `1`; adjust it in the spreadsheet if an order needs more.

## Install

No build step — these are plain static files.

1. Clone this repository, or download the ZIP and unpack it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick this folder.
5. Open any YES24 product page (`yes24.com/product/goods/...`) and click the extension icon.

## Usage

1. On a YES24 book page, click the icon. Extraction runs immediately.
2. Check the status line:
   - **green** — everything found on YES24, including weight
   - **orange** — weight was filled in from Kyobo or Aladin (the source is labelled)
   - **red** — no weight anywhere; type it in yourself
3. Adjust discount rate or margin if this order needs different numbers.
4. Click a format button to copy, then paste into the spreadsheet.

## Where the data goes next

The shipping format feeds the [bookstore-inventory](https://github.com/jangjaeko/bookstore-inventory)
web app, which tracks stock across machines. Paste a batch of rows there and it matches
books by ISBN, adds up quantities, and later subtracts them when library invoices come
back.

**The two projects share column layouts.** If you reorder a format here, the matching
preset in that app has to change too, or values will silently land in the wrong fields.

## Development

Edit a file, then press the refresh (⟳) button on the extension card in
`chrome://extensions`. That is the whole loop.

Two things worth knowing before changing extraction:

- `extractYes24BookInfo()` is injected into the YES24 page by
  `chrome.scripting.executeScript`. It **cannot reference anything outside itself** —
  every helper it needs has to be defined inside the function body.
- YES24 markup differs between product types (domestic, foreign, used, eBook). Prefer
  matching on label text (`발행일`, `ISBN13`, `정가`) or link URL patterns over class
  names, and always keep a fallback.

See [CLAUDE.md](./CLAUDE.md) for the full extraction rules, the DOM quirks behind each
selector, and past bugs worth not repeating.

## License

MIT
