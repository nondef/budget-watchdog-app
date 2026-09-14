import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import {
    dirname,
    extname,
    isAbsolute,
    join,
    normalize,
    relative,
    resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(projectRoot, 'dist');
const port = 8821;
const cypressCacheFolder = join(
    projectRoot,
    'node_modules',
    '.cache',
    'Cypress'
);

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.webmanifest': 'application/manifest+json',
};

function run(command, args) {
    return new Promise((resolveRun, reject) => {
        const child = spawn(command, args, {
            cwd: projectRoot,
            env: {
                ...process.env,
                CYPRESS_CACHE_FOLDER:
                    process.env.CYPRESS_CACHE_FOLDER ?? cypressCacheFolder,
            },
            stdio: 'inherit',
            windowsHide: true,
        });

        child.once('error', reject);
        child.once('exit', code => {
            if (code === 0) resolveRun();
            else reject(new Error(`${command} exited with code ${code}`));
        });
    });
}

async function resolveAsset(requestPath) {
    const requestFile = normalize(
        decodeURIComponent(requestPath.split('?')[0])
    ).replace(/^[/\\]+/, '');
    const candidate = resolve(distRoot, requestFile || 'index.html');
    const relativeCandidate = relative(distRoot, candidate);

    if (
        relativeCandidate.startsWith('..') ||
        isAbsolute(relativeCandidate)
    ) {
        return join(distRoot, 'index.html');
    }

    try {
        const info = await stat(candidate);
        if (info.isFile()) return candidate;
    } catch {
        // Vue Router history fallback aşağıda.
    }

    return join(distRoot, 'index.html');
}

const server = createServer(async (request, response) => {
    try {
        const filePath = await resolveAsset(request.url ?? '/');
        const body = await readFile(filePath);
        response.writeHead(200, {
            'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        response.end(body);
    } catch (error) {
        response.writeHead(500, {
            'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end(
            error instanceof Error ? error.message : 'Server error'
        );
    }
});

try {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    if (process.env.BW_E2E_SKIP_BUILD !== '1') {
        await run(npmCommand, ['run', 'build']);
    }

    await new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolveListen);
    });

    const cypressCli = join(
        projectRoot,
        'node_modules',
        'cypress',
        'bin',
        'cypress'
    );
    await run(process.execPath, [cypressCli, 'run']);
} finally {
    await new Promise(resolveClose => server.close(resolveClose));
}
