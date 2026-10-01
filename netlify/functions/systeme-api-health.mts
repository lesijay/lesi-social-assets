function netlifyGlobal(): any {
  return (globalThis as any).Netlify;
}

function env(name: string): string | undefined {
  return netlifyGlobal()?.env?.get?.(name);
}

export default async () => {
  const apiKey = env("SYSTEME_API_KEY");
  if (!apiKey) {
    return Response.json({
      worker: "systeme-email",
      apiReady: false,
      envPresent: false,
      reason: "missing_systeme_api_key"
    }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.systeme.io/api/tags?limit=1", {
      headers: { "X-API-Key": apiKey }
    });

    return Response.json({
      worker: "systeme-email",
      apiReady: response.ok,
      envPresent: true,
      upstreamStatus: response.status,
      reason: response.ok ? null : "systeme_api_rejected_request"
    }, { status: response.ok ? 200 : 502 });
  } catch {
    return Response.json({
      worker: "systeme-email",
      apiReady: false,
      envPresent: true,
      reason: "systeme_api_unreachable"
    }, { status: 502 });
  }
};

export const config = {
  path: "/hill/systeme-health"
};
