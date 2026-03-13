import { readFileSync } from "node:fs";

function getReleaseTag() {
  const direct = process.env.GITHUB_REF_NAME?.trim();
  if (direct) {
    return direct;
  }

  const fallback = process.env.npm_package_version?.trim();
  return fallback ? `v${fallback}` : "";
}

const tag = getReleaseTag();

if (!tag) {
  console.error("Release version check failed: missing GITHUB_REF_NAME.");
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const tagVersion = tag.startsWith("v") ? tag.slice(1) : tag;
const packageVersion = typeof packageJson.version === "string" ? packageJson.version : "";

if (tagVersion !== packageVersion) {
  console.error(
    `Release version mismatch: tag ${tag} does not match package.json version ${packageVersion}.`,
  );
  process.exit(1);
}

console.log(`Release version verified: ${tag} matches package.json version ${packageVersion}.`);
