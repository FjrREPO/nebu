"use client";

import { Button, Tag, useToast } from "@once-ui-system/core";
import { useEffect, useState } from "react";
import { connect, currentAccount } from "@/lib/wallet";

const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

export function WalletBar({ onConnect }: { onConnect?: (account: string) => void }) {
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    // Reconnecting silently keeps a returning visitor logged in without a popup.
    currentAccount().then((found) => {
      if (found) {
        setAccount(found);
        onConnect?.(found);
      }
    });
  }, [onConnect]);

  if (account) return <Tag variant="neutral" size="l" prefixIcon="wallet" label={short(account)} />;

  return (
    <Button
      variant="secondary"
      prefixIcon="wallet"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const found = await connect();
          setAccount(found);
          onConnect?.(found);
        } catch (err) {
          addToast({ variant: "danger", message: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      Connect wallet
    </Button>
  );
}
