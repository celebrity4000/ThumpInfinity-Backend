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

  const vowelPattern = trimmed.replace(/[aeiou]/g, "[aeiou]");
  const pattern = vowelPattern.split("").join(".?");

  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

/**
 * Checks if a query word fuzzy-matches a target word.
 */
export function isFuzzyMatchSingleWord(queryWord: string, targetWord: string): boolean {
  if (!queryWord || !targetWord) return false;
  const q = queryWord.toLowerCase();
  const t = targetWord.toLowerCase();

  if (t === q || t.includes(q) || q.includes(t)) return true;

  const maxEdits = q.length <= 4 ? 1 : 2;
  return levenshteinDistance(q, t) <= maxEdits;
}

/**
 * Checks if a search term fuzzy-matches a single target string field.
 */
export function fuzzyMatchWord(searchTerm: string, targetText: string, maxEdits = 2): boolean {
  if (!targetText || !searchTerm) return false;
  const s = searchTerm.trim().toLowerCase();
  const t = targetText.trim().toLowerCase();

  if (t.includes(s) || s.includes(t)) return true;

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
  type?: string;
  description?: string;
  tags?: string[];
  sku?: string;
  compatibility?: any;
  specifications?: any;
  [key: string]: any;
}

/**
 * Filters and ranks a list of products using strict field-weighted intent scoring:
 * Priority 1 (Score 10,000 - 25,000): Brand Match
 * Priority 2 (Score 3,000 - 10,000): Product Name / Title Match
 * Priority 3 (Score 1,000 - 2,500): Category / SubCategory / Tags / SKU Match
 * Priority 4 (Score 10 - 100): Description / Compatibility / Specs Match
 */
export function filterProductsFuzzy<T extends SearchableProduct>(
  products: T[],
  searchQuery: string,
): T[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return products;

  const queryWords = q.split(/[\s,_\-\/\.]+/).filter(Boolean);

  const scored = products
    .map((p) => {
      let score = 0;
      const name = (p.name || "").toLowerCase();
      const brand = (p.brand || "").toLowerCase();
      const category = (p.category || "").toLowerCase();
      const subCategory = (p.subCategory || "").toLowerCase();
      const type = (p.type || "").toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      const tags = (p.tags || []).join(" ").toLowerCase();

      const description = (p.description || "").toLowerCase();
      const compatibility = Array.isArray(p.compatibility)
        ? p.compatibility.join(" ").toLowerCase()
        : (p.compatibility || "").toLowerCase();
      const specifications =
        typeof p.specifications === "object"
          ? JSON.stringify(p.specifications || {}).toLowerCase()
          : String(p.specifications || "").toLowerCase();

      // ── 1. BRAND MATCHING (Priority 1: 10,000 - 25,000 pts) ──
      if (brand) {
        if (brand === q || queryWords.includes(brand)) {
          score += 25000;
        } else if (brand.startsWith(q) || queryWords.some((w) => brand.startsWith(w))) {
          score += 20000;
        } else if (brand.includes(q) || q.includes(brand)) {
          score += 15000;
        } else {
          const brandWords = brand.split(/[\s,_\-\/\.]+/).filter(Boolean);
          if (queryWords.some((qw) => brandWords.some((bw) => isFuzzyMatchSingleWord(qw, bw)))) {
            score += 10000;
          }
        }
      }

      // ── 2. NAME / TITLE MATCHING (Priority 2: 3,000 - 10,000 pts) ──
      if (name) {
        if (name === q) {
          score += 10000;
        } else if (name.startsWith(q)) {
          score += 8000;
        } else if (name.includes(q)) {
          score += 6000;
        } else if (queryWords.length > 0 && queryWords.every((w) => name.includes(w))) {
          score += 5000;
        } else {
          const nameWords = name.split(/[\s,_\-\/\.]+/).filter(Boolean);
          const matchedWords = queryWords.filter((qw) =>
            nameWords.some((nw) => isFuzzyMatchSingleWord(qw, nw)),
          );
          if (matchedWords.length > 0) {
            score += Math.round(3000 * (matchedWords.length / queryWords.length));
          }
        }
      }

      // ── 3. CATEGORY / SUBCATEGORY / TAGS / SKU MATCHING (Priority 3: 1,000 - 2,500 pts) ──
      const catText = `${category} ${subCategory} ${type} ${sku} ${tags}`;
      if (catText.includes(q)) {
        score += 2500;
      } else if (queryWords.some((w) => catText.includes(w))) {
        score += 1800;
      } else {
        const catWords = catText.split(/[\s,_\-\/\.]+/).filter(Boolean);
        if (queryWords.some((qw) => catWords.some((cw) => isFuzzyMatchSingleWord(qw, cw)))) {
          score += 1000;
        }
      }

      // ── 4. DESCRIPTION / COMPATIBILITY / SPECS MATCHING (Priority 4: 10 - 100 pts) ──
      const descText = `${description} ${compatibility} ${specifications}`;
      if (descText.includes(q)) {
        score += 100;
      } else if (queryWords.some((w) => descText.includes(w))) {
        score += 50;
      } else {
        const descWords = descText.split(/[\s,_\-\/\.]+/).filter(Boolean);
        if (queryWords.some((qw) => descWords.some((dw) => isFuzzyMatchSingleWord(qw, dw)))) {
          score += 10;
        }
      }

      return { product: p, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.product);
}
