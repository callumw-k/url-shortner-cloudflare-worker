import Sqids from 'sqids';
/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

interface Env {
	short_urls: KVNamespace;
	SECRET_KEY: string;
	DB: D1Database;
}

const squids = new Sqids({ alphabet: 'abcdefghijklmnopqrstuvwxyz0123456789' });

async function createDbEntry(env: Env, url: string) {
	const res = await env.DB.prepare('insert into Links (url) values (?)').bind(url).run();
	return res.meta.last_row_id;
}

async function getOriginalUrl(env: Env, pathname: string) {
	const shortUrl = pathname.slice(1);
	const [id] = squids.decode(shortUrl);
	const res = await env.DB.prepare('select url from Links where id = ?').bind(id).first<{ url: string }>();
	return res?.url;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// This is the url that is requested
		const incomingUrl = new URL(request.url);
		const pathname = incomingUrl.pathname;
		const params = incomingUrl.searchParams;

		if (pathname === '/') return new Response('url shortner');

		if (pathname === '/favicon.ico') return new Response(null, { status: 404 });

		const createKey = params.get('key');
		if (pathname === '/create') {
			if (createKey !== env.SECRET_KEY) return new Response('No key provided');
			const url = params.get('url');
			if (url) {
				const id = await createDbEntry(env, url);
				const shortUrl = squids.encode([id]);
				return new Response(`Short url created /${shortUrl}`);
			}
		}

		const redirectUrl = await getOriginalUrl(env, pathname);

		if (redirectUrl) {
			return Response.redirect(redirectUrl, 302);
		}

		return new Response(`<html><p>There is no url defined for the following ${pathname}</p></html>`);
	},
};
