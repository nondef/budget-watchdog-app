import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android', 'app', 'src', 'main', 'res');

// Capacitor Assets 3 reuses one mutable Sharp pipeline across density jobs,
// which can compound resize operations. Re-render each adaptive layer from
// its 1024px source so every density has the same optical scale and sharpness.
const adaptiveSizes = {
  ldpi: 81,
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

await Promise.all(Object.entries(adaptiveSizes).flatMap(([density, size]) => [
  sharp(join(root, 'assets', 'android', 'icon-foreground.png'))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(res, `mipmap-${density}`, 'ic_launcher_foreground.png')),
  sharp(join(root, 'assets', 'android', 'icon-background.png'))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(res, `mipmap-${density}`, 'ic_launcher_background.png')),
]));

const adaptiveIcon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;

const themedIcon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`;

const targets = [
  [join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptiveIcon],
  [join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptiveIcon],
  [join(res, 'mipmap-anydpi-v33', 'ic_launcher.xml'), themedIcon],
  [join(res, 'mipmap-anydpi-v33', 'ic_launcher_round.xml'), themedIcon],
];

for (const [path, contents] of targets) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

console.log('Finalized adaptive and Android 13 themed icon XML resources.');