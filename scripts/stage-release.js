// Copies only what ships into release/stage and installs production
// dependencies there, ready for `rootsdk build package`. Never package the
// project folder itself: it holds server/.env and .publish.env.
// Run after `npm run build` and `npm test`: node scripts/stage-release.js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const stage = path.join(root, "release", "stage");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "root-manifest.json"), "utf8"));
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (manifest.version !== rootPkg.version) {
  throw new Error(`root-manifest.json is ${manifest.version} but package.json is ${rootPkg.version}; bump both`);
}

const version = (dir) => JSON.parse(fs.readFileSync(path.join(root, "node_modules", dir, "package.json"), "utf8")).version;

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const dir of ["client/dist", "server/dist", "networking/gen/server", "networking/gen/shared"]) {
  fs.cpSync(path.join(root, dir), path.join(stage, dir), {
    recursive: true,
    // the generated packages carry their TypeScript sources and build info; only dist runs
    filter: (src) => !/[\\/](src|node_modules)([\\/]|$)|tsconfig/.test(path.relative(root, src)),
  });
}
fs.copyFileSync(path.join(root, "root-manifest.json"), path.join(stage, "root-manifest.json"));

// only what the server needs at runtime; the client is already bundled by vite
const pkg = {
  name: "wordy",
  version: manifest.version,
  private: true,
  engines: { node: ">=22" },
  dependencies: {
    "@rootsdk/server-app": version("@rootsdk/server-app"),
    "@wordy/gen-server": "file:./networking/gen/server",
    "@wordy/gen-shared": "file:./networking/gen/shared",
  },
};
fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

execSync("npm install --omit=dev --install-links --no-bin-links --no-audit --no-fund", { cwd: stage, stdio: "inherit" });

// npm on Windows still links file: packages as junctions to absolute paths on
// this PC, which would break on Root's servers. Swap each for a real copy.
for (const name of ["gen-server", "gen-shared"]) {
  const link = path.join(stage, "node_modules", "@wordy", name);
  if (!fs.lstatSync(link).isSymbolicLink()) continue;
  const target = fs.realpathSync(link);
  if (!target.startsWith(stage)) throw new Error(`${name} links outside the stage folder: ${target}`);
  fs.rmdirSync(link); // removes the junction itself, not what it points at
  fs.cpSync(target, link, { recursive: true });
}
const links = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) links.push(path.relative(stage, p));
    else if (e.isDirectory()) walk(p);
  }
};
walk(stage);
if (links.length) throw new Error(`links left in the stage folder: ${links.join(", ")}`);

for (const secret of [".env", ".publish.env", ".wordy.env", "server/.env"]) {
  if (fs.existsSync(path.join(stage, secret))) throw new Error(`${secret} ended up in the stage folder`);
}
console.log(`staged wordy ${manifest.version} in release/stage`);
