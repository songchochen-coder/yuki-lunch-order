// Edge-connected flood-fill chromakey. Makes the outer light background of an
// illustration transparent while keeping white pixels inside the figure intact
// (e.g. Snoopy's face stays white even when the page background was also white).
//
// Usage: node scripts/remove-bg.mjs <in> <out> [tolerance]
//
// Algorithm: sample the top-left pixel as the background color, then BFS from
// all four image borders. Any pixel whose color is within `tolerance` of the
// border color AND is reachable via neighbors that are also background-colored
// gets its alpha set to 0. Pixels that match white but are surrounded by the
// figure (islands) are NOT reachable from the border and stay opaque.

import sharp from 'sharp';

const [,, inPath, outPath, toleranceArg] = process.argv;
if (!inPath || !outPath) {
  console.error('Usage: node scripts/remove-bg.mjs <in> <out> [tolerance=28]');
  process.exit(1);
}
const tolerance = toleranceArg ? Number(toleranceArg) : 28;

const { data, info } = await sharp(inPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height } = info;
const buf = Buffer.from(data);
const bgR = buf[0], bgG = buf[1], bgB = buf[2];

function matchesBg(x, y) {
  const i = (y * width + x) * 4;
  return (
    Math.abs(buf[i]     - bgR) <= tolerance &&
    Math.abs(buf[i + 1] - bgG) <= tolerance &&
    Math.abs(buf[i + 2] - bgB) <= tolerance
  );
}

const visited = new Uint8Array(width * height);
const queue = [];
function enqueue(x, y) {
  const idx = y * width + x;
  if (!visited[idx]) {
    visited[idx] = 1;
    queue.push(x, y); // flat: pairs of numbers, faster than [x,y] arrays
  }
}

// Seed from all four borders
for (let x = 0; x < width; x++) {
  enqueue(x, 0);
  enqueue(x, height - 1);
}
for (let y = 0; y < height; y++) {
  enqueue(0, y);
  enqueue(width - 1, y);
}

let head = 0;
let cleared = 0;
while (head < queue.length) {
  const x = queue[head++];
  const y = queue[head++];
  if (!matchesBg(x, y)) continue;
  buf[(y * width + x) * 4 + 3] = 0;
  cleared++;
  if (x > 0)          enqueue(x - 1, y);
  if (x < width - 1)  enqueue(x + 1, y);
  if (y > 0)          enqueue(x, y - 1);
  if (y < height - 1) enqueue(x, y + 1);
}

await sharp(buf, { raw: { width, height, channels: 4 } })
  .png({ compressionLevel: 9, effort: 10 })
  .toFile(outPath);

console.log(`${inPath} -> ${outPath}  (${cleared.toLocaleString()} px cleared, ${Math.round((cleared / (width * height)) * 100)}%)`);
