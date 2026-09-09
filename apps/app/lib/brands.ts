import { fallbackLogo } from "@nebu/core";

const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const CAKE = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
const AAVE = "0xfb6115445Bff7b52FeB98650C87f44907E58f802";
const XVS = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";

const ALTANA =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Cg%20stroke-linejoin%3D%22round%22%20stroke-width%3D%2211%22%3E%3Cpath%20d%3D%22M16%2048%20L50%2014%20L84%2048%20L50%2060%20Z%22%20fill%3D%22%233B6FE0%22%20stroke%3D%22%233B6FE0%22%2F%3E%3Cpath%20d%3D%22M16%2048%20L50%2060%20L36%2084%20Z%22%20fill%3D%22%23F2C744%22%20stroke%3D%22%23F2C744%22%2F%3E%3Cpath%20d%3D%22M84%2048%20L50%2060%20L64%2084%20Z%22%20fill%3D%22%23E2582A%22%20stroke%3D%22%23E2582A%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E";

/**
 * A mark for each protocol and data source the site names, matched on the name
 * itself so a label and its icon can never drift apart. The three protocols
 * come from the token host every other icon here already uses; the two data
 * feeds have no token, so it is their own site's icon. Altana ships no icon
 * file at all, so its mark is drawn here. Anything unmatched renders as
 * nothing rather than a broken image.
 */
const BRANDS: [RegExp, string | undefined][] = [
  [/pancakeswap/i, fallbackLogo(CAKE)],
  [/aave/i, fallbackLogo(AAVE)],
  [/venus/i, fallbackLogo(XVS)],
  [/geckoterminal/i, "https://www.geckoterminal.com/favicon.ico"],
  [/defillama|llama/i, "https://defillama.com/favicon.ico"],
  [/wrapped bnb|wbnb|bnb smart chain|bnb chain|bnb price/i, fallbackLogo(WBNB)],
  // Altana publishes no icon file, so its mark is drawn here and inlined.
  [/altana/i, ALTANA],
  // The registry is us.
  [/agent registry|nebu/i, "/icon-192.png"],
];

/** Every mark a name mentions — "Aave V3 + Venus" is two protocols, not one. */
export const brandLogos = (name: string) =>
  BRANDS.filter(([pattern]) => pattern.test(name))
    .map(([, url]) => url)
    .filter((url): url is string => url !== undefined);
