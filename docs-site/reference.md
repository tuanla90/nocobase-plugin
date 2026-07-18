# Shared functions & helpers (@ptdl) — Reference

> A **reference** page listing every **shared** function/helper across the @ptdl plugins, in 3 families: **Excel-like formulas** (used by *Formula* + *Spreadsheet View*), **Handlebars helpers** (used by *Print Template*), and **HTML-block helpers** (used by *Block: Custom HTML*). The list is generated straight from the code — nothing here is outside the source.

## 1. 🧮 Excel-like formulas (Formula DSL) · used by: Formula, Spreadsheet View

The engine wraps **`@formulajs/formulajs`** (~400 Excel functions), so most Excel functions work; the table below is the **officially supported / recommended** set (the formula-writing AI only uses names from this list and never invents functions). Formulas are **case-insensitive** (`SUM` = `sum`) and can **emit HTML** via the display functions further down.

### Syntax

- Current row: `data.<field>`. To-one relation: `data.<relation>.<field>`. To-many relation auto-aggregates: `SUM(data.<relation>.<field>)`.
- Lookup / config table (a **standalone** collection, not a relation): type the collection name **directly**, **without** `data.` → `<tableName>.<column>` (the **array** of that column across **every** row of the table).
- Concatenate with `&` (e.g. `data.a & " " & data.b`). Comparisons: `==` (or `===`), `!=` or `<>`, `> < >= <=`. AND = `&&` (or `AND(...)`). Do **not** use a single `=` (assignment) or a single `&` for AND.
- Use **only** functions from the list below. Don't invent functions (no `XLOOKUP`, no Excel dynamic-array `FILTER(arr, boolArr)`).
- Relations nested 2+ levels **can't** be loaded (`data.a.b.c` or `bang.quan_he.cot` come back empty) → match by **id key**: `bang.rel_id == data.x_id`.
- The target column may be number / text / date / boolean — return the **right type** (comparison → boolean, concat / `IF` → text, `EDATE` / `TODAY` → date).

### Functions by group

| Group | Functions |
|---|---|
| Numbers | `SUM` · `AVERAGE` · `MIN` · `MAX` · `COUNT` · `ROUND` · `ROUNDUP` · `ABS` · `MOD` · `CEILING` · `FLOOR` |
| Conditional filter/aggregate (≈ SELECT/FILTER in AppSheet) | `SUMIF` · `SUMIFS` · `COUNTIF` · `COUNTIFS` · `AVERAGEIF` · `AVERAGEIFS` — e.g. `SUMIFS(data.items.line_amount, data.items.status, "active")` |
| FILTER / SELECT — filter a **list** by condition (wrap in SUM/COUNT/INDEX…) | `FILTER` · `SELECT` — e.g. `SUM(FILTER(data.items.amt, data.items.status == "active" && data.items.amt > 40))`, `INDEX(SELECT(bang.ten, bang.a == data.x && bang.b == data.y), 1)`. Use `==`, `&&` for AND, and `> < >= <= <>` |
| Two-key lookup table (type the table name directly, no `data.`) | `SUMIFS(bang_hs.he_so, bang_hs.tc_a, data.a, bang_hs.tc_b, data.b)` — `bang_hs` = the config collection name |
| Other lookup | `INDEX` · `MATCH` · `CHOOSE` · `SWITCH` · `VLOOKUP` (VLOOKUP needs a 2D array in one JSON field, not for a collection table) |
| Logic | `IF` · `IFS` · `AND` · `OR` · `NOT` · `IFERROR` · `ISBLANK` · `ISNUMBER` |
| Text | `CONCATENATE` · `LEFT` · `RIGHT` · `MID` · `UPPER` · `LOWER` · `TRIM` · `LEN` · `TEXT` |
| Date | `TODAY` · `NOW` · `YEAR` · `MONTH` · `DAY` · `DATEDIF` · `EDATE` · `DAYS` |

### HTML display functions

Functions formulajs lacks, added so a formula can **emit HTML** into the display cell:

| Function | Meaning |
|---|---|
| `B(x)` | Bold → `<b>x</b>` |
| `I(x)` | Italic → `<i>x</i>` |
| `U(x)` | Underline → `<u>x</u>` |
| `BR()` | Line break → `<br/>` |
| `COLOR(x, color)` | Set text color (e.g. `COLOR(data.status, "red")`) |
| `BG(x, color)` | Background highlight + rounded corners (a "pill") |
| `TAG(text, color?)` | Rounded label tag (border + soft fill). `color` accepts an antd name (`red` `volcano` `orange` `gold` `yellow` `lime` `green` `cyan` `blue` `geekblue` `purple` `magenta` `gray` `default`) or a color code; defaults to `default` |
| `DOT(color?, size?)` | Status dot; defaults to color `#16a34a`, size `8`px |
| `LINK(href, text?)` | Link opening a new tab; omit `text` to show the `href` |
| `IMG(src, size?)` | Square rounded image; defaults to `20`px |
| `ESCAPE(x)` | Escape HTML (make a string safe) |

