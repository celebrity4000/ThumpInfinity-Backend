// src/utils/fuzzySearch.ts

/**
 * Calculates the Levenshtein edit distance between two strings (case-insensitive).
 */
export function levenshteinDistance(a: string, b: string): number {
  const str1 = a.toLowerCase();
  const str2 = b.toLowerCase();

  const matrix: number[][] = [];

  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1,     // deletion
        );
      }
    }
  }

  return matrix[str1.length][str2.length];
}

/**
 * Builds a regex that is tolerant of vowel substitutions and minor single-character transpositions.
 */
export function buildFuzzyRegex(term: string): RegExp | null {
  const trimmed = term.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return null;

  // Replace vowels with [aeiou] group
  const vowelPattern = trimmed.replace(/[aeiou]/g, "[aeiou]");
  // Insert optional wildcard between characters for missing/extra characters
  const pattern = vowelPattern.split("").join(".?");

  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

/**
 * Checks if a search term fuzzy-matches a single target word or string field.
 * Returns true if exact substring match, fuzzy regex match, or Levenshtein edit distance <= maxEdits.
 */
export function fuzzyMatchWord(searchTerm: string, targetText: string, maxEdits = 2): boolean {
  if (!targetText || !searchTerm) return false;
  const s = searchTerm.trim().toLowerCase();
  const t = targetText.trim().toLowerCase();

  if (t.includes(s) || s.includes(t)) return true;

  // Split target text into words
  const words = t.split(/[\s,_\-\/\.]+/).filter(Boolean);
  const searchWords = s.split(/[\s,_\-\/\.]+/).filter(Boolean);

  for (const sw of searchWords) {
    if (sw.length < 2) continue;

    let wordMatched = false;
    for (const tw of words) {
      if (tw.includes(sw) || sw.includes(tw)) {
        wordMatched = true;
        break;
      }

      // Check edit distance for words with length >= 3
      const allowedEdits = sw.length <= 4 ? 1 : maxEdits;
      if (levenshteinDistance(sw, tw) <= allowedEdits) {
        wordMatched = true;
        break;
      }
    }

    if (wordMatched) return true;
  }

  return false;
}

export interface SearchableProduct {
  name: string;
  brand?: string;
  category?: string;
  subCategory?: string;
  description?: string;
  tags?: string[];
  sku?: string;
  [key: string]: any;
}

/**
 * Filters and ranks a list of products using fuzzy matching against name, brand, category, tags, and SKU.
 */
export function filterProductsFuzzy<T extends SearchableProduct>(
  products: T[],
  searchQuery: string,
): T[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return products;

  const fuzzyRegex = buildFuzzyRegex(q);

  const scored = products
    .map((p) => {
      let score = 0;
      const name = (p.name || "").toLowerCase();
      const brand = (p.brand || "").toLowerCase();
      const category = (p.category || "").toLowerCase();
      const subCategory = (p.subCategory || "").toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      const tags = (p.tags || []).join(" ").toLowerCase();

      const combinedText = `${name} ${brand} ${category} ${subCategory} ${sku} ${tags}`;

      // Tier 1: Substring match
      if (combinedText.includes(q)) {
        score += 100;
        if (name.includes(q)) score += 50;
        if (brand.includes(q)) score += 40;
      }

      // Tier 2: Fuzzy regex match
      if (score === 0 && fuzzyRegex && fuzzyRegex.test(combinedText)) {
        score += 60;
      }

      // Tier 3: Word-level Levenshtein edit distance match
      if (score === 0 && fuzzyMatchWord(q, combinedText, 2)) {
        score += 40;
      }

      return { product: p, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.product);
}
