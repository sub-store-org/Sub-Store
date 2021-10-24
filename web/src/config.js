const DEBUG = process.env.NODE_ENV === 'development';
const domain = process.env.DOMIAN || 'https://sub.store';
export const BACKEND_BASE = DEBUG ? `http://localhost:3000` : domain;
// export const BACKEND_BASE = DEBUG ? `https://sub.store:9999` : `https://sub.store`;
