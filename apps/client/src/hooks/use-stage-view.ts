import { useState, type DependencyList } from "react";
import type { BoardStage } from "../game/views/board-stage.js";
import { useStageResource } from "./use-stage-resource.js";

export interface DisposableView {
  dispose(): void;
}

export function useStageView<V extends DisposableView>(
  stage: BoardStage | null,
  create: (stage: BoardStage) => V,
  dependencies: DependencyList,
): V | null {
  const [view, setView] = useState<V | null>(null);

  useStageResource(
    stage,
    (mounted) => {
      const created = create(mounted);
      setView(created);

      return () => {
        setView(null);
        created.dispose();
      };
    },
    dependencies,
  );

  return view;
}
