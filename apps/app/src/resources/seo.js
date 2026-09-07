const baseURL = process.env.NEXT_PUBLIC_BASE_URL || "https://nebu.vercel.app";

const meta = {
  home: {
    path: "/",
    title: "nebu — agent marketplace for BNB Smart Chain",
    description:
      "Discover, understand and activate DeFi agents on BNB Smart Chain: LP rebalancing, grid trading, yield routing and liquidation defence, all reading live mainnet data.",
    image: "/images/og/home.jpg",
    canonical: baseURL,
    robots: "index,follow",
    alternates: [{ href: baseURL, hrefLang: "en" }],
  },
};

const schema = {
  logo: "",
  type: "Organization",
  name: "nebu",
  description: meta.home.description,
  email: "",
};

export { baseURL, meta, schema };
