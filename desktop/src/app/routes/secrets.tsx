import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const SecretsScreen = React.lazy(async () => {
  const module = await import("@/features/secrets/ui/SecretsScreen");
  return { default: module.SecretsScreen };
});

export const Route = createFileRoute("/secrets")({
  component: SecretsRouteComponent,
});

function SecretsRouteComponent() {
  return (
    // Свой kind ради заглушки не заводим: это трогало бы общий компонент,
    // а патч должен оставаться переносимым между релизами апстрима.
    <React.Suspense fallback={<ViewLoadingFallback kind="projects" />}>
      <SecretsScreen />
    </React.Suspense>
  );
}
