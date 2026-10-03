import '../src/env.ts';
import { config } from '../src/config.ts';
import { createProvider } from '../src/llm/provider.ts';

const { vectors } = await createProvider(config()).embedQuery('ping', Date.now() + 15_000);
console.log(vectors[0]?.length ?? 0);
