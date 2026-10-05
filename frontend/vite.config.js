import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Serves api/chat.js at /api/chat during `npm run dev`, the same way Vercel
// serves it in production, so the AI chat works locally too.
function apiDevServer() {
    return {
        name: 'api-dev-server',
        configureServer(server) {
            server.middlewares.use('/api/chat', async (req, res) => {
                try {
                    if (req.method !== 'POST') {
                        res.statusCode = 405;
                        res.end('Method not allowed');
                        return;
                    }
                    const chunks = [];
                    for await (const chunk of req) chunks.push(chunk);
                    const { POST } = await server.ssrLoadModule('/api/chat.js');
                    const response = await POST(new Request('http://localhost/api/chat', {
                        method: 'POST',
                        headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
                        body: Buffer.concat(chunks),
                    }));
                    res.statusCode = response.status;
                    response.headers.forEach((value, key) => res.setHeader(key, value));
                    res.end(Buffer.from(await response.arrayBuffer()));
                } catch (err) {
                    console.error(err);
                    res.statusCode = 500;
                    res.end('Server error');
                }
            });
        },
    };
}

export default defineConfig(({ mode }) => {
    // Make .env values (GEMINI_API_KEY, GEMINI_MODEL) visible to api/chat.js in
    // dev. These never reach the browser bundle: only VITE_-prefixed vars do.
    Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

    return {
        // Relative asset paths, so dist/ works from any folder or sub-URL (e.g. GitHub Pages).
        base: './',
        plugins: [react(), apiDevServer()],
    };
});
