import { Pane } from "tweakpane";
import type { State } from "../state";
import { addDataAndLicensesFolder } from "./data-and-licenses-folder";

const anatomyOptions = [
  { text: "Thoracic", value: "thoracic" },
  { text: "Head & Neck", value: "head_neck" },
  { text: "Brain", value: "brain" },
  { text: "Liver", value: "liver" },
  { text: "Abdomen", value: "abdomen" },
  { text: "Knee", value: "knee" },
];

export function addAnatomyOption(pane: Pane, id: string, label: string) {
  anatomyOptions.push({ text: label, value: id });
  rebuildAnatomyBinding?.();
  pane.refresh();
}

let anatomyBinding: ReturnType<Pane["addBinding"]>;
let rebuildAnatomyBinding: (() => void) | undefined;

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

  rebuildAnatomyBinding = () => {
    anatomyBinding?.dispose();
    anatomyBinding = pane
      .addBinding(state, "anatomyId", {
        label: "Anatomy",
        options: anatomyOptions,
        index: 1,
      })
      .on("change", (event) => {
        onAnatomyChange(event.value);
      });
  };
  rebuildAnatomyBinding();

  pane.addBinding(state, "progress", {
    label: "Progress",
    readonly: true,
    interval: 16,
    format: (v) => `${v.toFixed(2)}%`,
  });

  return pane;
}
