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

### DICOM folder import

Use **Import DICOM Folder** to select a local folder (including subfolders).
Each CT/MR Series Instance UID becomes a separate volume in the new anatomy;
use **Volume → Variant** to switch series. Imports stay in memory for this session.
Other modalities, including RTSTRUCT, are ignored for now.

The importer supports classic single-frame monochrome 8/16-bit images with
uncompressed little/big-endian or JPEG Lossless (.57/.70) transfer syntaxes.
Enhanced/multiframe, other compression formats, single-slice images, and
inconsistent or irregular stacks produce an error. Temporal/echo stacks sharing
a series UID and repeated spatial positions must be separated before import.

Slices are sorted by Image Position Patient projected onto the orientation normal.
Pixel Spacing and the full slice displacement (including affine gantry tilt) define
the voxel axes in patient LPS millimeters. These convert to RAS and normalize
against the combined volume bounds when no meshes exist. CT/MR from different
frames of reference are not registered automatically. Rescaled pixel intensities
are normalized per volume to the renderer's existing 8-bit representation.
