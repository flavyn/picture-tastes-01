# SPEC — main.ts

Task: write ONE image to `/output/entry.png` (create the directory if missing).

- A whole PNG, 1024x1024, at most 1,048,576 bytes.
- Node 22, standard library only (`node:fs`, `node:zlib`, `node:path`). No dependencies, no network.
- Deterministic: two runs must produce byte-identical files.
- Overridable for local testing: read the output directory from `process.env.ENTRY_OUT` when it is set, else `/output`.

## Subject

One picture of food that makes you hungry, built on a single ingredient: a bowl of ramen seen from a
low three-quarter angle.

Include, all procedural:
- a dark ceramic bowl with a visible rim and a soft contact shadow
- glossy amber broth with specular highlights
- coiled noodles
- two slices of seared pork (chashu) with a caramelised edge
- a soft-boiled egg cut in half, with a jammy orange yolk
- sliced scallions, a nori sheet
- three to five thin steam wisps rising above the bowl

## Rendering requirements

- Encode the PNG yourself: raw RGB/RGBA rows, `zlib.deflateSync`, then CRC32, then IHDR/IDAT/IEND.
  No canvas, no sharp, no image libraries.
- Supersample 2x2: render at 2048x2048, box-filter down to 1024.
- Radial gradients for the bowl interior and the broth, specular highlights on broth and yolk, soft
  shadows under the bowl, a warm gradient background with a darker vignette.
- Anti-aliased shapes via signed distance functions for ellipses and rounded rectangles.
- No text anywhere in the image.

## Code shape

Split into small functions with one job each, named for what they do: the pixel buffer, the PNG
encoder, ellipse/rounded-rect fill, gradients, steam, each food element, and main.

## Definition of done

Run it and report: file byte size, PNG header dimensions, and the sha256 of two consecutive runs being
identical. Do not ask questions; the specification above is complete.
