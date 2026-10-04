import './config/env.ts';
import { buildApp } from './app.ts';
import { config } from './config/config.ts';

const cfg = config();
const app = await buildApp({ config: cfg });
await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
