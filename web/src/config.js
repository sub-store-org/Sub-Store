const DEBUG = process.env.NODE_ENV === "development";
export const BACKEND_BASE = DEBUG ? `http://localhost:3000` : `https://sub.store`;