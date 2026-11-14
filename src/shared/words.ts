import type { WordOption } from './types.ts';

export const WORD_BANK: WordOption[] = [
  // Sports & Games (includes multi-word phrases like "cricket bat")
  { word: 'cricket bat', category: 'Sports' },
  { word: 'cricket ball', category: 'Sports' },
  { word: 'soccer ball', category: 'Sports' },
  { word: 'tennis racket', category: 'Sports' },
  { word: 'basketball hoop', category: 'Sports' },
  { word: 'baseball glove', category: 'Sports' },
  { word: 'golf club', category: 'Sports' },
  { word: 'bowling pin', category: 'Sports' },
  { word: 'ping pong', category: 'Sports' },
  { word: 'ice hockey', category: 'Sports' },
  { word: 'boxing ring', category: 'Sports' },
  { word: 'skateboard', category: 'Sports' },
  { word: 'surfboard', category: 'Sports' },
  { word: 'chess board', category: 'Games' },
  { word: 'dice', category: 'Games' },
  { word: 'gold medal', category: 'Sports' },
  { word: 'finish line', category: 'Sports' },
  { word: 'badminton', category: 'Sports' },
  { word: 'archery', category: 'Sports' },
  { word: 'trampoline', category: 'Sports' },

  // Food & Drink
  { word: 'ice cream', category: 'Food' },
  { word: 'hot dog', category: 'Food' },
  { word: 'birthday cake', category: 'Food' },
  { word: 'french fries', category: 'Food' },
  { word: 'pizza slice', category: 'Food' },
  { word: 'coffee mug', category: 'Food' },
  { word: 'peanut butter', category: 'Food' },
  { word: 'watermelon', category: 'Food' },
  { word: 'pineapple', category: 'Food' },
  { word: 'avocado', category: 'Food' },
  { word: 'croissant', category: 'Food' },
  { word: 'pancake', category: 'Food' },
  { word: 'spaghetti', category: 'Food' },
  { word: 'sandwich', category: 'Food' },
  { word: 'popcorn', category: 'Food' },
  { word: 'strawberry', category: 'Food' },
  { word: 'cupcake', category: 'Food' },
  { word: 'taco', category: 'Food' },
  { word: 'sushi', category: 'Food' },
  { word: 'donut', category: 'Food' },
  { word: 'lemonade', category: 'Food' },
  { word: 'fried egg', category: 'Food' },
  { word: 'cheese burger', category: 'Food' },
  { word: 'banana split', category: 'Food' },

  // Animals & Nature
  { word: 'polar bear', category: 'Animals' },
  { word: 'teddy bear', category: 'Objects' },
  { word: 'sea turtle', category: 'Animals' },
  { word: 'bald eagle', category: 'Animals' },
  { word: 'killer whale', category: 'Animals' },
  { word: 'butterfly', category: 'Animals' },
  { word: 'elephant', category: 'Animals' },
  { word: 'giraffe', category: 'Animals' },
  { word: 'penguin', category: 'Animals' },
  { word: 'octopus', category: 'Animals' },
  { word: 'kangaroo', category: 'Animals' },
  { word: 'flamingo', category: 'Animals' },
  { word: 'crocodile', category: 'Animals' },
  { word: 'hedgehog', category: 'Animals' },
  { word: 'peacock', category: 'Animals' },
  { word: 'dolphin', category: 'Animals' },
  { word: 'jellyfish', category: 'Animals' },
  { word: 'chameleon', category: 'Animals' },
  { word: 'ladybug', category: 'Animals' },
  { word: 'seahorse', category: 'Animals' },
  { word: 'palm tree', category: 'Nature' },
  { word: 'solar eclipse', category: 'Nature' },
  { word: 'rainbow', category: 'Nature' },
  { word: 'volcano', category: 'Nature' },
  { word: 'waterfall', category: 'Nature' },
  { word: 'cactus', category: 'Nature' },
  { word: 'snowflake', category: 'Nature' },
  { word: 'lightning bolt', category: 'Nature' },
  { word: 'mushroom', category: 'Nature' },
  { word: 'sunflower', category: 'Nature' },
  { word: 'mountain peak', category: 'Nature' },
  { word: 'coral reef', category: 'Nature' },

  // Vehicles & Places
  { word: 'fire truck', category: 'Vehicles' },
  { word: 'school bus', category: 'Vehicles' },
  { word: 'pirate ship', category: 'Vehicles' },
  { word: 'hot air balloon', category: 'Vehicles' },
  { word: 'space shuttle', category: 'Vehicles' },
  { word: 'roller coaster', category: 'Places' },
  { word: 'ferris wheel', category: 'Places' },
  { word: 'lighthouse', category: 'Places' },
  { word: 'tree house', category: 'Places' },
  { word: 'igloo', category: 'Places' },
  { word: 'windmill', category: 'Places' },
  { word: 'submarine', category: 'Vehicles' },
  { word: 'helicopter', category: 'Vehicles' },
  { word: 'motorcycle', category: 'Vehicles' },
  { word: 'sailboat', category: 'Vehicles' },
  { word: 'bicycle', category: 'Vehicles' },
  { word: 'tractor', category: 'Vehicles' },
  { word: 'train', category: 'Vehicles' },
  { word: 'castle', category: 'Places' },
  { word: 'pyramid', category: 'Places' },
  { word: 'eiffel tower', category: 'Places' },
  { word: 'camp fire', category: 'Nature' },

  // Everyday Objects & Tech
  { word: 'alarm clock', category: 'Objects' },
  { word: 'traffic light', category: 'Objects' },
  { word: 'magnifying glass', category: 'Objects' },
  { word: 'painting brush', category: 'Objects' },
  { word: 'paper plane', category: 'Objects' },
  { word: 'flashlight', category: 'Objects' },
  { word: 'umbrella', category: 'Objects' },
  { word: 'backpack', category: 'Objects' },
  { word: 'telescope', category: 'Objects' },
  { word: 'microscope', category: 'Objects' },
  { word: 'headphones', category: 'Tech' },
  { word: 'keyboard', category: 'Tech' },
  { word: 'camera', category: 'Tech' },
  { word: 'compass', category: 'Objects' },
  { word: 'hourglass', category: 'Objects' },
  { word: 'suitcase', category: 'Objects' },
  { word: 'scissors', category: 'Objects' },
  { word: 'hammer', category: 'Objects' },
  { word: 'keyhole', category: 'Objects' },
  { word: 'anchor', category: 'Objects' },
  { word: 'ladder', category: 'Objects' },
  { word: 'candle', category: 'Objects' },
  { word: 'guitar', category: 'Music' },
  { word: 'trumpet', category: 'Music' },
  { word: 'drum set', category: 'Music' },
  { word: 'piano keys', category: 'Music' },
  { word: 'violin', category: 'Music' },
  { word: 'microphone', category: 'Music' },
  { word: 'sunglasses', category: 'Objects' },
  { word: 'wrist watch', category: 'Objects' },
  { word: 'bicycle helmet', category: 'Objects' },
  { word: 'rubber duck', category: 'Objects' },
  { word: 'snow globe', category: 'Objects' },

  // Fantasy & Characters
  { word: 'astronaut', category: 'Characters' },
  { word: 'scarecrow', category: 'Characters' },
  { word: 'snowman', category: 'Characters' },
  { word: 'treasure chest', category: 'Adventure' },
  { word: 'magic wand', category: 'Fantasy' },
  { word: 'flying saucer', category: 'Sci-Fi' },
  { word: 'wizard hat', category: 'Fantasy' },
  { word: 'dragon', category: 'Fantasy' },
  { word: 'unicorn', category: 'Fantasy' },
  { word: 'mermaid', category: 'Fantasy' },
  { word: 'robot', category: 'Sci-Fi' },
  { word: 'crown', category: 'Objects' },
  { word: 'trophy', category: 'Objects' },
  { word: 'ghost', category: 'Fantasy' },
  { word: 'ninja', category: 'Characters' },
  { word: 'pirate', category: 'Characters' },
  { word: 'superhero', category: 'Characters' },
  { word: 'time machine', category: 'Sci-Fi' },
];

