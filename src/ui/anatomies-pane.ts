import { Pane } from "tweakpane";
import type { State } from "../state";
import { addDataAndLicensesFolder } from "./data-and-licenses-folder";

type Params = {
  state: State;
  onAnatomyChange: (anatomyId: string) => void;
};

export function createAnatomiesPane({ state, onAnatomyChange }: Params) {
  const pane = new Pane({
    title: "Parameters",
    container: document.querySelector("#container") as HTMLElement,
  });

  addDataAndLicensesFolder(pane);

  pane
    .addBinding(state, "anatomyId", {
      label: "Anatomy",
      options: [
        { text: "Thoracic", value: "thoracic" },
        { text: "Head & Neck", value: "head_neck" },
        { text: "Brain", value: "brain" },
        //{ text: "Inner Ear", value: "inner_ear" },
        { text: "Liver", value: "liver" },
        { text: "Abdomen", value: "abdomen" },
        { text: "Knee", value: "knee" },
      ],
    })
    .on("change", (event) => {
      onAnatomyChange(event.value);
    });

  pane.addBinding(state, "progress", {
    label: "Progress",
    readonly: true,
    interval: 16,
    format: (v) => `${v.toFixed(2)}%`,
  });

  return pane;
}
