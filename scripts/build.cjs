const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
Promise.all(
  ["site", "admin", "invoice"].map((name) =>
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
)
  .then(() => {
    // New source must reach returning visitors, including an installed admin app.
    const hash = crypto.createHash("sha256");
    for (const file of [
      "site.js",
      "site.css",
      "admin.js",
      "admin.css",
      "invoice.js",
    ])
      hash.update(fs.readFileSync(path.join(root, "assets", file)));
    const release = hash.digest("hex").slice(0, 12);
    for (const file of [
      "index.html",
      "salon.html",
      "enroll.html",
      "events.html",
      "shop.html",
      "invoice.html",
      "payment-return.html",
      "admin/index.html",
    ]) {
      const full = path.join(root, file);
      const html = fs
        .readFileSync(full, "utf8")
        .replace(
          /((?:src|href)=["'])(\/?assets\/(?:site|admin|invoice)\.(?:js|css))(?:\?[^"']*)?(["'])/g,
          `$1$2?v=${release}$3`,
        )
        .replace(
          /(href="\/admin\/manifest\.webmanifest)(?:\?[^"]*)?(")/g,
          `$1?v=${release}$2`,
        );
      fs.writeFileSync(full, html);
    }
    const workerPath = path.join(root, "admin", "sw.js");
    fs.writeFileSync(
      workerPath,
      fs
        .readFileSync(workerPath, "utf8")
        .replace(
          /const RELEASE = "[a-f0-9]+";/,
          `const RELEASE = "${release}";`,
        ),
    );
    console.log("Browser assets ready: " + release);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
