# Pedestrian Simulator

A miniature, tilt-shift-style 3D model of the junction outside Covent Garden tube station, with
little pedestrians walking around it by simple rules.

## The look

The scene is styled as a painted scale model photographed with a shallow depth of field:

- **A long lens from high up** (a 20° field of view): perspective flattens, as when you look down
  at a model on a table.
- **A shallow depth of field** focused on whatever the camera is looking at: the near and far parts
  of the scene melt into soft bokeh, which is what makes the eye read it as tiny.
- **A slab on a stand**: the area is cut out as a neat block, with buildings sliced off at its
  edges, floating in a pale haze.
- **Toy materials and soft light**: clean, slightly glossy colours, a soft studio environment for
  highlights, a warm low sun for long shadows, ambient occlusion in the corners, and a glow on the
  lamps.

### Matching the real place

The details come from photos of the junction:

- **The station** follows Leslie Green's 1907 design: two storeys of glossy ox-blood faience, with
  open entrances between piers (ticket gates inside, in front of the lit booking hall), green
  awnings, a cream fascia lettered COVENT GARDEN STATION with blue UNDERGROUND panels, big
  semicircular windows above, and roundels on brackets at the corners. Four storeys of red brick
  offices with white windows sit on top.
- **The other buildings** take their style from OpenStreetMap's `building:material` and
  `building:colour` tags where they're set (brick, stucco, stone), with a whole number of storeys
  fitted to each from `building:levels`: London stock and red brick terraces with white sash
  windows, white stucco, slate mansards with dormers, and parapets and plant on flat roofs. Boots,
  across the crossing, has its navy fascia.
- **Landmarks** around the junction have their own looks: Regal House, opposite the station, with
  the living wall planted on it in 2017 (dark bronze window columns and box windows with planted
  trays, through planting that spills over the top); Russell & Bromley's Portland stone corner on
  Neal Street; Odhams Walk's dark brown brick, with the big London plane in front of it on Long
  Acre. OpenStreetMap draws a couple of these as one outline with their neighbours, so the import
  splits them where the real buildings meet.
- **The streets** have York stone pavements, granite setts on James Street and Neal Street, Neal
  Street's black bollards, Westminster bins, the station's map board, timber planters of shrubs and
  flowers at Regal House's corner, and pedicabs waiting outside.

Add `?view=x,y,z,targetX,targetY,targetZ` to the URL to open the scene at a particular camera
position and target, in metres, to share an angle.

## Stack

- **React 19 + Vite + TypeScript**
- **[three.js](https://threejs.org/)** via [React Three Fiber](https://r3f.docs.pmnd.rs/),
  [drei](https://drei.docs.pmnd.rs/) and
  [postprocessing](https://github.com/pmndrs/react-postprocessing)
- **[OpenStreetMap](https://www.openstreetmap.org/)** for the buildings and streets

## Development

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm lint         # typecheck + eslint
pnpm format       # prettier
pnpm test         # vitest
pnpm build
```

### Map data

`src/data/area.json` holds the buildings, streets and walking paths around the station, generated
from OpenStreetMap by `scripts/fetch-osm.mjs`. It's committed, so the app needs no map service at
runtime. To regenerate it (for example after changing the area's size or centre in the script):

```sh
pnpm fetch:osm
OSM_CACHE=/tmp/osm.json pnpm fetch:osm   # save the response, and reuse it on later runs
```

The script rotates the map so Long Acre runs along x, clips everything to a rectangle, drops
indoor and underground paths, and joins up the walking network. Map data is © OpenStreetMap
contributors, under the ODbL.

### Deployment

Deployed to Cloudflare Workers as static assets (`wrangler.jsonc`), with SPA fallback routing. The
build command is `pnpm build`, and the output directory is `dist`.

## Structure

```
src/
  data/     The generated area and its types
  scene/    The three.js scene: ground, buildings, props, people, lights and effects
  sim/      The pedestrian simulation: the walking network and the crowd's rules; unit tested
scripts/    The OpenStreetMap import
```
