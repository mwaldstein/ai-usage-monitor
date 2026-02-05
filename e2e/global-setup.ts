import fs from "fs/promises";
import path from "path";

const E2E_DATA_DIR = path.join(process.cwd(), ".tmp", "e2e-data");
const LEGACY_BACKEND_DATA_DIR = path.join(process.cwd(), "backend", ".tmp", "e2e-data");

async function globalSetup(): Promise<void> {
  await fs.rm(LEGACY_BACKEND_DATA_DIR, { recursive: true, force: true });
  await fs.rm(E2E_DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(E2E_DATA_DIR, { recursive: true });
}

export default globalSetup;
