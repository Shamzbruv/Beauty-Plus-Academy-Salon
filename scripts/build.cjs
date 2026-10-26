const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
Promise.all(
  ["site", "admin"].map((name) =>
    esbuild.build({
      entryPoints: [path.join(root, "assets", name + "-source.js")],
      outfile: path.join(root, "assets", name + ".js"),
      bundle: true,
      minify: true,
      format: "iife",
      target: "es2020",
      nodePaths: [path.join(__dirname, "node_modules")],
      legalComments: "eof",
    }),
  ),
).catch((e) => {
  console.error(e);
  process.exit(1);
});
