"use client";

import { Row, SmartLink, Text } from "@once-ui-system/core";
import { usePathname } from "next/navigation";
import { WalletBar } from "./WalletBar";

const LINKS = [
  { href: "/", label: "Agents" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/status", label: "Status" },
];

export function TopBar() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <Row
      as="header"
      fillWidth
      horizontal="center"
      paddingX="l"
      paddingY="16"
      borderBottom="neutral-alpha-weak"
      background="page"
      position="sticky"
      zIndex={9}
    >
      <Row fillWidth maxWidth="xl" vertical="center" horizontal="between" gap="24">
        <SmartLink href="/" unstyled>
          <Text variant="heading-strong-m">nebu</Text>
        </SmartLink>

        <Row gap="4" s={{ hide: true }}>
          {LINKS.map((link) => (
            <SmartLink key={link.href} href={link.href} unstyled>
              <Row
                paddingX="16"
                paddingY="8"
                radius="s"
                background={active(link.href) ? "neutral-alpha-weak" : undefined}
              >
                <Text
                  variant="label-default-s"
                  onBackground={active(link.href) ? "neutral-strong" : "neutral-weak"}
                >
                  {link.label}
                </Text>
              </Row>
            </SmartLink>
          ))}
        </Row>

        <WalletBar />
      </Row>
    </Row>
  );
}
