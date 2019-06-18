const fs = require("fs");
const path = require("path");

const platformArgs = [];

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
  name: "g2platform",
  sources: "src",
  "c-linker-flags": platformArgs,
  "allowed-build-kinds": ["bytecode", "native"],
  refmt: 3
};

const json = JSON.stringify(bsconfig, null, 2);

fs.writeFileSync(path.join(__dirname, "bsconfig.json"), json);
