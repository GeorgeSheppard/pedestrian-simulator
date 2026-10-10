# Pedestrian Simulator

A miniature, tilt-shift-style 3D model of the junction outside Covent Garden tube station, with
little pedestrians walking around it by simple rules.

## The look

The scene is styled as a painted scale model photographed with a shallow depth of field:

- **A long lens from high up** (a 20° field of view): perspective flattens, as when you look down
  at a model on a table.
- **A shallow depth of field** focused on whatever the camera is looking at: the near and far parts
  of the scene melt into soft bokeh, which is what makes the eye read it as tiny. On top of that,
  the edges of the slab, where people walk in from, are always blurred, wherever the camera is
  (`src/scene/EdgeBlur.ts` works out where each pixel is on the ground from the depth buffer).
- **A cut-out of the city**: the area is cut out as a neat rectangle, with buildings sliced off at
  its edges, and the ground fading into a pale haze.
- **Toy materials and soft light**: clean, slightly glossy colours, a soft studio environment for
  highlights, a warm low sun for long shadows, ambient occlusion in the corners, and a glow on the
  lamps.

### Matching the real place

The details come from photos of the junction:

- **The station** follows Leslie Green's 1907 design: two storeys of glossy ox-blood faience, with
  open entrances between piers off Long Acre (ticket gates inside, in front of the lit booking
  hall), and the way out on James Street, exit only: three bays with lines of gates right at the
  street and No entry signs under grey-green canopies. Over them run a cream fascia lettered
  COVENT GARDEN STATION with blue UNDERGROUND panels, then big semicircular windows, with roundels
  on brackets at the corners. Four storeys of red brick offices sit on top, their windows under
  blue-and-white chequered heads.
- **The buildings we have photos of** (on Geograph and Wikimedia Commons) are drawn as they are:
  - Long Acre west of the station: Victorian shops and offices of red brick banded with white,
    white stucco, Muji's white stucco between red brick piers, and plain red brick.
  - 48-52 Long Acre, past Regal House: a late Georgian terrace of London stock brick, with
    six-over-six sashes under rubbed brick arches.
  - On James Street: red brick banded with white south of the station, and, opposite, the
    Victorian building next to the Nags Head, of buff brick latticed with red brick diamonds,
    with round-headed windows under red brick arches.
  - Across Long Acre: Hobbs, and 107-115 (Boots, with Russell & Bromley on the Neal Street
    corner), plain red-brown brick with dark modern windows.
- **The other buildings** take their style from OpenStreetMap's `building:material` and
  `building:colour` tags where they're set (brick, stucco, stone), with a whole number of storeys
  fitted to each from `building:levels`: London stock and red brick terraces in stretcher
  bond with sash windows set back in their openings under rubbed-brick arches, stone lintels or
  segmental arches; white stucco with moulded architraves, hoods and balconettes; Portland stone
  ashlar; slate mansards with dormers, and parapets and plant on flat roofs.
- **Landmarks** around the junction have their own looks: Regal House, opposite the station, with
  the living wall planted on it in 2017 (dark bronze window columns and box windows with planted
  trays, through planting that spills over the top); Odhams Walk's dark brown brick, with the big
  London plane in front of it on Long Acre. OpenStreetMap draws Boots and Russell & Bromley as
  one outline, so the import splits them where their shops meet.
- **The streets**: Long Acre is paved in concrete blocks of mixed greys, buffs and terracottas,
  edged in terracotta inside granite kerbs, with loading bays marked in white; the pavements are
  grey concrete flags, and James Street and Neal Street grey granite setts. Westminster lamp
  columns (black, with a gold band and finial), Neal Street's bollards, Westminster bins, the
  station's map board, a row of timber planters down the station side of James Street with a
  no-entry sign, more planters at Regal House's corner, and pedicabs waiting outside.

### People and traffic

The simulation (`src/sim/`) runs the crowd and Long Acre's traffic together:

- **People** turn up at the edges of the area and walk off the other side, into a shop, or into
  the station: in through the two open bays off Long Acre, across the booking hall and through the
  gates at the back, down to the lifts. Every half minute to a minute a lift-load of people off
  a train comes up, mostly out through the gates on James Street, some through the booking hall. Each shop has a lit doorway on its street front; shoppers go in, stay
  a while, and come back out to carry on.
- **Different paces**: some stroll, most walk, and some hurry (more so to and from the trains).
  About a third come in twos, threes or fours, walking side by side at the group's easy pace,
  waiting together at kerbs and going in and out of shops together.
- **Traffic** runs one way, eastbound, along a single lane down the middle of Long Acre, between
  the loading bays: black cabs, cars and vans, each at its own speed, keeping a gap to the one in
  front, with brake lights as they slow.
- **Taking turns**: drivers stop for anyone on or waiting at the zebra crossing, and for anyone in
  the carriageway ahead. People wait at the kerb rather than step out in front of a moving
  vehicle, wanting a bigger gap where there's no zebra. Covent Garden's crowds never stop coming,
  so a driver who's waited a while edges across once the people already on the crossing are clear,
  and those still at the kerb let them go.

### Weather

The controls in the bottom left switch between sunny, cloudy and rain (`src/weather/`). Faceted clouds
drift over the model on the wind, casting moving shadows; cloudier skies dim and cool the sun and
grey the haze; and rain falls in slanting streaks. Add `?weather=cloudy` or `?weather=rain` to the
URL to open in that weather.

### Controls

The panel in the bottom left sets the weather, how many people there are (up to 400) and how busy
the traffic is (up to 12 vehicles on Long Acre at once). The crowd and traffic ease to new numbers
rather than jumping: extra people head off and fewer new ones turn up, or the other way round. Add
`?people=300` or `?traffic=10` to the URL to start with those.

Drag with one finger or the mouse to turn the model round the middle of the view, and with two
fingers or the right mouse button (or shift and drag) to slide it about; pinch or scroll to zoom.
WASD or the arrow keys move around too. The OpenStreetMap credit sits at the bottom of the
controls panel.
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
