import type { Pane } from "tweakpane";

type Params = {
  onReset: () => void;
};

export function addResetButton(pane: Pane, { onReset }: Params) {
  const button = pane
    .addButton({
      title: "Reset",
    })
    .on("click", onReset);

  return button;
}
