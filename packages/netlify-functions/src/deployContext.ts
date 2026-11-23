export const DEPLOY_CONTEXTS = [
  "production",
  "deploy-preview",
  "branch-deploy",
  "dev",
] as const;

export type DeployContext = (typeof DEPLOY_CONTEXTS)[number];

// The part of the handler's second argument that carries the deploy context.
export type NetlifyFunctionContext = {
  deploy?: { context?: string };
};

function isDeployContext(value: string): value is DeployContext {
  return (DEPLOY_CONTEXTS as readonly string[]).includes(value);
}

// Netlify's runtime env does not carry the build's CONTEXT, so the handler
// argument is the only source. Guessing a default could load the wrong env
// file, so a missing or unknown value throws.
export function resolveDeployContext(
  context: NetlifyFunctionContext | undefined,
): DeployContext {
  const value = context?.deploy?.context;
  if (!value) {
    throw new Error(
      "resolveDeployContext: the function context has no deploy context.",
    );
  }
  if (!isDeployContext(value)) {
    throw new Error(`resolveDeployContext: unknown deploy context "${value}".`);
  }
  return value;
}
