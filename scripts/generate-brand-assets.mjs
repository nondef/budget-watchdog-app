import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'assets', 'brand-source', 'master.png');

const palette = {
  charcoal: [38, 35, 31],
  ivory: [246, 240, 231],
  gold: [176, 148, 86],
  lightBackground: { r: 234, g: 230, b: 224, alpha: 1 },
  darkBackground: { r: 30, g: 30, b: 30, alpha: 1 },
  transparent: { r: 0, g: 0, b: 0, alpha: 0 },
};

await Promise.all([
  join(root, 'assets', 'android'),
  join(root, 'public', 'brand'),
].map((path) => mkdir(path, { recursive: true })));

const { data: sourcePixels, info } = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

/** Remove disconnected generation specks while retaining the main logo component. */
function keepLargestAlphaComponent(pixels, width, height) {
  const count = width * height;
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let largest = [];

  for (let start = 0; start < count; start += 1) {
    if (visited[start] || pixels[start * 4 + 3] < 16) continue;

    let head = 0;
    let tail = 1;
    queue[0] = start;
    visited[start] = 1;
    const component = [];

    while (head < tail) {
      const index = queue[head++];
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbours = [];
      if (x > 0) neighbours.push(index - 1);
      if (x + 1 < width) neighbours.push(index + 1);
      if (y > 0) neighbours.push(index - width);
      if (y + 1 < height) neighbours.push(index + width);

      for (const neighbour of neighbours) {
        if (!visited[neighbour] && pixels[neighbour * 4 + 3] >= 16) {
          visited[neighbour] = 1;
          queue[tail++] = neighbour;
        }
      }
    }

    if (component.length > largest.length) largest = component;
  }

  const keep = new Uint8Array(count);
  for (const index of largest) keep[index] = 1;
  for (let index = 0; index < count; index += 1) {
    if (!keep[index]) pixels[index * 4 + 3] = 0;
  }
}

keepLargestAlphaComponent(sourcePixels, info.width, info.height);

function colorize(invertNeutral = false) {
  const result = Buffer.from(sourcePixels);

  for (let offset = 0; offset < result.length; offset += 4) {
    if (result[offset + 3] === 0) continue;

    const red = sourcePixels[offset];
    const green = sourcePixels[offset + 1];
    const blue = sourcePixels[offset + 2];
    const isGold = red > 120 && red > green * 1.06 && green > blue * 1.08;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const neutral = luminance >= 125
      ? (invertNeutral ? palette.charcoal : palette.ivory)
      : (invertNeutral ? palette.ivory : palette.charcoal);
    const [nextRed, nextGreen, nextBlue] = isGold ? palette.gold : neutral;

    result[offset] = nextRed;
    result[offset + 1] = nextGreen;
    result[offset + 2] = nextBlue;
  }

  return sharp(result, { raw: info }).png().toBuffer();
}

async function centeredMark(mark, canvasSize, markSize, background) {
  const resized = await sharp(mark)
    .trim({ background: palette.transparent })
    .resize({ width: markSize, height: markSize, fit: 'inside' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background,
    },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

function solidCanvas(canvasSize, background) {
  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background,
    },
  }).png().toBuffer();
}

async function writePng(buffer, path) {
  await mkdir(dirname(path), { recursive: true });
  await sharp(buffer).png({ compressionLevel: 9 }).toFile(path);
}

const [lightMark, darkMark] = await Promise.all([colorize(false), colorize(true)]);

const [lightTile, darkTile, legacyTile, adaptiveForeground, adaptiveBackground, lightSplash, darkSplash, favicon] = await Promise.all([
  centeredMark(lightMark, 1024, 660, palette.lightBackground),
  centeredMark(darkMark, 1024, 660, palette.darkBackground),
  centeredMark(lightMark, 1024, 820, palette.lightBackground),
  centeredMark(lightMark, 1024, 650, palette.transparent),
  solidCanvas(1024, palette.lightBackground),
  centeredMark(lightMark, 2732, 850, palette.lightBackground),
  centeredMark(darkMark, 2732, 850, palette.darkBackground),
  centeredMark(lightMark, 192, 170, palette.transparent),
]);

await Promise.all([
  writePng(lightTile, join(root, 'assets', 'logo.png')),
  writePng(darkTile, join(root, 'assets', 'logo-dark.png')),
  writePng(lightTile, join(root, 'public', 'brand', 'logo-light.png')),
  writePng(darkTile, join(root, 'public', 'brand', 'logo-dark.png')),
  writePng(favicon, join(root, 'public', 'favicon.png')),
  writePng(legacyTile, join(root, 'assets', 'android', 'icon-only.png')),
  writePng(adaptiveForeground, join(root, 'assets', 'android', 'icon-foreground.png')),
  writePng(adaptiveBackground, join(root, 'assets', 'android', 'icon-background.png')),
  writePng(lightSplash, join(root, 'assets', 'android', 'splash.png')),
  writePng(darkSplash, join(root, 'assets', 'android', 'splash-dark.png')),
]);

console.log('Generated Budget Watchdog brand and Android source assets.');
