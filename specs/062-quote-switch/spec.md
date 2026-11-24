# 062 — « On quote » switch, call-back e-mail, legal pages in the editorial look

**Branch**: `062-quote-switch` (base `dev`) · **Status**: delivered for review

- **Prices on the public site** (`platform_settings.public_prices`, migration `0035`, off by
  default): Console › Prices has one button to show the prices or put every plan « on quote »; also
  the platform MCP tool `set_public_prices`. Off: every plan shows « on quote » whatever the country.
- **Call-back requests reach the founder**: besides Console › Requests, each new request (not a
  repeat of the same contact within the hour) is e-mailed to `PLATFORM_ADMIN_EMAILS`.
- **Language and country of the browser** are read again (the runtime returns a `Headers` object;
  indexing it like a record returned nothing, so every visitor was taken for France/French).
- **The call-back form on its photo**: a solid ink panel, light fields, stronger gradient: readable.
- **Legal pages** use the landing's editorial look (same header and footer, tabs between the five
  pages, numbered contents, readable prose).