### Examples (intent → formula)

| Intent | Formula |
|---|---|
| Same row | `data.subtotal - data.discount` |
| Multiply unit price (across a relation) | `data.quantity * data.product.unit_price` |
| Aggregate a relation (roll-up) | `SUM(data.items.line_amount)` |
| **Conditional** aggregate (≈ AppSheet SELECT) | `SUMIFS(data.items.line_amount, data.items.status, "active")` |
| Two-key lookup (≈ multi-condition VLOOKUP) | `data.metric * SUMIFS(bang_hs.he_so, bang_hs.a, data.parent.region, bang_hs.b, data.grade)` |
| Sequence number within a group (OR-123.1, .2…) | `data.order.code & "." & (COUNTIFS(order_item.order_id, data.order_id, order_item.id, "<" & data.id) + 1)` |
| Filter a list by condition (FILTER) | `SUM(FILTER(data.items.line_amount, data.items.status == "active" && data.items.line_amount > 0))` |
| Two-key lookup returning **text** (SELECT + INDEX) | `INDEX(SELECT(bang_hs.ten, bang_hs.a == data.parent.region && bang_hs.b == data.grade), 1)` |
| Conditional label | `IF(data.total>1000000, "VIP", "Thường")` |
| Count child rows by condition (COUNT + FILTER) | `COUNT(FILTER(data.items.id, data.items.status == "pending"))` |
| Average / max of child rows | `AVERAGE(data.items.line_amount)` |
| Completion percentage | `data.done_qty / data.total_qty * 100` |
| Over-limit flag (boolean) | `data.total > data.credit_limit` |
| Concatenate (full name → text) | `data.first_name & " " & data.last_name` |
| Multi-tier classification (IFS) | `IFS(data.total >= 1000000, "VIP", data.total >= 500000, "Bạc", TRUE, "Thường")` |
| Due date +1 month (date) | `EDATE(data.order_date, 1)` |
| Days between two dates | `DAYS(data.end_date, data.start_date)` |
| Unit price by **relation key** (match id — instead of nesting) | `INDEX(SELECT(bang_gia.don_gia, bang_gia.product_id == data.product_id), 1)` |

## 2. 🖨 Handlebars helpers · used by: Print Template

Native Handlebars syntax (`{{field}}` `#each` `#if`…) plus the custom helper set below. Examples are **copy-paste ready** into a print template.

