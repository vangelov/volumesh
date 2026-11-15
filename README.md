<p align="center">
   <a href="https://vangelov.github.io/volumesh/" target="_blank">
    <img src="screenshot.png" alt="Devices preview" />
  </a>
</p>

<div align="center">

[Live version](https://vangelov.github.io/volumesh/)

</div>

## Volumesh

A medical visualization renderer combining direct volume rendering with depth-peeled order-independent transparency (OIT) for spatially registered 3D anatomical meshes.

### Features

- Direct volume rendering of medical imaging data
- Order-independent transparency for overlapping 3D meshes using depth peeling
- Spatially registered rendering of anatomical meshes within volumetric scans
- Controls for adjusting rendering parameters
- Multiple anatomical atlases

### Data Sources & Attribution

Medical imaging and anatomical mesh data are sourced from the [Open Anatomy Project](https://www.openanatomy.org).
The viewer includes links to the original atlas pages, where additional information about the datasets and their contributors can be found.

## Scripts

In the project directory, you can run:

#### `npm run dev`

Runs the app in the development mode.\
Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) to view it in the browser.

#### `npm run build`

Builds the app for production in the `dist` folder.
