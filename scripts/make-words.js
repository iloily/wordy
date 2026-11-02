// Builds server/src/data/words.json from the SCOWL lists in wordlist-english
// (see NOTICE). Answers are everyday words (SCOWL levels 10 and 20) with plurals and
// "-ed" forms of other common words dropped; guesses are every word up to
// level 70, so real words are never turned down. Run: npm run words
const fs = require("fs");
const path = require("path");

const dir = path.dirname(require.resolve("wordlist-english/package.json"));
const load = (lv) =>
  ["english", "american"].flatMap((d) => JSON.parse(fs.readFileSync(path.join(dir, `${d}-words-${lv}.json`), "utf8")));
const ok = (w) => /^[a-z]+$/.test(w);

// never an answer (still allowed as a guess unless listed in NEVER_GUESS)
const BLOCK = new Set(`
anal anus arse damn damned hell balls bitch bitchy boner boobs booby booty butt butts crap cum dick dicks dildo dyke enema
fag fart farts gay gays gonad hoe homo horny hump humps jizz kike kinky lust lusty milf nazi nazis negro
nude nudes nudity orgy pee penis perv piss porn porno prick pubic pussy queer rape raped raper rapes
rapist scrotum semen sex sexy shit slut sluts smut spunk strip suck sucks tit tits titty turd twat urine
vagina vulva whore wank wanker weed bong crack opium drunk booze heroin cocaine kill killed killer murder
suicide gun guns rifle bomb bombs corpse slave slaves
`.split(/\s+/).filter(Boolean));
const NEVER_GUESS = new Set(`fag fags faggot kike kikes negro negros nigga nigger spic spics chink chinks dyke dykes tranny`.split(/\s+/));

const common = new Set([10, 20].flatMap(load).filter(ok));
const all = new Set([10, 20, 35, 40, 50, 55, 60, 70].flatMap(load).filter(ok));

const out = {};
for (const L of [4, 5, 6, 7]) {
  const answers = [...common]
    .filter((w) => w.length === L && !BLOCK.has(w) && !NEVER_GUESS.has(w))
    .filter((w) => !(w.endsWith("s") && (common.has(w.slice(0, -1)) || common.has(w.slice(0, -2)))))
    .filter((w) => !(w.endsWith("ed") && (common.has(w.slice(0, -2)) || common.has(w.slice(0, -1)))))
    .sort();
  const answerSet = new Set(answers);
  const guesses = [...all].filter((w) => w.length === L && !answerSet.has(w) && !NEVER_GUESS.has(w)).sort();
  out[L] = { answers, guesses };
  console.log(`${L} letters: ${answers.length} answers, ${guesses.length} more guesses`);
}
fs.writeFileSync(path.join(__dirname, "..", "server", "src", "data", "words.json"), JSON.stringify(out));
