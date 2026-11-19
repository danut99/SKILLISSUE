// Cloudflare Pages middleware: the old address forwards to the new one, keeping
// the path and query (browsers keep the #hash too), so old TikTok/bio links work.
const OLD_HOST = 'playskillissue.pages.dev';
const NEW_ORIGIN = 'https://skilly.pages.dev';

interface Context { request: Request; next: () => Promise<Response> }

export const onRequest = async ({ request, next }: Context): Promise<Response> => {
  const url = new URL(request.url);
  // Also covers preview/branch subdomains of the old project (e.g. abc123.playskillissue.pages.dev).
  if (url.hostname === OLD_HOST || url.hostname.endsWith(`.${OLD_HOST}`)) {
    return Response.redirect(`${NEW_ORIGIN}${url.pathname}${url.search}`, 301);
  }
  return next();
};
