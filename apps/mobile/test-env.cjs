// test-env.js
import { config } from 'dotenv';

// Carga manualmente el .env.development
config({ path: '.env.development' });

console.log('APP_ENV:', process.env.APP_ENV);
console.log('API_URL:', process.env.API_URL);
