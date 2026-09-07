import "@once-ui-system/core/css/styles.css";
import "@once-ui-system/core/css/tokens.css";
import "@/resources/custom.css";

import { Column, Flex, Meta, Row, Schema, ThemeInit } from "@once-ui-system/core";
import classNames from "classnames";
import { Providers, SpecLabel, TopBar } from "@/components";
import { dataStyle, fonts, style } from "@/resources/once-ui.config";
import { baseURL, meta } from "@/resources/seo";

export async function generateMetadata() {
  return Meta.generate({
    title: meta.home.title,
    description: meta.home.description,
    baseURL: baseURL,
    path: meta.home.path,
    canonical: meta.home.canonical,
    image: meta.home.image,
    robots: meta.home.robots,
    alternates: meta.home.alternates,
  });
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Flex
      suppressHydrationWarning
      as="html"
      lang="en"
      fillWidth
      className={classNames(
        fonts.heading.variable,
        fonts.body.variable,
        fonts.label.variable,
        fonts.code.variable,
      )}
    >
      <Schema
        as="webPage"
        baseURL={baseURL}
        title={meta.home.title}
        description={meta.home.description}
        path={meta.home.path}
      />
      <head>
        <ThemeInit
          config={{
            theme: style.theme,
            brand: style.brand,
            accent: style.accent,
            neutral: style.neutral,
            solid: style.solid,
            "solid-style": style.solidStyle,
            border: style.border,
            surface: style.surface,
            transition: style.transition,
            scaling: style.scaling,
            "viz-style": dataStyle.variant,
          }}
        />
      </head>
      <Providers>
        <Column as="body" background="page" fillWidth margin="0" padding="0">
          <Column
            className="blueprint"
            fillWidth
            maxHeight="100dvh"
            horizontal="center"
            position="absolute"
            top="0"
            left="0"
            pointerEvents="none"
          />
          <TopBar />
          <Column fillWidth horizontal="center" zIndex={1}>
            {children}
          </Column>
          <Row
            as="footer"
            fillWidth
            horizontal="center"
            paddingX="l"
            paddingY="32"
            marginTop="40"
            borderTop="neutral-alpha-weak"
          >
            <Row fillWidth maxWidth="xl" horizontal="between" gap="16" wrap>
              <SpecLabel mark>{"nebu · agent marketplace · bnb smart chain"}</SpecLabel>
              <SpecLabel>every figure read from mainnet at request time</SpecLabel>
            </Row>
          </Row>
        </Column>
      </Providers>
    </Flex>
  );
}
