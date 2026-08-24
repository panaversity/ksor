import { getLLMText, getMachinePages } from "@/lib/source";
import { stampLines } from "@/lib/governance";
import { appName, appTitle } from "@/lib/shared";
import { readStageManifest } from "@/lib/stage-manifest";

export const revalidate = false;

/**
 * The whole machine-admitted record in one file, opened by the stamps that
 * connect it to one publication (R14) — so a consumer holding a copy can say
 * which build it came from — then every document with its own governance
 * block, exactly as its twin serves it.
 */
export async function GET(): Promise<Response> {
  const head = `---\ntitle: ${JSON.stringify(appTitle)}\nname: ${appName}\n${stampLines(readStageManifest().stamps).join("\n")}\n---`;
  const scanned = await Promise.all(getMachinePages().map((page) => getLLMText(page)));
  return new Response([head, ...scanned].join("\n\n"));
}
