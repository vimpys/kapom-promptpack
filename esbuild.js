const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();

    return;
  }

  await esbuild.build(options);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
