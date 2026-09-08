import { fallbackLogo } from "@nebu/core";

const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const CAKE = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
const AAVE = "0xfb6115445Bff7b52FeB98650C87f44907E58f802";
const XVS = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";

/**
 * A mark for each protocol and data source the site names, matched on the name
 * itself so a label and its icon can never drift apart. The three protocols
 * come from the token host every other icon here already uses; the two data
 * feeds have no token, so it is their own site's icon. Anything unmatched —
 * Altana publishes none — renders as nothing rather than a broken image.
 */
const BRANDS: [RegExp, string | undefined][] = [
  [/pancakeswap/i, fallbackLogo(CAKE)],
  [/aave/i, fallbackLogo(AAVE)],
  [/venus/i, fallbackLogo(XVS)],
  [/geckoterminal/i, "https://www.geckoterminal.com/favicon.ico"],
  [/defillama|llama/i, "https://defillama.com/favicon.ico"],
  [/wrapped bnb|wbnb|bnb smart chain|bnb chain/i, fallbackLogo(WBNB)],
];

/** Every mark a name mentions — "Aave V3 + Venus" is two protocols, not one. */
export const brandLogos = (name: string) =>
  BRANDS.filter(([pattern]) => pattern.test(name))
    .map(([, url]) => url)
    .filter((url): url is string => url !== undefined);
