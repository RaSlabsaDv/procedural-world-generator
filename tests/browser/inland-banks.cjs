// Reuse the complete inland-water matrix with additional material/pixel checks.
process.argv.push("--banks");
require("./inland-water.cjs");
