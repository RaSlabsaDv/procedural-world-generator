// Complete production-factory water matrix with reed contribution/resource checks.
process.argv.push("--reeds");
require("./inland-water.cjs");
