import type { TaskKind } from "./schedule";

export const ACTION_LABEL: Record<TaskKind, string> = {
  "start-indoors": "Start seeds indoors",
  transplant: "Plant out",
  "direct-sow": "Sow outdoors",
  "fall-plant": "Plant for fall",
  "harvest-before-frost": "Harvest or cover",
};