/**
 * Normalizes any guess or word into lowercase, single-spaced alphanumeric tokens.
 * Ensures "Cricket Bat", "CRICKET BAT", "cricket  bat", "cricket-bat" all normalize identically.
 */
export function normalizeGuess(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether a guess matches the secret word regardless of casing,
 * extra spaces, hyphens, leading articles ("a cricket bat"), or joined spacing ("cricketbat").
 */
export function isExactWordMatch(guess: string, secretWord: string): boolean {
  const g = normalizeGuess(guess);
  const s = normalizeGuess(secretWord);
  if (!g || !s) return false;
  if (g === s) return true;

  // Match even if user omits or adds spaces in compound words (e.g. "cricketbat" == "cricket bat")
  const gCompact = g.replace(/\s+/g, '');
  const sCompact = s.replace(/\s+/g, '');
  if (gCompact.length >= 4 && gCompact === sCompact) return true;

  // Match if user prefixes a leading article like "a cricket bat" or "the eiffel tower"
  const stripArticle = (val: string) => val.replace(/^(a|an|the)\s+/, '');
  if (stripArticle(g) === stripArticle(s)) return true;

  return false;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Returns true when a guess is within 1-2 edits of the secret word (for private "Close!" feedback).
 */
export function isCloseGuess(guess: string, secretWord: string): boolean {
  const g = normalizeGuess(guess);
  const s = normalizeGuess(secretWord);
  if (!g || !s || g === s) return false;

  const dist = levenshtein(g, s);
  const compactDist = levenshtein(g.replace(/\s+/g, ''), s.replace(/\s+/g, ''));
  const minDist = Math.min(dist, compactDist);

  if (s.length >= 4 && minDist === 1) return true;
  if (s.length >= 8 && minDist <= 2) return true;
  return false;
}

/**
 * Builds the masked hint pattern preserving spaces (e.g. "_______ ___" -> "C______ B__").
 */
export function buildHintPattern(word: string, revealedIndices: number[]): string {
  const revealed = new Set(revealedIndices);
  return Array.from(word)
    .map((char, idx) => {
      if (char === ' ') return ' ';
      if (!/[\p{L}\p{N}]/u.test(char)) return char;
      return revealed.has(idx) ? char.toUpperCase() : '_';
    })
    .join('');
}

/**
 * Returns character indices eligible to be revealed as progressive hints.
 */
export function getRevealableIndices(word: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (/[\p{L}\p{N}]/u.test(word[i])) {
      indices.push(i);
    }
  }
  return indices;
}