| Helper | Description | Example |
|---|---|---|
| `{{field}}` | Value of one field; dot notation for relations | `{{client.name}}` |
| `{{#each}}` | Loop over child rows (appends) | `<table>{{#each items}}<tr><td>{{this.product.name}}</td><td>{{this.qty}}</td></tr>{{/each}}</table>` |
| `{{#if}}` / `{{#unless}}` | Condition (combine with `eq`/`gt`/`and`…) | `{{#if (eq status "paid")}}ĐÃ THANH TOÁN{{else}}CHƯA THU{{/if}}` |
| `@index` | Index within `#each` (starts at 0) | `{{#each items}}<tr><td>{{add @index 1}}</td></tr>{{/each}}` |
| `formatNumber` | Format number / currency / %. `format="#,##0₫"` (₫ $ € £), supports `%` and `locale` | `{{formatNumber total format="#,##0₫"}}` |
| `add` `subtract` `multiply` `divide` `mod` | Binary math operators | `{{multiply qty price}}` |
| `docso` / `docsoHoa` | Vietnamese "number to words" (`docsoHoa` = capitalize first letter) | `Bằng chữ: {{docsoHoa total}} đồng` |
| `qr` | Generate a QR code (SVG). `size`=px, `level`=L/M/Q/H | `{{qr code size=110}}` |
| Page break | Force a new page at this position when printing | `<div style="break-before:page"></div>` |
| Shared block (partial) | Embed a "shared block" template by slug (created in the Shared tab) | `{{> header_chung}}` |
| `formatDate` | Format a date. Tokens: `DD MM YYYY HH mm ss DDDD MMMM A`… | `{{formatDate createdAt "DD/MM/YYYY HH:mm"}}` |
| `now` | Time of printing | `In lúc {{now "HH:mm DD/MM/YYYY"}}` |
| `eq` `ne` `gt` `lt` `gte` `lte` | Comparison — use inside `#if` | `{{#if (gte total 1000000)}}<b>Khách VIP</b>{{/if}}` |
| `and` / `or` | Multi-condition logic | `{{#if (and paid (gt total 0))}}✔{{/if}}` |
| `uppercase` `lowercase` `capitalize` `proper` | Change letter case | `{{uppercase client.name}}` |
| `concat` | Concatenate strings | `{{concat code " - " client.name}}` |
| `regexReplace` | Replace by regex (`g` flag) | `{{regexReplace phone "^84" "0"}}` |
| `regexExtract` | Extract by regex (group index) | `{{regexExtract email "^[^@]+"}}` |
| `sql` (scalar) | Query returning 1 row × 1 col → returns the value directly. `FROM ?` = the array passed in | `{{formatNumber (sql "SELECT SUM(total_cost) FROM ?" items) format="#,##0₫"}}` |
| `#sql` (row loop) | Query returning many rows → loops like `#each` (with `@index`/`@first`/`@last`). Aggregate + `GROUP BY` | `{{#sql "SELECT document_name, SUM(quantity) AS qty, SUM(total_cost) AS total FROM ? GROUP BY document_name" items}}<tr><td>{{add @index 1}}</td><td>{{document_name}}</td><td>{{qty}}</td><td>{{formatNumber total format="#,##0₫"}}</td></tr>{{/sql}}` |
| `#sql` (filter + sort) | `WHERE` / `ORDER BY` / `LIMIT` like normal SQL | `{{#sql "SELECT * FROM ? WHERE fee_type = 'Solicitor Fees' ORDER BY total_cost DESC" items}}<tr><td>{{document_name}}</td></tr>{{/sql}}` |
| `sql` (CASE WHEN…) | Transform values, concatenate, `NOW()`… | `{{sql "SELECT CASE WHEN SUM(amount)>=1000000 THEN 'VIP' ELSE 'Thường' END FROM ?" items}}` |
| `pluck` | Pull one column from a list of objects → array | `{{arraySum (pluck items "amount")}}` |
| `arraySum` `arrayAvg` `arrayMax` `arrayMin` | Aggregate over a numeric array | `Tổng: {{formatNumber (arraySum (pluck items "amount")) format="#,##0₫"}}` |
| `arrayLength` | Element count | `{{arrayLength items}} dòng` |
| `arrayJoin` | Join an array into a string | `{{arrayJoin (pluck items "product.name") ", "}}` |
| `arrayUnique` `arrayReverse` `arrayGet` `arrayIncludes` | Dedupe / reverse / get element i / contains? | `{{arrayGet (pluck items "sku") 0}}` |

## 3. 🧱 HTML-block helpers (Custom HTML block) · used by: Block: Custom HTML

The block's JS field receives `(data, rows, helpers)` and **returns an HTML string** (`data` = the array of query result rows). Type `return helpers.table(data);` to see the column names.

| Helper | Description |
|---|---|
| `helpers.table(data)` | Show all data as a table |
| `helpers.json(data)` | View the raw structure (debug) |
| `helpers.keys(data)` | Array of column names |
| `helpers.first(data,'col')` | Value of one column in the first row |
| `helpers.sum(data,'col')` | Sum of one column |
| `helpers.avg(data,'col')` | Average of one column |
| `helpers.count(data)` | Row count |
| `helpers.min/max(data,'col')` | Minimum / maximum |
| `helpers.groupBy(data,'col')` | Group by a column → `{ key: rows[] }` |
| `helpers.fmt(number)` | Thousands formatting (vi-VN). `fmt(n, {locale, …})` |
| `helpers.date(v,'DD/MM/YYYY HH:mm')` | Format date-time (tokens `YYYY MM DD HH mm ss`) |
| `helpers.timeAgo(v)` | Relative time — "2 giờ trước" |
| `helpers.icon('shopping-cart',{size:22,color:'#2490ef'})` | Any Lucide icon (kebab-case) via the icon-kit registry |

There is also `helpers.esc(x)` for HTML-escaping.

---

*Generated from code — update at: `plugin-formula/src/shared/formulaKnowledge.ts` + `formulaEngine.ts` (family 1), `plugin-print-template/src/shared/HelperDocs.tsx` + `helpers.ts` (family 2), `plugin-block-custom-html/src/client/render.ts` (family 3).*
