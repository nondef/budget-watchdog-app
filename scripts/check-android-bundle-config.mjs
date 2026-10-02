// Play paketi derlenmeden önce çalışır (bkz. `npm run bundle:android`).
//
// `ionic capacitor run -l` (canlı yenileme) Android projesindeki Capacitor
// ayarına geçici bir `server.url` yazar; ardından `cap sync` atlanıp doğrudan
// `gradlew bundleRelease` çalıştırılırsa bu ayar ve eski web kodu pakete girer.
// Uygulama açılışta geliştirme sunucusuna bağlanmaya çalışır ve
// ERR_CONNECTION_REFUSED verir; Play aynı versionCode'u da ikinci kez kabul etmez.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(projectRoot, 'android', 'app', 'src', 'main', 'assets');

const readText = (...parts) => readFileSync(join(...parts), 'utf8');

const problems = [];

let config = null;
try {
    config = JSON.parse(readText(assets, 'capacitor.config.json'));
} catch {
    problems.push('android/app/src/main/assets/capacitor.config.json okunamadı (cap sync hiç çalışmamış)');
}

if (config?.server?.url) {
    problems.push(`Capacitor ayarı bir geliştirme sunucusuna işaret ediyor: ${config.server.url}`);
}
if (config?.server?.cleartext) {
    problems.push('Capacitor ayarı şifresiz (cleartext) bağlantıya izin veriyor');
}
// Açık kalırsa chrome://inspect ile tüm finansal veri okunabilir (bkz. capacitor.config.ts).
if (config?.android?.webContentsDebuggingEnabled) {
    problems.push('WebView hata ayıklama açık (BW_DEBUG_WEBVIEW=1 ile sync edilmiş)');
}

// Kopyalanan web kodu güncel mi: dist ile aynı giriş dosyasını göstermeli.
const entryOf = (...parts) => {
    try {
        return readText(...parts).match(/assets\/index-[^"']+\.js/)?.[0] ?? null;
    } catch {
        return null;
    }
};
const distEntry = entryOf(projectRoot, 'dist', 'index.html');
const androidEntry = entryOf(assets, 'public', 'index.html');

if (!distEntry) {
    problems.push('dist/index.html yok ya da giriş dosyası bulunamadı (npm run build çalışmamış)');
} else if (distEntry !== androidEntry) {
    problems.push('Android projesindeki web kodu dist ile aynı değil (cap sync çalışmamış)');
}

if (problems.length > 0) {
    console.error('\nPlay paketi derlenmemeli:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nÇözüm: npm run build && npx cap sync android\n');
    process.exit(1);
}

const { version } = JSON.parse(readText(projectRoot, 'package.json'));
console.log(`Android paket ayarı temiz (sürüm ${version}).`);
