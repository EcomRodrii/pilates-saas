"use client";

import { HomeBlocks } from "@/components/portal-tema/components/blocks/HomeBlocks";
import { Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Inicio. El orden de los bloques lo decide el tema en `home_blocks`, así que
 * cambiar de tema reordena la pantalla sin tocar esta pantalla.
 */
export function Home({ vm }: { vm: ViewModel }) {
  return (
    <>
      <Island />
      <StatusBar />
      <div className="canvas no-scrollbar">
        <HomeBlocks vm={vm} />
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
