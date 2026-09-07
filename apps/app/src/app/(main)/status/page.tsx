import { bscClient } from "@nebu/core";
import { livePools } from "@nebu/plugin-pancakeswap";
import { plugins } from "@nebu/plugins";
import { Column, Grid, Row, StatusIndicator, Text } from "@once-ui-system/core";
import { Frame, SpecLabel } from "@/components";

export const metadata = { title: "Status · nebu" };
/** This page exists to prove the feeds are up, so it must not be cached long. */
export const revalidate = 30;

const CONTRACTS = [
  ["PancakeSwap V3 factory", "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"],
  ["PancakeSwap position manager", "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364"],
  ["PancakeSwap smart router", "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4"],
  ["Aave V3 pool", "0x6807dc923806fE8Fd134338EABCA509979a7e0cB"],
  ["Venus comptroller", "0xfD36E2c2a6789Db23113685031d7F16329158384"],
];

export default async function StatusPage() {
  const [head, pools] = await Promise.all([
    bscClient
      .getBlockNumber()
      .then(String)
      .catch(() => null),
    livePools()
      .then((rows) => rows.length)
      .catch(() => null),
  ]);

  const feeds = [
    {
      name: "BNB Smart Chain RPC",
      detail: head ? `head block ${head}` : "unreachable",
      note: "public dataseeds, batched through Multicall3",
      ok: head !== null,
    },
    {
      name: "GeckoTerminal pool feed",
      detail: pools === null ? "unreachable" : `${pools} pools in the last pull`,
      note: "24h volume and swap counts, cached 60s",
      ok: pools !== null,
    },
    {
      name: "Agent registry",
      detail: `${plugins.length} agents across ${new Set(plugins.map((p) => p.category)).size} categories`,
      note: "in-process, no network hop",
      ok: plugins.length > 0,
    },
  ];

  return (
    <Column fillWidth maxWidth="l" paddingX="l" paddingY="40" gap="32">
      <Column gap="16" maxWidth="m">
        <SpecLabel mark>status</SpecLabel>
        <Text variant="display-strong-s">Where the numbers come from</Text>
        <Text variant="body-default-l" onBackground="neutral-weak">
          Nothing here is seeded or cached from a fixture. These are the feeds every reading on the
          site is built from, checked when you loaded this page.
        </Text>
      </Column>

      <Row fillWidth borderTop="neutral-alpha-weak" />

      <Column fillWidth gap="12">
        <Text variant="heading-strong-s">Feeds</Text>
        <Frame fillWidth radius="m">
          {feeds.map((feed, index) => (
            <Row
              key={feed.name}
              fillWidth
              padding="20"
              gap="16"
              horizontal="between"
              vertical="center"
              borderTop={index === 0 ? undefined : "neutral-alpha-weak"}
              wrap
            >
              <Row gap="12" vertical="center">
                <StatusIndicator size="s" color={feed.ok ? "green" : "red"} />
                <Column gap="4">
                  <Text variant="label-strong-s">{feed.name}</Text>
                  <Text variant="body-default-xs" onBackground="neutral-weak">
                    {feed.note}
                  </Text>
                </Column>
              </Row>
              <Text variant="code-default-xs" onBackground="neutral-medium">
                {feed.detail}
              </Text>
            </Row>
          ))}
        </Frame>
      </Column>

      <Column fillWidth gap="12">
        <Text variant="heading-strong-s">Contracts read</Text>
        <Frame fillWidth radius="m" padding="4">
          <Grid fillWidth columns={1}>
            {CONTRACTS.map(([label, address]) => (
              <Row key={address} fillWidth horizontal="between" gap="16" padding="16" wrap>
                <SpecLabel>{label}</SpecLabel>
                <Text variant="code-default-xs" onBackground="neutral-medium">
                  {address}
                </Text>
              </Row>
            ))}
          </Grid>
        </Frame>
      </Column>

      <Column fillWidth gap="12">
        <Text variant="heading-strong-s">Known limits</Text>
        <Frame fillWidth radius="m" padding="20" gap="12">
          {[
            "Public BSC endpoints reject getLogs over roughly 20,000 blocks, so activity feeds cover the last 9,000.",
            "Fee APR is annualised from one day of volume against current liquidity — it is an estimate, and the page says so.",
            "Set BSC_RPC_URL to a private endpoint before pointing real traffic at this.",
          ].map((limit) => (
            <Row key={limit} gap="12" vertical="start">
              <Text variant="code-default-s" onBackground="neutral-weak">
                –
              </Text>
              <Text variant="body-default-s" onBackground="neutral-medium">
                {limit}
              </Text>
            </Row>
          ))}
        </Frame>
      </Column>
    </Column>
  );
}
