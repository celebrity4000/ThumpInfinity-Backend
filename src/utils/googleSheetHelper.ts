import * as XLSX from "xlsx";

/**
 * Extract Google Spreadsheet ID and GID (tab ID) from a Google Sheets URL or raw ID
 */
export function extractGoogleSheetIdAndGid(input: string): { sheetId: string; gid: string } {
  let sheetId = input.trim();
  let gid = "0";

  // If input is a full URL, parse using regex
  const sheetIdMatch = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (sheetIdMatch && sheetIdMatch[1]) {
    sheetId = sheetIdMatch[1];
  }

  const gidMatch = input.match(/[?&]gid=([0-9]+)/);
  if (gidMatch && gidMatch[1]) {
    gid = gidMatch[1];
  }

  return { sheetId, gid };
}

/**
 * Fetch and parse a public/unlisted Google Sheet by URL or Spreadsheet ID
 */
export async function fetchAndParseGoogleSheet(input: string): Promise<Record<string, string>[]> {
  const { sheetId, gid } = extractGoogleSheetIdAndGid(input);

  if (!sheetId) {
    throw new Error("Invalid Google Sheet URL or Spreadsheet ID.");
  }

  // Construct Google CSV export URL
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  const response = await fetch(exportUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Google Sheet not found. Please verify the URL or Spreadsheet ID.");
    }
    if (response.status === 403 || response.status === 401) {
      throw new Error("Access denied. Please ensure the Google Sheet is shared with 'Anyone with the link can view'.");
    }
    throw new Error(`Failed to fetch Google Sheet (HTTP ${response.status}).`);
  }

  const csvText = await response.text();
  if (!csvText || csvText.trim().length === 0) {
    throw new Error("The Google Sheet appears to be empty.");
  }

  // Parse CSV text using XLSX library for consistent row & header mapping
  const workbook = XLSX.read(csvText, { type: "string" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("No readable worksheet tabs found in the Google Sheet.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
    raw: false,
  });

  return rawRows;
}
