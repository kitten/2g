const fs = require("fs");
const path = require("path");

const platformArgs = [
  "-lc++"
];

if (process.platform === "darwin") {
  platformArgs.push(
    "-framework",
    "CoreFoundation",
    "-framework",
    "QuartzCore",
    "-framework",
    "Cocoa",
    "-framework",
    "IOKit",
    "-framework",
    "Metal",
    "-framework",
    "MetalKit",
    "-lm",
    "-liconv",
    "-lobjc"
  );
} else if (process.platform === "linux") {
  platformArgs.push("-lm", "-ldl", "-lpthread", "-lrt");
} else if (process.platform === "win32") {
  platformArgs.push(
    "-lopengl32",
    "-lgdi32",
    "-winmm",
    "-limm32",
    "-lole32",
    "-loleaut32",
    "-lversion"
  );
} else {
  console.error("Platform not supported: " + process.platform);
  process.exit(1);
}

const bsconfig = {
  name: "2g-gfx",
  sources: {
    dir: "src",
    files: ["TwoG_Gfx.re"]
  },
  "c-linker-flags": platformArgs,
  "allowed-build-kinds": ["bytecode", "native"],
  "build-script": "scripts/build-2g-gfx.re",
  "bs-dependencies": ["bs-glsl-optimizer"],
  refmt: 3
};

const json = JSON.stringify(bsconfig, null, 2);
const output = path.join(__dirname, "../bsconfig.json");

fs.writeFileSync(output, json);
